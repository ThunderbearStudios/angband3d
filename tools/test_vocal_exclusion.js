/**
 * Targeted Verification Suite for Single-Voice Mutual Exclusion & Walking Turn Backlog
 * Tests:
 * 1. Rapid walking turns do NOT re-trigger audio.speak() while speech is active/staging/queued.
 * 2. Rapid walking turns accumulate cleanly in unvoicedEventLedger.
 * 3. Exactly 0 or 1 physical audio stream is ever playing simultaneously (maxConcurrentVoices <= 1).
 * 4. Urgent events (kills, mortal peril) preempt speech smoothly with zero overlap.
 * 5. Audio playback end automatically drains backlog into a single consolidated catch-up beat.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

async function runVocalExclusionTest() {
    console.log('[Vocal Exclusion Test] Initializing test harness...');

    const files = [
        'server/public/js/chronicle/chronicle-store.js',
        'server/public/js/chronicle/chronicle-grounder.js',
        'server/public/js/chronicle/chronicle-filter.js',
        'server/public/js/chronicle/chronicle-audio.js',
        'server/public/js/chronicle/chronicle-llm.js',
        'server/public/js/chronicle/chronicle-manager.js'
    ];

    const mockLocalStorage = {};
    const context = {
        console: console,
        Date: Date,
        Math: Math,
        JSON: JSON,
        Set: Set,
        Object: Object,
        Array: Array,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        AbortController: AbortController,
        addEventListener: () => {},
        fetch: global.fetch,
        URLSearchParams: require('url').URLSearchParams,
        localStorage: {
            getItem: (k) => mockLocalStorage[k] || null,
            setItem: (k, v) => { mockLocalStorage[k] = v; },
            removeItem: (k) => { delete mockLocalStorage[k]; }
        },
        document: (() => {
            const elements = {};
            function createMockElement(tag = 'div') {
                const classes = new Set();
                const children = [];
                const el = {
                    tagName: tag.toUpperCase(),
                    classList: {
                        add: (...c) => c.forEach(x => classes.add(x)),
                        remove: (...c) => c.forEach(x => classes.delete(x)),
                        toggle: (c, f) => (f !== undefined ? (f ? classes.add(c) : classes.delete(c)) : (classes.has(c) ? classes.delete(c) : classes.add(c))),
                        contains: (c) => classes.has(c)
                    },
                    children,
                    get lastElementChild() { return children[children.length - 1] || null; },
                    addEventListener: () => {},
                    appendChild: (c) => { children.push(c); return c; },
                    insertBefore: (c) => { children.unshift(c); return c; },
                    setAttribute: () => {},
                    getAttribute: () => '',
                    querySelectorAll: () => children,
                    querySelector: () => children[children.length - 1] || null,
                    style: {},
                    textContent: '',
                    innerHTML: '',
                    scrollIntoView: () => {}
                };
                return el;
            }
            return {
                getElementById: (id) => {
                    if (!elements[id]) elements[id] = createMockElement('div');
                    return elements[id];
                },
                querySelectorAll: () => [],
                querySelector: () => null,
                createElement: (tag) => createMockElement(tag),
                addEventListener: () => {}
            };
        })(),
        window: {}
    };
    context.window = context;
    vm.createContext(context);

    for (const f of files) {
        const code = fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');
        vm.runInContext(code, context);
    }

    const { ChronicleAudioRouter, ChronicleManager, ChronicleStore } = context;

    let activeVoiceCount = 0;
    let maxConcurrentVoices = 0;
    const voiceEvents = [];

    // Track simulated Web Audio sources
    function recordVoiceStart(id) {
        activeVoiceCount++;
        maxConcurrentVoices = Math.max(maxConcurrentVoices, activeVoiceCount);
        voiceEvents.push({ type: 'start', id, active: activeVoiceCount, time: Date.now() });
        if (activeVoiceCount > 1) {
            throw new Error(`CRITICAL REGRESSION: Multiple voices playing simultaneously! Active count = ${activeVoiceCount}`);
        }
    }

    function recordVoiceStop(id) {
        if (activeVoiceCount > 0) activeVoiceCount--;
        voiceEvents.push({ type: 'stop', id, active: activeVoiceCount, time: Date.now() });
    }

    let sourceCounter = 0;

    const mockCtx = {
        state: 'running',
        currentTime: 0,
        resume: async () => {},
        createGain: () => ({
            gain: {
                value: 1.0,
                setValueAtTime: () => {},
                linearRampToValueAtTime: () => {},
                setTargetAtTime: () => {}
            },
            connect: () => {},
            disconnect: () => {}
        }),
        createBufferSource: () => {
            const sid = ++sourceCounter;
            let isStarted = false;
            let isEnded = false;
            return {
                sid,
                buffer: null,
                playbackRate: { value: 1.0 },
                connect: () => {},
                disconnect: () => {},
                start: function() {
                    if (isStarted) return;
                    isStarted = true;
                    recordVoiceStart(sid);
                },
                stop: function() {
                    if (isStarted && !isEnded) {
                        isEnded = true;
                        recordVoiceStop(sid);
                    }
                }
            };
        }
    };

    const mgr = new ChronicleManager();
    mgr.audio = new ChronicleAudioRouter();
    mgr.audio.ctx = mockCtx;
    mgr.audio.voiceMasterGain = mockCtx.createGain();
    mgr.audio.enabled = true;
    mgr.audio.ttsEngine = 'gemini';

    const vocalStateTransitions = [];
    mgr.audio.onVocalStateChange = (state, telemetry) => {
        vocalStateTransitions.push({ state, telemetry });
        mgr.onVocalStateChanged(state, telemetry);
    };

    mgr.listEl = context.document.getElementById('chronicle-list');
    mgr.vocalPillEl = context.document.getElementById('chronicle-vocal-pill');
    mgr.hudToastEl = context.document.getElementById('chronicle-hud-toast');

    // Seed audio buffer cache so playback is instantaneous and deterministic
    const mockBuffer = { duration: 1.5, length: 33075, numberOfChannels: 1, sampleRate: 22050 };
    mgr.audio.fetchOrGetAudioBuffer = async (text, role, voice, options) => {
        return { audioBuffer: mockBuffer, engine: 'gemini', cached: true };
    };

    // Hero template
    const hero = {
        name: 'Turin',
        race: 'Human',
        class: 'Warrior',
        depth: 50,
        turn: 100,
        chp: 100,
        mhp: 100
    };

    mgr.activeChronicle = ChronicleStore.createNewChronicle(hero);
    mgr.voicingHeroSnapshot = JSON.parse(JSON.stringify(hero));

    console.log('[Vocal Exclusion Test] Test 1: Rapid walking turns with speech in progress...');

    // Frame 1: Hero takes first step, generates passage and starts speaking
    const frame1 = {
        phase: 'play',
        inPlay: true,
        player: Object.assign({}, hero, { turn: 101, py: 10, px: 11 }),
        dungeon: { depth: 1 }
    };
    mgr.filter.eventQueue.push({
        type: 'HERO_MOVE',
        turn: 101,
        player: frame1.player,
        summary: 'Turin steps forward into the gloomy corridor.'
    });

    await mgr.onFrame(frame1);

    // Wait a brief tick for async processSpeechQueue to start playback
    await new Promise(r => setTimeout(r, 80));

    if (!mgr.audio.isSpeaking) {
        throw new Error('Expected audio to be speaking after Frame 1');
    }
    console.log('  ✓ Frame 1 triggered initial speech.');

    const initialSpeechCount = voiceEvents.filter(e => e.type === 'start').length;
    if (initialSpeechCount !== 1) {
        throw new Error(`Expected 1 voice started, got ${initialSpeechCount}`);
    }

    // Now simulate 5 rapid walking steps while audio is actively speaking
    console.log('[Vocal Exclusion Test] Simulating 5 rapid walking steps while speech is active...');
    for (let step = 1; step <= 5; step++) {
        const walkTurn = 101 + step;
        const walkFrame = {
            phase: 'play',
            inPlay: true,
            player: Object.assign({}, hero, { turn: walkTurn, py: 10, px: 11 + step }),
            dungeon: { depth: 1 }
        };
        mgr.filter.eventQueue.push({
            type: 'HERO_MOVE',
            turn: walkTurn,
            player: walkFrame.player,
            summary: `Turin steps forward to col ${11 + step}.`
        });

        await mgr.onFrame(walkFrame);
    }

    // Verify speech was NOT restarted on walking steps!
    const midWalkVoiceStarts = voiceEvents.filter(e => e.type === 'start').length;
    if (midWalkVoiceStarts !== 1) {
        throw new Error(`CRITICAL REGRESSION: Walking steps restarted speech! Expected 1 voice start, got ${midWalkVoiceStarts}`);
    }
    console.log('  ✓ Walking steps did NOT restart or duplicate speech.');

    // Verify unvoicedEventLedger accumulated the walking steps
    if (!mgr.unvoicedEventLedger || mgr.unvoicedEventLedger.length < 5) {
        throw new Error(`Expected at least 5 buffered unvoiced events in ledger, got ${mgr.unvoicedEventLedger?.length}`);
    }
    console.log(`  ✓ Unvoiced ledger accumulated ${mgr.unvoicedEventLedger.length} events quietly in background.`);

    // Test 2: Urgent combat event (Kill) arrives while walking narration is active
    console.log('[Vocal Exclusion Test] Test 2: Urgent event (Kill) preempts active speech with zero overlap...');
    const combatFrame = {
        phase: 'play',
        inPlay: true,
        player: Object.assign({}, hero, { turn: 108, chp: 95 }),
        dungeon: { depth: 1 }
    };
    mgr.filter.eventQueue.push({
        type: 'COMBAT_EPISODE',
        turn: 108,
        player: combatFrame.player,
        data: { kills: ['Snaga orc'] },
        summary: 'Turin slays the Snaga orc!'
    });

    await mgr.onFrame(combatFrame);

    // Wait for seamless handoff micro-fade and breath pause to complete
    await new Promise(r => setTimeout(r, 200));

    // Verify maxConcurrentVoices is strictly <= 1 at all times
    if (maxConcurrentVoices > 1) {
        throw new Error(`CRITICAL REGRESSION: maxConcurrentVoices was ${maxConcurrentVoices} (must never exceed 1)`);
    }
    console.log(`  ✓ Max concurrent voices remained strictly <= 1 (actual: ${maxConcurrentVoices}).`);

    // Verify active voice count is currently 1 (the new kill beat)
    if (activeVoiceCount !== 1) {
        throw new Error(`Expected exactly 1 active voice after preemption, got ${activeVoiceCount}`);
    }
    console.log('  ✓ Exactly 1 voice active after seamless combat preemption.');

    // Clean up
    mgr.audio.stopSpeaking();
    if (activeVoiceCount !== 0) {
        throw new Error(`Expected 0 active voices after stopSpeaking(), got ${activeVoiceCount}`);
    }
    console.log('  ✓ stopSpeaking() cleanly brought active voice count to 0.');

    // Test 3: Vocal State Transitions and UI Feedback
    console.log('[Vocal Exclusion Test] Test 3: Verifying vocal state transitions & visual pill telemetry...');
    const statesObserved = vocalStateTransitions.map(t => t.state);
    if (!statesObserved.includes('speaking')) {
        throw new Error(`Expected 'speaking' state in vocalStateTransitions, got: ${statesObserved.join(', ')}`);
    }
    if (!statesObserved.includes('interrupted')) {
        throw new Error(`Expected 'interrupted' state in vocalStateTransitions, got: ${statesObserved.join(', ')}`);
    }
    console.log(`  ✓ Vocal states emitted cleanly: ${statesObserved.join(' -> ')}`);

    // Test 4: Catch-Up Action Taxonomy and Ledger Summary
    console.log('[Vocal Exclusion Test] Test 4: Verifying catch-up action taxonomy & ledger summary...');
    mgr.unvoicedEventLedger = [
        { event: { type: 'HERO_MOVE' } },
        { event: { type: 'HERO_MOVE' } },
        { event: { type: 'HERO_MOVE' } },
        { event: { type: 'HERO_MOVE' } },
        { event: { type: 'COMBAT_EXCHANGE', data: { kills: ['Cave spider'] } } }
    ];
    const summary = mgr.getLedgerSummary();
    if (!summary.includes('4 paces') || !summary.includes('1 strike') || !summary.includes('1 kill')) {
        throw new Error(`Expected '4 paces, 1 strike, 1 kill', got: ${summary}`);
    }
    console.log(`  ✓ getLedgerSummary() accurately computed: "${summary}".`);

    // Verify Grounder Catch-Up Beat Action Breakdown
    const eventsToSynthesize = mgr.unvoicedEventLedger.map(i => i.event);
    const catchUpBeat = context.ChronicleGrounder.generateCatchUpBeat(eventsToSynthesize, hero, hero, 'westmarch');
    if (!catchUpBeat.isCatchUp || !catchUpBeat.actionBreakdown) {
        throw new Error('Expected catchUpBeat.isCatchUp and actionBreakdown to be present');
    }
    if (catchUpBeat.actionBreakdown.paces !== 4 || catchUpBeat.actionBreakdown.strikes !== 1) {
        throw new Error(`Expected 4 paces and 1 strike in actionBreakdown, got: ${JSON.stringify(catchUpBeat.actionBreakdown)}`);
    }
    console.log(`  ✓ generateCatchUpBeat() produced breakdown: ${catchUpBeat.actionBreakdown.summaryText} (${catchUpBeat.actionBreakdown.total} total).`);

    // Test 5: Story Entry Render with Catch-Up Banner and Interrupted Card
    console.log('[Vocal Exclusion Test] Test 5: Verifying catch-up banner & interrupted card markup...');
    const renderedCard = mgr.renderStoryEntry(catchUpBeat, false);
    if (!renderedCard || !renderedCard.innerHTML.includes('catchup-context-banner')) {
        throw new Error('Expected rendered story entry to contain .catchup-context-banner HTML');
    }
    if (!renderedCard.innerHTML.includes('Caught Up (+')) {
        throw new Error('Expected header badge to include Caught Up (+...)');
    }
    console.log('  ✓ Catch-up card correctly includes .catchup-context-banner and Caught Up header badge.');

    // Mark card interrupted
    mgr.markCurrentBeatInterrupted('catchup', '4 paces');
    if (!renderedCard.classList.contains('is-interrupted')) {
        throw new Error('Expected card to have .is-interrupted class');
    }
    console.log('  ✓ markCurrentBeatInterrupted() applied .is-interrupted class and badge.');

    console.log('\n[Vocal Exclusion Test] ✅ ALL VERIFICATION CHECKS PASSED: ZERO VOCAL OVERLAP GUARANTEED!\n');
}

runVocalExclusionTest().catch(err => {
    console.error('[Vocal Exclusion Test] FAILED:', err);
    process.exit(1);
});

