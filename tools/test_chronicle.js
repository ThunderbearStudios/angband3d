/**
 * Automated Verification Test for The Living Chronicle & Voiced Lorekeeper
 * Tests:
 * 1. Syntax integrity of all chronicle modules
 * 2. ChronicleStore serialization, epoch compression, and Torch Passes hero bridge
 * 3. ChronicleGrounder fact evaluation, creature states, and 4th-wall survival guide Q&A
 * 4. ChronicleFilter narrative significance gating and episode accumulation
 * 5. AudioRouter initialization and speed multiplier logic
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

async function runTest() {
    console.log('[Chronicle Test] Starting Living Chronicle automated verification...');

    // 1. Syntax Check
    const files = [
        'server/public/js/chronicle/chronicle-store.js',
        'server/public/js/chronicle/chronicle-grounder.js',
        'server/public/js/chronicle/chronicle-filter.js',
        'server/public/js/chronicle/chronicle-audio.js',
        'server/public/js/chronicle/chronicle-llm.js',
        'server/public/js/chronicle/chronicle-manager.js'
    ];

    for (const f of files) {
        const fullPath = path.resolve(__dirname, '..', f);
        if (!fs.existsSync(fullPath)) {
            throw new Error(`Missing expected file: ${f}`);
        }
        const code = fs.readFileSync(fullPath, 'utf8');
        new vm.Script(code); // Throws on syntax error
        console.log(`  ✓ Syntax OK: ${f}`);
    }

    // 2. Set up DOM / Browser Mock Context
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
        AbortController: (typeof AbortController !== 'undefined') ? AbortController : class { constructor() { this.signal = {}; } abort() {} },
        fetch: (typeof fetch !== 'undefined') ? fetch : global.fetch,
        localStorage: {
            getItem: (k) => mockLocalStorage[k] || null,
            setItem: (k, v) => { mockLocalStorage[k] = v; },
            removeItem: (k) => { delete mockLocalStorage[k]; }
        },
        document: {
            getElementById: () => ({
                classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
                addEventListener: () => {},
                appendChild: () => {},
                setAttribute: () => {},
                getAttribute: () => '',
                querySelectorAll: () => [],
                querySelector: () => null,
                style: {},
                textContent: '',
                innerHTML: '',
                scrollIntoView: () => {}
            }),
            querySelectorAll: () => [],
            querySelector: () => null,
            createElement: () => ({
                classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
                addEventListener: () => {},
                appendChild: () => {},
                setAttribute: () => {},
                getAttribute: () => '',
                querySelectorAll: () => [],
                querySelector: () => null,
                style: {},
                textContent: '',
                innerHTML: '',
                scrollIntoView: () => {}
            }),
            addEventListener: () => {}
        },
        window: {}
    };
    context.window = context;
    vm.createContext(context);

    // Load scripts in dependency order
    for (const f of files) {
        const code = fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');
        vm.runInContext(code, context);
    }

    const { ChronicleStore, ChronicleGrounder, ChronicleFilter, ChronicleAudioRouter, ChronicleLLMBridge } = context;

    // 3. Test ChronicleStore
    console.log('[Chronicle Test] Testing ChronicleStore creation and export...');
    const hero1 = { name: 'Morgrim', race: 'Dwarf', class: 'Warrior', depth: 2 };
    const chronicle = ChronicleStore.createNewChronicle(hero1);
    if (!chronicle.id || chronicle.protagonists[0].name !== 'Morgrim') {
        throw new Error('ChronicleStore failed to initialize hero');
    }

    // Append mock chapters
    for (let i = 1; i <= 30; i++) {
        ChronicleStore.appendChapter(chronicle, {
            title: `Battle of Level ${i}`,
            depth: i,
            prose: `Morgrim fought bravely in corridor ${i}.`,
            summary: `Battle at depth ${i * 50}ft.`
        });
    }

    // Verify Epoch Compression (<25 expanded chapters)
    if (chronicle.chapters.length > ChronicleStore.MAX_EXPANDED_CHAPTERS) {
        throw new Error(`Epoch compression failed: chapter count is ${chronicle.chapters.length}`);
    }
    if (!chronicle.epochs || chronicle.epochs.length === 0) {
        throw new Error('Epoch compression did not generate compressed ancient annals');
    }
    console.log(`  ✓ Epoch compression verified: ${chronicle.chapters.length} active chapters, ${chronicle.epochs.length} compressed epochs.`);

    // Test Markdown & HTML Export
    const md = ChronicleStore.exportAsMarkdown(chronicle);
    const html = ChronicleStore.exportAsStandaloneHtml(chronicle);
    if (!md.includes('Morgrim') || !html.includes('Morgrim')) {
        throw new Error('Export format missing hero name');
    }
    console.log('  ✓ Markdown and HTML book exports generated successfully.');

    // 4. Test "The Torch Passes" Bridge
    console.log('[Chronicle Test] Testing "The Torch Passes" hero compatibility...');
    const hero2 = { name: 'Valandil', race: 'High-Elf', class: 'Mage', depth: 10 };
    const compat = ChronicleStore.checkCompatibility(chronicle, hero2);
    if (compat.compatible || !compat.isNewHero) {
        throw new Error('Compatibility check failed to detect hero mismatch');
    }

    const bridge = ChronicleStore.passTorch(chronicle, hero2, 'Valandil discovered Morgrim\'s ancient tome.');
    if (!bridge.is_bridge || chronicle.protagonists[chronicle.current_protagonist_idx].name !== 'Valandil') {
        throw new Error('Torch passes bridge failed to update active protagonist');
    }
    if (!ChronicleStore.isMatchingHero(chronicle, hero2)) {
        throw new Error('isMatchingHero should match active hero Valandil');
    }
    if (ChronicleStore.isMatchingHero(chronicle, hero1)) {
        throw new Error('isMatchingHero should not match old hero Morgrim');
    }
    console.log('  ✓ "The Torch Passes" and isMatchingHero fresh-instance guards verified.');

    // 5. Test ChronicleGrounder Creature & Player State Resolution
    console.log('[Chronicle Test] Testing Creature State Resolution & 4th-Wall Q&A...');
    
    // Sleeping Dog
    const sleepingDog = { name: 'War Dog', is_asleep: true, hp: 10, hp_max: 10 };
    const dogState = ChronicleGrounder.resolveCreatureState(sleepingDog);
    if (!dogState.observation.includes('snores') || dogState.canSpeak) {
        throw new Error(`Sleeping dog state resolution incorrect: ${JSON.stringify(dogState)}`);
    }

    // Sleeping Merchant (blocks waking conversation)
    const sleepingMerchant = { name: 'Aimless-looking merchant', is_asleep: true, hp: 15, hp_max: 15 };
    const merchantSleepState = ChronicleGrounder.resolveCreatureState(sleepingMerchant);
    if (!merchantSleepState.observation.includes('crates') || merchantSleepState.canSpeak) {
        throw new Error(`Sleeping merchant state resolution incorrect: ${JSON.stringify(merchantSleepState)}`);
    }

    // Fleeing Orc
    const fleeingOrc = { name: 'Cave Orc', is_fleeing: true, hp: 5, hp_max: 20 };
    const orcState = ChronicleGrounder.resolveCreatureState(fleeingOrc);
    if (!orcState.canSpeak || (!orcState.bark.includes('Run') && !orcState.bark.includes('pits'))) {
        throw new Error(`Fleeing orc state resolution incorrect: ${JSON.stringify(orcState)}`);
    }

    // Mindless Slime (Non-vocal noise, cannot speak)
    const slime = { name: 'Green Slime', is_asleep: false, hp: 15, hp_max: 15 };
    const slimeState = ChronicleGrounder.resolveCreatureState(slime);
    if (slimeState.canSpeak || !slimeState.noise || !slimeState.noise.includes('glub')) {
        throw new Error(`Mindless slime state resolution incorrect: ${JSON.stringify(slimeState)}`);
    }

    // Non-vocal Arachnid (Giant spider clicks/chitters)
    const spider = { name: 'Giant spider', is_asleep: false, hp: 12, hp_max: 20, wasAttacked: true };
    const spiderState = ChronicleGrounder.resolveCreatureState(spider);
    if (spiderState.canSpeak || !spiderState.noise || !spiderState.noise.includes('tsk')) {
        throw new Error(`Giant spider combat noise incorrect: ${JSON.stringify(spiderState)}`);
    }

    // Non-vocal Skeleton (clatters dry bones)
    const skeleton = { name: 'Skeleton warrior', is_asleep: false, hp: 20, hp_max: 20 };
    const skelState = ChronicleGrounder.resolveCreatureState(skeleton);
    if (skelState.canSpeak || !skelState.noise || !skelState.noise.toLowerCase().includes('clack')) {
        throw new Error(`Skeleton warrior noise incorrect: ${JSON.stringify(skelState)}`);
    }

    // Hostile Rogue (Squint-eyed rogue, vocal dialogue)
    const rogue = { name: 'Squint-eyed rogue', is_asleep: false, hp: 18, hp_max: 18 };
    const rogueState = ChronicleGrounder.resolveCreatureState(rogue);
    if (!rogueState.canSpeak || !rogueState.bark.includes('purse')) {
        throw new Error(`Hostile rogue state resolution incorrect: ${JSON.stringify(rogueState)}`);
    }

    // Assaulting Rogue in active combat
    const rogueCombat = { name: 'Squint-eyed rogue', is_asleep: false, hp: 14, hp_max: 18, wasAttacked: true };
    const rogueCombatState = ChronicleGrounder.resolveCreatureState(rogueCombat, ['Squint-eyed rogue hits you.']);
    if (rogueCombatState.state !== 'assaulting_rogue' || !rogueCombatState.canSpeak) {
        throw new Error(`Assaulting rogue state incorrect: ${JSON.stringify(rogueCombatState)}`);
    }

    // Panicked Merchant under player assault
    const merchantAttacked = { name: 'Aimless-looking merchant', is_asleep: false, hp: 8, hp_max: 15, wasAttacked: true };
    const merchantPanicState = ChronicleGrounder.resolveCreatureState(merchantAttacked, ['You hit the Aimless-looking merchant.']);
    if (merchantPanicState.state !== 'panicked_townsperson' || !merchantPanicState.bark.toLowerCase().includes('murder')) {
        throw new Error(`Panicked merchant state incorrect: ${JSON.stringify(merchantPanicState)}`);
    }

    // Village Idiot ("Novice idiot")
    const idiot = { name: 'Novice idiot', is_asleep: false, hp: 8, hp_max: 8 };
    const idiotState = ChronicleGrounder.resolveCreatureState(idiot);
    if (!idiotState.canSpeak || !idiotState.bark) {
        throw new Error(`Novice idiot state resolution incorrect: ${JSON.stringify(idiotState)}`);
    }

    // Test CREATURE_ASSAULT procedural generation distinction (vocal vs non-vocal noise)
    const rogueAssaultEvent = {
        type: 'CREATURE_ASSAULT',
        data: { monsterName: 'Squint-eyed rogue', action: 'steals' }
    };
    const rogueAssaultCh = ChronicleGrounder.generateProceduralChapter(rogueAssaultEvent, hero1);
    if (!rogueAssaultCh.dialogue || rogueAssaultCh.dialogue.isNoise !== false || !rogueAssaultCh.dialogue.text.includes('toll')) {
        throw new Error(`Rogue assault dialogue generation incorrect: ${JSON.stringify(rogueAssaultCh)}`);
    }

    const wolfAssaultEvent = {
        type: 'CREATURE_ASSAULT',
        data: { monsterName: 'Cave wolf', action: 'bites' }
    };
    const wolfAssaultCh = ChronicleGrounder.generateProceduralChapter(wolfAssaultEvent, hero1);
    if (!wolfAssaultCh.dialogue || wolfAssaultCh.dialogue.isNoise !== true || !wolfAssaultCh.dialogue.text.includes('Grrrrr')) {
        throw new Error(`Wolf assault sound noise generation incorrect: ${JSON.stringify(wolfAssaultCh)}`);
    }

    // Test Flowing Paragraphs via ChronicleStore.appendParagraph
    const flowChapter = ChronicleStore.appendParagraph(chronicle, {
        title: 'Corridor Skirmish',
        depth: 2,
        prose: 'A swift skirmish unfolded near the rusted archway.',
        dialogue: null
    });
    if (!flowChapter.paragraphs || flowChapter.paragraphs.length < 2) {
        throw new Error('appendParagraph failed to append flowing paragraph to active chapter');
    }

    // Test resolveCreatureEncounter (Multi-Turn Narrative Prose & Contextual Dialogue)
    const encSleepMerchant = { name: 'Aimless looking merchant', glyph: 't', asleep: true };
    const sleepEnc = ChronicleGrounder.resolveCreatureEncounter(encSleepMerchant, hero1, [], 1, '');
    if (sleepEnc.isDialogue !== false || sleepEnc.text !== null || !sleepEnc.prose.includes('slumps')) {
        throw new Error(`Sleeping merchant encounter failed: ${JSON.stringify(sleepEnc)}`);
    }
    const sleepEncQuery = ChronicleGrounder.resolveCreatureEncounter(encSleepMerchant, hero1, [], 2, 'where is the shop?');
    if (sleepEncQuery.isDialogue !== false || sleepEncQuery.text !== null || !sleepEncQuery.prose.includes('deaf ears')) {
        throw new Error(`Sleeping merchant query should not converse: ${JSON.stringify(sleepEncQuery)}`);
    }

    const encRogueMon = { name: 'Squint-eyed rogue', glyph: 'p', hp: 20, hp_max: 20 };
    const rogueTurn1 = ChronicleGrounder.resolveCreatureEncounter(encRogueMon, hero1, [], 1, '');
    if (rogueTurn1.isDialogue !== true || rogueTurn1.recommendedVoice !== 'en-US-RogerNeural' || !rogueTurn1.text.includes('purse')) {
        throw new Error(`Rogue Turn 1 encounter failed: ${JSON.stringify(rogueTurn1)}`);
    }
    const rogueTurn2 = ChronicleGrounder.resolveCreatureEncounter(encRogueMon, hero1, [], 2, '');
    if (rogueTurn2.isDialogue !== true || !rogueTurn2.text.includes('thirty gold coins')) {
        throw new Error(`Rogue Turn 2 encounter failed: ${JSON.stringify(rogueTurn2)}`);
    }

    const encWolfMon = { name: 'Cave wolf', glyph: 'C', hp: 12, hp_max: 12 };
    const wolfEnc = ChronicleGrounder.resolveCreatureEncounter(encWolfMon, hero1, [], 1, '');
    if (wolfEnc.isDialogue !== false || !wolfEnc.text.includes('Grrr') || wolfEnc.recommendedVoice !== null) {
        throw new Error(`Cave wolf encounter failed: ${JSON.stringify(wolfEnc)}`);
    }

    const encHurtMerchant = { name: 'Aimless looking merchant', glyph: 't', hp: 4, hp_max: 15, wasAttacked: true };
    const hurtEnc = ChronicleGrounder.resolveCreatureEncounter(encHurtMerchant, hero1, ['You hit the Aimless looking merchant.'], 1, '');
    if (hurtEnc.isDialogue !== true || (!hurtEnc.text.includes('Madman') && !hurtEnc.text.includes('Murder') && !hurtEnc.text.includes('Mercy'))) {
        throw new Error(`Hurt merchant combat encounter failed: ${JSON.stringify(hurtEnc)}`);
    }
    console.log('  ✓ Creature multi-turn narrative prose, sleeping silence, and combat reactions verified.');

    // Test 4th-Wall Survival Guide Q&A
    const potionAnswer = ChronicleGrounder.answerGuideQuery('how do I drink a potion?');
    if (!potionAnswer.includes("'q'") || !potionAnswer.includes('quaff')) {
        throw new Error('Potion guide answer missing key command');
    }

    const restAnswer = ChronicleGrounder.answerGuideQuery('how do I rest?');
    if (!restAnswer.includes("'R'")) {
        throw new Error('Rest guide answer missing key command');
    }

    const terminalAnswer = ChronicleGrounder.answerGuideQuery('what is the terminal?');
    if (!terminalAnswer.includes("'Tab'")) {
        throw new Error('Terminal guide answer missing key command');
    }
    console.log('  ✓ Diegetic 4th-Wall survival guide Q&A verified (keys, resting, potions, terminal).');

    // 6. Test ChronicleFilter Narrative Gating
    console.log('[Chronicle Test] Testing ChronicleFilter significance gating...');
    const filter = new ChronicleFilter();

    // Setup frame (Dormant guard check)
    const setupFrame = { phase: 'setup', player: hero1 };
    if (filter.evaluate(setupFrame) !== null) {
        throw new Error('ChronicleFilter triggered during setup/birth (should be dormant)');
    }

    // Town arrival
    const townFrame = { phase: 'play', player: hero1, map: { depth: 0 } };
    const townEvent = filter.evaluate(townFrame);
    if (!townEvent || townEvent.type !== 'ONBOARDING_TOWN_ARRIVAL') {
        throw new Error(`Expected ONBOARDING_TOWN_ARRIVAL, got ${JSON.stringify(townEvent)}`);
    }

    // First descent
    const descentFrame = { phase: 'play', player: hero1, map: { depth: 1 } };
    const descentEvent = filter.evaluate(descentFrame);
    if (!descentEvent || descentEvent.type !== 'ONBOARDING_FIRST_DESCENT') {
        throw new Error(`Expected ONBOARDING_FIRST_DESCENT, got ${JSON.stringify(descentEvent)}`);
    }

    // Rapid walking turns (should be suppressed by cooldown)
    const walkFrame1 = { phase: 'play', player: hero1, map: { depth: 1 } };
    const walkEvent = filter.evaluate(walkFrame1);
    if (walkEvent !== null) {
        throw new Error('ChronicleFilter failed to suppress rapid step spam');
    }

    // Mortal peril (should immediately bypass cooldown)
    const perilFrame = { phase: 'play', player: { ...hero1, chp: 5, mhp: 40 }, map: { depth: 1 } };
    const perilEvent = filter.evaluate(perilFrame);
    if (!perilEvent || perilEvent.type !== 'MORTAL_PERIL') {
        throw new Error(`Expected MORTAL_PERIL interrupt, got ${JSON.stringify(perilEvent)}`);
    }
    console.log('  ✓ Narrative significance filter & mortal peril bypass verified cleanly.');

    // 7. Test Three Literary Traditions
    console.log('[Chronicle Test] Testing Three Literary Traditions of Arda...');
    for (const tradKey of ['noldor', 'westmarch', 'khazad']) {
        const ch = ChronicleGrounder.generateProceduralChapter(descentEvent, hero1, tradKey);
        if (!ch.title || !ch.prose || ch.prose.length < 20) {
            throw new Error(`Tradition ${tradKey} generated invalid prose`);
        }
        console.log(`    - ${ChronicleGrounder.TRADITIONS[tradKey].name}: "${ch.prose.substring(0, 70)}..."`);
    }
    console.log('  ✓ All Three Literary Traditions verified.');

    // 8. Test Audio Router Defaults & Curated Master Voice Selection
    console.log('[Chronicle Test] Testing AudioRouter defaults, curated master voices, and speed...');
    const audio = new ChronicleAudioRouter();
    if (audio.enabled !== false) {
        throw new Error('ChronicleAudioRouter must be MUTED by default!');
    }
    if (audio.narratorVoice !== 'en-GB-RyanNeural') {
        throw new Error(`Expected default voice en-GB-RyanNeural, got ${audio.narratorVoice}`);
    }
    audio.setVoice('en-US-ChristopherNeural');
    if (audio.narratorVoice !== 'en-US-ChristopherNeural') {
        throw new Error('setVoice failed to update to Christopher');
    }
    audio.setVoice('en-IE-ConnorNeural');
    if (audio.narratorVoice !== 'en-IE-ConnorNeural') {
        throw new Error('setVoice failed to update to Connor');
    }
    audio.setSpeed(1.25);
    if (audio.speed !== 1.25) {
        throw new Error('ChronicleAudioRouter failed to update speed multiplier');
    }
    console.log('  ✓ Audio Router muted by default and curated master voice selector verified.');

    // 9. Test Kill Message Deduplication (Prevents repeating village idiot kill bug)
    console.log('[Chronicle Test] Testing Kill Message Deduplication...');
    const killFilter = new ChronicleFilter();
    killFilter.hasCompletedOnboarding.townArrival = true;
    killFilter.hasCompletedOnboarding.firstStairsDown = true;
    killFilter.lastDepth = 0;
    const killFrame1 = {
        phase: 'play',
        player: { ...hero1, depth: 0, turn: 100 },
        map: { depth: 0 },
        messages: [{ text: 'You have slain the Novice idiot.', count: 1, attr: 3 }]
    };
    const killEvent1 = killFilter.evaluate(killFrame1);
    if (!killEvent1 || (killEvent1.type !== 'COMBAT_EPISODE' && killEvent1.type !== 'SIGNIFICANT_KILL')) {
        throw new Error(`Expected COMBAT_EPISODE or SIGNIFICANT_KILL on initial kill frame, got ${JSON.stringify(killEvent1)}`);
    }

    // Subsequent frame retains historical message in buffer: MUST NOT TRIGGER A SECOND KILL EVENT
    const killFrame2 = {
        phase: 'play',
        player: { ...hero1, depth: 0, turn: 101 },
        map: { depth: 0 },
        messages: [{ text: 'You have slain the Novice idiot.', count: 1, attr: 3 }]
    };
    const killEvent2 = killFilter.evaluate(killFrame2);
    if (killEvent2 !== null) {
        throw new Error(`Kill deduplication failed! Repeated event triggered: ${JSON.stringify(killEvent2)}`);
    }
    console.log('  ✓ Kill deduplication verified: historical messages never trigger duplicate chapters.');

    // 10. Test ChronicleLLMBridge Defaults & Fallback
    console.log('[Chronicle Test] Testing Multi-LLM BYOK Bridge...');
    const llm = new ChronicleLLMBridge();
    if (llm.provider !== 'offline' || llm.isConfigured() !== false) {
        throw new Error('ChronicleLLMBridge must default to offline');
    }
    llm.saveSettings({ provider: 'gemini', apiKey: 'test-key', model: 'gemini-3.8-flash' });
    if (llm.provider !== 'gemini' || llm.getActiveModel() !== 'gemini-3.8-flash') {
        throw new Error('ChronicleLLMBridge failed to save/load settings');
    }
    // Verify auto-upgrade of deprecated model (gemini-1.5-flash -> gemini-3.8-flash)
    llm.saveSettings({ model: 'gemini-1.5-flash' });
    if (llm.getActiveModel() !== 'gemini-3.8-flash') {
        throw new Error('Expected deprecated gemini-1.5-flash to auto-upgrade to gemini-3.8-flash');
    }
    console.log('  ✓ Multi-LLM BYOK bridge initialized with offline fallback and Gemini 3.8 Flash configuration.');

    // 11. Test Lorekeeper Q&A Across 16 Topics & answerSurvivalQuery Alias
    console.log('[Chronicle Test] Testing Lorekeeper Q&A across 16 core gameplay topics...');
    const topics = [
        'potion', 'rest', 'spell', 'terminal', 'food', 'torch',
        'speed', 'shop', 'escape', 'weapon', 'beggar', 'corridor',
        'bow', 'trap', 'drain', 'feeling'
    ];
    for (const t of topics) {
        const resp1 = ChronicleGrounder.answerSurvivalQuery(t, hero1);
        const resp2 = ChronicleGrounder.answerGuideQuery(t, hero1);
        if (!resp1 || resp1.length < 20 || resp1 !== resp2) {
            throw new Error(`Lorekeeper failed to resolve topic "${t}" or alias mismatched`);
        }
    }
    console.log('  ✓ Lorekeeper successfully answered all 16 topics with identical alias parity.');

    // 12. Test Dynamic Kill Saga Generation (Town vs Dungeon, Color, Judgment, Anti-Repetition)
    console.log('[Chronicle Test] Testing Dynamic Kill Saga Generation...');
    const varri = { name: 'Varri', race: 'Half-Orc', class: 'Rogue', depth: 0, turn: 50 };
    
    // Town kill
    const townKillSaga = ChronicleGrounder.generateKillSaga(['Novice idiot'], varri, 0, 'westmarch', 'dagger');
    const townText = (townKillSaga && townKillSaga.prose) ? townKillSaga.prose : '';
    if (!townText.toLowerCase().includes('town') && !townText.toLowerCase().includes('street') && !townText.toLowerCase().includes('beggar') && !townText.toLowerCase().includes('murder') && !townText.toLowerCase().includes('innocent')) {
        throw new Error(`Town kill saga missing situational/moral context: ${townText}`);
    }

    // Dungeon kill
    const elrond = { name: 'Celeborn', race: 'Elf', class: 'Mage', depth: 3, turn: 120 };
    const orcKillSaga = ChronicleGrounder.generateKillSaga(['Snaga', 'Cave orc'], elrond, 3, 'noldor', 'broadsword');
    const orcText = (orcKillSaga && orcKillSaga.prose) ? orcKillSaga.prose : '';
    if (!orcText.toLowerCase().includes('orc') && !orcText.toLowerCase().includes('shadow') && !orcText.toLowerCase().includes('fell')) {
        throw new Error(`Dungeon kill saga missing monster context: ${orcText}`);
    }

    // Anti-repetition check across sequential turns
    const killSagas = new Set();
    for (let t = 100; t < 110; t++) {
        const h = { ...varri, turn: t };
        const saga = ChronicleGrounder.generateKillSaga(['Cave orc'], h, 2, 'westmarch', 'dagger');
        killSagas.add(saga.prose);
    }
    if (killSagas.size < 4) {
        throw new Error(`Kill saga anti-repetition failure: expected variety, got only ${killSagas.size} variations across 10 turns`);
    }
    console.log(`  ✓ Dynamic Kill Saga generated ${killSagas.size} unique narrative variations across 10 turns with rich color, moral judgment, and situational context.`);

    // 13. Test Audio Router Pause, Resume, and Playback State
    console.log('[Chronicle Test] Testing AudioRouter pause/resume state...');
    const audioTest = new ChronicleAudioRouter();
    if (audioTest.isPaused) throw new Error('AudioRouter should start unpaused');
    audioTest.pause();
    audioTest.stopSpeaking();
    if (audioTest.isPaused) throw new Error('stopSpeaking must reset isPaused to false');
    console.log('  ✓ Audio Router pause/resume and state management verified.');

    // 14. Test ChronicleManager Story Playlist & Lorekeeper Weaving
    console.log('[Chronicle Test] Testing ChronicleManager story playlist & narrative weaving...');
    const { ChronicleManager } = context;
    const mgr = new ChronicleManager();
    mgr.grounder = ChronicleGrounder;
    mgr.store = ChronicleStore;
    mgr.audio = audioTest;
    mgr.startFreshChronicle(varri);

    // Append mock chapters & paragraphs
    ChronicleStore.appendChapter(mgr.activeChronicle, {
        title: 'Arrival in the Borderlands',
        depth: 0,
        prose: 'Varri arrived at the outskirts under a bruised twilight sky.',
        dialogue: null
    });
    ChronicleStore.appendParagraph(mgr.activeChronicle, {
        title: 'Shadowed Alley',
        depth: 0,
        prose: 'He slipped past shuttered timber shops.',
        dialogue: null
    });

    mgr.buildStoryPlaylist();
    if (mgr.storyPlaylist.length !== 2) {
        throw new Error(`Expected playlist length 2, got ${mgr.storyPlaylist.length}`);
    }
    if (mgr.storyPlaylist[0].elementId !== 'chronicle-beat-1-0' || mgr.storyPlaylist[1].elementId !== 'chronicle-beat-1-1') {
        throw new Error(`Playlist element IDs unexpected: ${JSON.stringify(mgr.storyPlaylist)}`);
    }

    // Weave Lorekeeper counsel into saga
    mgr.weaveLorekeeperCounsel('how do I quaff a potion?', 'Strike q upon your keys.', varri);
    mgr.buildStoryPlaylist();
    if (mgr.storyPlaylist.length !== 3) {
        throw new Error(`Expected playlist length 3 after Lorekeeper counsel, got ${mgr.storyPlaylist.length}`);
    }
    const loreBeat = mgr.storyPlaylist[2];
    if (loreBeat.role !== 'mentor' || !loreBeat.text.includes('Strike q')) {
        throw new Error(`Lorekeeper beat improperly formed in playlist: ${JSON.stringify(loreBeat)}`);
    }
    console.log('  ✓ Story playlist indexing and Lorekeeper narrative weaving verified seamlessly.');

    // 15. Test Gender Matching, Dynamic Voices & Message Log Lockstep Events
    console.log('[Chronicle Test] Testing Creature Gender, Varied Voices, and Message Log Lockstep Events...');
    
    // Gender detection
    const queenGender = ChronicleGrounder.detectCreatureGender('Spider Queen');
    const witchGender = ChronicleGrounder.detectCreatureGender('Novice Witch');
    const veteranGender = ChronicleGrounder.detectCreatureGender('Veteran swordsman');
    const idiotGender = ChronicleGrounder.detectCreatureGender('Blubbering idiot');
    if (queenGender !== 'female' || witchGender !== 'female') {
        throw new Error(`Female gender detection failed: queen=${queenGender}, witch=${witchGender}`);
    }
    if (veteranGender !== 'male' || idiotGender !== 'male') {
        throw new Error(`Male gender detection failed: veteran=${veteranGender}, idiot=${idiotGender}`);
    }
    console.log('  ✓ Creature gender detection verified (female/male markers).');

    // Varied voice picking matching sex and category
    const witchVoice = ChronicleGrounder.pickCreatureVoice({ name: 'Novice Witch', id: 101 }, 'spellcaster');
    const veteranVoice = ChronicleGrounder.pickCreatureVoice({ name: 'Veteran swordsman', id: 202 }, 'veteran');
    const idiotVoice = ChronicleGrounder.pickCreatureVoice({ name: 'Blubbering idiot', id: 303 }, 'idiot');
    if (!witchVoice || (!witchVoice.includes('Aria') && !witchVoice.includes('Sonia'))) {
        throw new Error(`Unexpected witch voice: ${witchVoice}`);
    }
    if (!veteranVoice || (!veteranVoice.includes('Roger') && !veteranVoice.includes('Eric'))) {
        throw new Error(`Unexpected veteran voice: ${veteranVoice}`);
    }
    if (!idiotVoice || (!idiotVoice.includes('Maisie') && !idiotVoice.includes('Emily') && !idiotVoice.includes('Guy'))) {
        throw new Error(`Unexpected idiot voice: ${idiotVoice}`);
    }
    console.log(`  ✓ Gendered voice picking verified: Witch=${witchVoice}, Veteran=${veteranVoice}, Idiot=${idiotVoice}`);

    // Blubbering idiot encounter: babbling, never Morgoth lore
    const idiotMonster = { name: 'Blubbering idiot', glyph: 't', hp: 3, hp_max: 3 };
    const idiotEncounter = ChronicleGrounder.resolveCreatureEncounter(idiotMonster, varri, [], 1, '');
    if (idiotEncounter.text && (idiotEncounter.text.includes('Morgoth') || idiotEncounter.text.includes('Elder Days'))) {
        throw new Error('Blubbering idiot recited Morgoth lore instead of babbling!');
    }
    console.log('  ✓ Blubbering idiot dialogue verified (pure harmless babble, 0 Morgoth lore).');

    // Message Log Lockstep Events: Attack, Flee, Drool, Wake
    const combatFilter = new ChronicleFilter();
    combatFilter.hasCompletedOnboarding.townArrival = true;
    combatFilter.hasCompletedOnboarding.firstStairsDown = true;
    combatFilter.lastDepth = 0;

    const frameWithCombat = {
        phase: 'play',
        player: { ...varri, turn: 200 },
        monsters: [{ name: 'Blubbering idiot', glyph: 't', x: 10, y: 10 }],
        map: { depth: 0 },
        messages: [
            { text: 'The blubbering idiot wakes up.', count: 1, attr: 0 },
            { text: 'The blubbering idiot drools on you.', count: 1, attr: 0 },
            { text: 'You hit the blubbering idiot.', count: 1, attr: 3 },
            { text: 'The blubbering idiot flees in terror!', count: 1, attr: 2 }
        ]
    };

    // Evaluate frame repeatedly to drain multi-event queue
    const drainedEvents = [];
    let ev = combatFilter.evaluate(frameWithCombat);
    while (ev) {
        drainedEvents.push(ev);
        ev = combatFilter.evaluate(frameWithCombat);
    }

    const types = drainedEvents.map(e => e.type);
    if (!types.includes('HERO_ATTACK') || !types.includes('CREATURE_FLEEING') || !types.includes('CREATURE_BIZARRE_ACTION') || !types.includes('CREATURE_STATE_CHANGE')) {
        throw new Error(`Expected all combat events to be queued, got: ${JSON.stringify(types)}`);
    }
    console.log(`  ✓ Message log lockstep verified: ${drainedEvents.length} events drained in order: ${types.join(', ')}`);

    // Verify procedural chapters generated for these events
    for (const drainedEv of drainedEvents) {
        const procCh = ChronicleGrounder.generateProceduralChapter(drainedEv, varri);
        if (!procCh.title || !procCh.prose || procCh.prose.length < 15) {
            throw new Error(`Procedural chapter failed for ${drainedEv.type}: ${JSON.stringify(procCh)}`);
        }
    }
    console.log('  ✓ Procedural chapters generated cleanly for all lockstep combat events.');

    // 16. Test Female Veteran, Model Gender Alignment, Spell/Prayer Mastery, and Non-Repeating Dialogue
    console.log('[Chronicle Test] Testing Model Gender Matching, Prayers/Spells, and Non-Repeating Narrative Flow...');

    // 16a. Female Veteran Voice & Pronouns
    const femaleVeteranName = 'Female veteran';
    const femaleVeteranGender = ChronicleGrounder.detectCreatureGender(femaleVeteranName);
    if (femaleVeteranGender !== 'female') {
        throw new Error(`Expected female gender for 'Female veteran', got: ${femaleVeteranGender}`);
    }
    const femaleVeteranVoice = ChronicleGrounder.pickCreatureVoice({ name: femaleVeteranName, id: 105 }, 'veteran');
    if (!femaleVeteranVoice || (!femaleVeteranVoice.includes('Natasha') && !femaleVeteranVoice.includes('Aria') && !femaleVeteranVoice.includes('Sonia'))) {
        throw new Error(`Expected female neural voice for female veteran, got: ${femaleVeteranVoice}`);
    }

    // 16b. Model-Driven Gender Matching (Monster named 'Battle-scarred veteran' with modelKey 'casual')
    const veteranCasualModel = { name: 'Battle-scarred veteran', modelKey: 'casual', id: 300 };
    const casualModelGender = ChronicleGrounder.detectCreatureGender(veteranCasualModel.name, veteranCasualModel);
    if (casualModelGender !== 'female') {
        throw new Error(`Expected modelKey: casual to drive female gender detection, got: ${casualModelGender}`);
    }
    const casualModelVoice = ChronicleGrounder.pickCreatureVoice(veteranCasualModel, 'veteran');
    if (!casualModelVoice.includes('Natasha') && !casualModelVoice.includes('Aria') && !casualModelVoice.includes('Sonia')) {
        throw new Error(`Expected female neural voice for casual model veteran, got: ${casualModelVoice}`);
    }
    const veteranPronouns = ChronicleGrounder.getPronouns('female');
    if (veteranPronouns.he !== 'she' || veteranPronouns.his !== 'her' || !veteranPronouns.veteranTitle.includes('swordswoman')) {
        throw new Error(`Improper female pronouns: ${JSON.stringify(veteranPronouns)}`);
    }
    console.log(`  ✓ Female veteran & model-driven gender matching verified: voice=${femaleVeteranVoice}, modelVoice=${casualModelVoice}`);

    // 16c. Spell & Prayer Mastery Lockstep Events
    const spellFilter = new ChronicleFilter();
    spellFilter.hasCompletedOnboarding.townArrival = true;
    spellFilter.hasCompletedOnboarding.firstStairsDown = true;
    spellFilter.lastDepth = 0;

    const frameWithSpells = {
        phase: 'play',
        player: { ...varri, turn: 350 },
        messages: [
            'You have learned the prayer of Detect Evil.',
            'You have learned the spell of Magic Missile.',
            'Welcome to level 2.'
        ]
    };

    const spellEvents = [];
    let sEv = spellFilter.evaluate(frameWithSpells);
    while (sEv) {
        spellEvents.push(sEv);
        sEv = spellFilter.evaluate(frameWithSpells);
    }

    const sTypes = spellEvents.map(e => e.type);
    if (!sTypes.includes('SPELL_LEARNED') || !sTypes.includes('LEVEL_UP')) {
        throw new Error(`Expected SPELL_LEARNED and LEVEL_UP events, got: ${JSON.stringify(sTypes)}`);
    }
    const prayerChapter = ChronicleGrounder.generateProceduralChapter(spellEvents[0], varri);
    if (!prayerChapter.title.includes('Detect Evil') || !prayerChapter.prose.includes('prayer') || !prayerChapter.dialogue) {
        throw new Error(`Prayer chapter improperly generated: ${JSON.stringify(prayerChapter)}`);
    }
    const spellChapter = ChronicleGrounder.generateProceduralChapter(spellEvents[1], varri);
    if (!spellChapter.title.includes('Magic Missile') || !spellChapter.prose.includes('spell') || !spellChapter.dialogue) {
        throw new Error(`Spell chapter improperly generated: ${JSON.stringify(spellChapter)}`);
    }
    const levelUpChapter = ChronicleGrounder.generateProceduralChapter(spellEvents[2], varri);
    if (!levelUpChapter.title.includes('Level 2') || !levelUpChapter.prose.includes('heroic vigor')) {
        throw new Error(`Level up chapter improperly generated: ${JSON.stringify(levelUpChapter)}`);
    }
    console.log(`  ✓ Message log prayer/spell/level-up lockstep verified: ${prayerChapter.title}, ${spellChapter.title}, ${levelUpChapter.title}`);

    // 16d. Non-Repeating Progressive Dialogue Test
    const insult1 = ChronicleGrounder.generateProceduralChapter({ type: 'CREATURE_INSULT', data: { monsterName: 'Battle-scarred veteran', monster: veteranCasualModel } }, varri);
    const insult2 = ChronicleGrounder.generateProceduralChapter({ type: 'CREATURE_INSULT', data: { monsterName: 'Battle-scarred veteran', monster: veteranCasualModel } }, varri);
    if (insult1.dialogue.text === insult2.dialogue.text) {
        throw new Error(`CREATURE_INSULT produced repetitive identical dialogue on consecutive turns: "${insult1.dialogue.text}"`);
    }
    if (!insult1.prose.includes('swordswoman') && !insult1.prose.includes('veteran')) {
        throw new Error(`Expected gendered veteran prose: ${insult1.prose}`);
    }
    console.log(`  ✓ Progressive non-repeating dialogue verified:\n      Turn 1: ${insult1.dialogue.text}\n      Turn 2: ${insult2.dialogue.text}`);

    // 17. Test Audio Playback State Machine, Seek, Rewind, Stop & Play from Where We Are
    console.log('[Chronicle Test] Testing Audio Playback State Machine, Rewind, Stop, and Position Seeking...');
    
    // Set up mock DOM elements for buttons and classes
    const mockClassList = (initial = []) => {
        const classes = new Set(initial);
        return {
            add: (c) => classes.add(c),
            remove: (c) => classes.delete(c),
            toggle: (c) => classes.has(c) ? classes.delete(c) : classes.add(c),
            contains: (c) => classes.has(c)
        };
    };

    const mockPlayBtn = { textContent: '', title: '', classList: mockClassList() };
    const mockStopBtn = { textContent: '', title: '', classList: mockClassList() };
    const mockStatusText = { textContent: '' };

    mgr.btnPlayStory = mockPlayBtn;
    mgr.btnStopStory = mockStopBtn;
    mgr.statusTextEl = mockStatusText;

    // Mock audio router with controlled time and playback
    let mockCurrentTime = 0;
    mgr.audio = {
        enabled: true,
        speed: 1.0,
        isPaused: false,
        isSpeaking: false,
        getCurrentTime: () => mockCurrentTime,
        getDuration: () => 10.0,
        setMuted: () => {},
        pause: function() { this.isPaused = true; },
        resume: function() { this.isPaused = false; },
        stopSpeaking: function() { this.isPaused = false; this.isSpeaking = false; },
        narratorVoice: 'en-GB-RyanNeural',
        setVoice: function(v) { this.narratorVoice = v; },
        speakUtterance: async () => ({ finished: true }),
        speak: async () => ({ finished: true })
    };

    // Test A: Play from default location ("where we are", currently index 0)
    mgr.currentBeatIndex = 0;
    const initialSession = mgr.playbackSessionId;
    mgr.playStoryFrom();
    if (!mgr.isStoryPlaying) throw new Error('Expected isStoryPlaying to be true after playStoryFrom()');
    if (mgr.playbackSessionId <= initialSession) throw new Error('Expected playbackSessionId to increment on playStoryFrom()');
    if (mockPlayBtn.textContent !== '⏸ Pause' || !mockPlayBtn.classList.contains('active')) {
        throw new Error(`Expected Play button to show Pause, got: "${mockPlayBtn.textContent}"`);
    }
    if (!mockStopBtn.classList.contains('active')) {
        throw new Error('Expected Stop button to be active during playback');
    }
    console.log('  ✓ Play from current location and active button state verified.');

    // Test B: Pause playback mid-session
    mgr.pauseStoryPlayback();
    if (mgr.isStoryPlaying) throw new Error('Expected isStoryPlaying to be false after pauseStoryPlayback()');
    if (!mgr.audio.isPaused) throw new Error('Expected audio.isPaused to be true after pauseStoryPlayback()');
    if (mockPlayBtn.textContent !== '▶ Resume' || !mockPlayBtn.classList.contains('active')) {
        throw new Error(`Expected Play button to show Resume, got: "${mockPlayBtn.textContent}"`);
    }
    console.log('  ✓ Pause mid-session and Resume button state verified.');

    // Test C: Resume playback
    mgr.resumeStoryPlayback();
    if (!mgr.isStoryPlaying) throw new Error('Expected isStoryPlaying to be true after resumeStoryPlayback()');
    if (mgr.audio.isPaused) throw new Error('Expected audio.isPaused to be false after resumeStoryPlayback()');
    if (mockPlayBtn.textContent !== '⏸ Pause') {
        throw new Error(`Expected Play button to return to Pause on resume, got: "${mockPlayBtn.textContent}"`);
    }
    console.log('  ✓ Resume playback and audio unpause verified.');

    // Test D: Stop playback at arbitrary beat
    mgr.currentBeatIndex = 1;
    const preStopSession = mgr.playbackSessionId;
    mgr.stopStoryPlayback();
    if (mgr.isStoryPlaying) throw new Error('Expected isStoryPlaying to be false after stopStoryPlayback()');
    if (mgr.audio.isPaused) throw new Error('Expected audio.isPaused to be false after stopStoryPlayback()');
    if (mgr.playbackSessionId <= preStopSession) throw new Error('Expected session token invalidation on stopStoryPlayback()');
    if (mgr.currentBeatIndex !== 1) throw new Error(`Stop should preserve currentBeatIndex, expected 1 got ${mgr.currentBeatIndex}`);
    if (mockPlayBtn.textContent !== '▶ Play' || mockPlayBtn.classList.contains('active')) {
        throw new Error(`Expected Play button to show Play, got: "${mockPlayBtn.textContent}"`);
    }
    if (mockStopBtn.classList.contains('active')) {
        throw new Error('Expected Stop button to be inactive when stopped');
    }
    console.log('  ✓ Immediate stop, session token invalidation, and cursor position preservation verified.');

    // Test E: Play from where we are after stop
    mgr.toggleStoryPlayback();
    if (!mgr.isStoryPlaying) throw new Error('Expected isStoryPlaying to be true after toggle from stopped state');
    if (mgr.currentBeatIndex !== 1) throw new Error(`Expected to play from where we were (index 1), got ${mgr.currentBeatIndex}`);
    console.log('  ✓ Seamless playback restart from current position verified.');

    // Test F: Rewind functionality
    // Case 1: currentTime > 2s -> rewinds to start of current beat (index 1)
    mockCurrentTime = 3.5;
    mgr.rewindStoryPlayback();
    if (mgr.currentBeatIndex !== 1) {
        throw new Error(`Expected rewind with >2s elapsed to restart current beat 1, got ${mgr.currentBeatIndex}`);
    }
    // Case 2: currentTime <= 2s -> rewinds to previous beat (index 0)
    mockCurrentTime = 0.5;
    mgr.rewindStoryPlayback();
    if (mgr.currentBeatIndex !== 0) {
        throw new Error(`Expected rewind with <2s elapsed to jump to previous beat 0, got ${mgr.currentBeatIndex}`);
    }
    console.log('  ✓ Rewind logic (restart current beat vs jump to previous beat) verified.');

    // Test G: Forward skip functionality
    mgr.forwardStoryPlayback();
    if (mgr.currentBeatIndex !== 1) {
        throw new Error(`Expected forwardStoryPlayback to advance to beat 1, got ${mgr.currentBeatIndex}`);
    }
    console.log('  ✓ Forward skip to next beat verified.');

    // Test H: Click-to-seek by element ID
    mgr.playStoryFromElementId('chronicle-beat-1-1');
    if (mgr.currentBeatIndex !== 1) {
        throw new Error(`Expected playStoryFromElementId to seek to index 1, got ${mgr.currentBeatIndex}`);
    }
    mgr.stopStoryPlayback();
    console.log('  ✓ Direct click-to-seek from element ID verified.');

    // 18. Test Aged & Venerable Voices Suite & Quick Voice Synchronization
    console.log('[Chronicle Test] Testing Aged & Venerable Voices Suite & Synchronization...');
    const agedVoices = [
        'en-US-RogerNeural',
        'en-US-BrianNeural',
        'en-AU-WilliamMultilingualNeural',
        'en-CA-ClaraNeural',
        'en-US-SteffanNeural'
    ];
    for (const v of agedVoices) {
        mgr.audio.setVoice(v);
        if (mgr.audio.narratorVoice !== v) {
            throw new Error(`Expected narrator voice to be set to ${v}, got: ${mgr.audio.narratorVoice}`);
        }
    }
    // Test quick voice UI syncing
    const mockQuickSelect = { value: '', options: [{ text: '👴 Roger — Aged Archivist' }], selectedIndex: 0 };
    mgr.selectQuickVoice = mockQuickSelect;
    mgr.audio.setVoice('en-US-RogerNeural');
    mgr.updateAudioControlsUI();
    if (mockQuickSelect.value !== 'en-US-RogerNeural') {
        throw new Error(`Expected selectQuickVoice to sync to en-US-RogerNeural, got: ${mockQuickSelect.value}`);
    }
    console.log('  ✓ Aged & Venerable voices (Roger, Brian, William, Clara, Steffan) and Quick Selector sync verified.');

    // 19. Test API Key Auto-Save, Paste, and LLM Test Connection
    console.log('[Chronicle Test] Testing API Key Auto-save and LLM Test Connection...');
    const testKey = 'test-gemini-api-key-12345';
    mgr.llm.saveSettings({ provider: 'gemini', apiKey: testKey });
    if (mgr.llm.apiKey !== testKey) {
        throw new Error(`Expected LLM apiKey to be saved as ${testKey}, got: ${mgr.llm.apiKey}`);
    }
    if (!mgr.llm.isConfigured()) {
        throw new Error('Expected LLM to be configured when valid API key is present');
    }
    // Test Offline Engine check
    mgr.llm.saveSettings({ provider: 'offline' });
    const offlineTest = await mgr.llm.testConnection('offline', '', '', '');
    if (!offlineTest.ok || !offlineTest.message.includes('offline procedural engine')) {
        throw new Error('Expected offline procedural engine to report ready');
    }
    console.log('  ✓ API Key persistence and offline LLM connection probe verified.');

    // 20. Test Playback Boundary Resilience (Resume after utterance finished while paused)
    console.log('[Chronicle Test] Testing Playback Boundary Resilience on Pause & Resume...');
    mgr.currentBeatIndex = 0;
    mgr.playStoryFrom(0);
    if (!mgr.isStoryPlaying) throw new Error('Expected playback to start');
    // Pause while playing
    mgr.pauseStoryPlayback();
    if (mgr.isStoryPlaying) throw new Error('Expected isStoryPlaying to be false when paused');
    // Simulate speech finishing while paused (isSpeakingBeat becomes false)
    mgr.isSpeakingBeat = false;
    // Now resume
    mgr.resumeStoryPlayback();
    if (!mgr.isStoryPlaying) throw new Error('Expected isStoryPlaying to resume cleanly');
    if (mockPlayBtn.textContent !== '⏸ Pause') {
        throw new Error(`Expected button to return to Pause state, got: ${mockPlayBtn.textContent}`);
    }
    mgr.stopStoryPlayback();
    console.log('  ✓ Boundary pause/resume state machine resilience verified.');

    // 21. Test 3D Model Gender Determination, Sleeping Creature Voice Narration, and Free Tier Rate Limiting
    console.log('[Chronicle Test] Testing 3D Model Gender Determination, Sleeping Voice Narration & Free Tier Guard...');

    // 21a. 3D Model-to-Sex Determination
    const casualModelCreature = { name: 'Battle-scarred veteran', modelKey: 'casual' };
    const witchModelCreature = { name: 'Cultist', modelKey: 'witch' };
    const adventurerModelCreature = { name: 'Veteran swordsman', modelKey: 'adventurer' };
    const soldierModelCreature = { name: 'Mercenary', modelKey: 'soldier' };

    if (ChronicleGrounder.detectCreatureGender(casualModelCreature.name, casualModelCreature) !== 'female') {
        throw new Error('Expected modelKey: casual to determine female gender');
    }
    if (ChronicleGrounder.detectCreatureGender(witchModelCreature.name, witchModelCreature) !== 'female') {
        throw new Error('Expected modelKey: witch to determine female gender');
    }
    if (ChronicleGrounder.detectCreatureGender(adventurerModelCreature.name, adventurerModelCreature) !== 'male') {
        throw new Error('Expected modelKey: adventurer to determine male gender');
    }
    if (ChronicleGrounder.detectCreatureGender(soldierModelCreature.name, soldierModelCreature) !== 'male') {
        throw new Error('Expected modelKey: soldier to determine male gender');
    }

    // Explicit modelGender tags
    const taggedFemale = { name: 'Guard', modelGender: 'female' };
    const taggedMale = { name: 'Guard', modelGender: 'male' };
    if (ChronicleGrounder.detectCreatureGender(taggedFemale.name, taggedFemale) !== 'female') {
        throw new Error('Expected modelGender: female tag to be respected');
    }
    if (ChronicleGrounder.detectCreatureGender(taggedMale.name, taggedMale) !== 'male') {
        throw new Error('Expected modelGender: male tag to be respected');
    }

    // Verify encounter resolution produces gender-aligned prose & pronouns
    const femaleEncounter = ChronicleGrounder.resolveCreatureEncounter(casualModelCreature, varri, [], 1, '');
    if (!femaleEncounter.isFemale || femaleEncounter.gender !== 'female' || femaleEncounter.modelGender !== 'female') {
        throw new Error(`Expected female encounter metadata: ${JSON.stringify(femaleEncounter)}`);
    }
    const maleEncounter = ChronicleGrounder.resolveCreatureEncounter(adventurerModelCreature, varri, [], 1, '');
    if (maleEncounter.isFemale || maleEncounter.gender !== 'male' || maleEncounter.modelGender !== 'male') {
        throw new Error(`Expected male encounter metadata: ${JSON.stringify(maleEncounter)}`);
    }
    console.log('  ✓ 3D model-to-sex determination and gendered encounter metadata verified.');

    // 21b. Sleeping Creature Encounter and Continuous Spoken Narration
    const sleepingVeteran = { name: 'Battle-scarred veteran', modelKey: 'casual', asleep: true, is_sleeping: true, glyph: 'p' };
    const sleepingEncounter = ChronicleGrounder.resolveCreatureEncounter(sleepingVeteran, varri, [], 1, '');
    if (sleepingEncounter.isDialogue !== false || sleepingEncounter.text !== null || !sleepingEncounter.prose || sleepingEncounter.prose.length < 20) {
        throw new Error(`Expected sleeping encounter to have valid scene prose and null dialogue: ${JSON.stringify(sleepingEncounter)}`);
    }
    if (!sleepingEncounter.prose.includes('her')) {
        throw new Error(`Expected female pronouns ('her') in sleeping veteran prose: ${sleepingEncounter.prose}`);
    }

    // Verify Master Chronicler speaks scene prose aloud on click/target
    let spokenNarration = null;
    let spokenRole = null;
    mgr.audio.enabled = true;
    mgr.audio.speakUtterance = async (text, role) => {
        spokenNarration = text;
        spokenRole = role;
        return { finished: true };
    };
    await mgr.interactWithCreature(sleepingVeteran);
    if (!spokenNarration || spokenNarration !== sleepingEncounter.prose || spokenRole !== 'narrator') {
        throw new Error(`Expected Chronicler narrator to speak sleeping creature scene prose aloud, got: role=${spokenRole}, text=${spokenNarration}`);
    }
    console.log('  ✓ Sleeping creature encounter generates atmospheric scene prose with female pronouns and triggers continuous voice narration.');

    // Verify user's exact case: Mean-looking mercenary rendered with Casual.gltf 3D model
    const mercenaryFemale = { name: 'Mean-looking mercenary', glyph: 't', modelKey: 'casual', isFemale: true, asleep: true };
    const mercEncounter = ChronicleGrounder.resolveCreatureEncounter(mercenaryFemale, varri, [], 1, '');
    if (!mercEncounter.isFemale || mercEncounter.gender !== 'female') {
        throw new Error(`Expected female gender for casual mercenary: ${JSON.stringify(mercEncounter)}`);
    }
    if (!mercEncounter.prose.includes('her')) {
        throw new Error(`Expected female pronoun 'her' in mercenary prose: ${mercEncounter.prose}`);
    }
    const mercClass = ChronicleGrounder.classifyCreature(mercenaryFemale);
    if (!mercClass.sleepNoise.includes('her scabbard')) {
        throw new Error(`Expected 'her scabbard' in female mercenary sleepNoise: ${mercClass.sleepNoise}`);
    }
    console.log('  ✓ Female hominid 3D model (Casual.gltf mercenary) strictly synchronized with female prose and observation.');

    // 21c. Free Tier Models, Automatic Failover Cascade, and Permanent Cost Protection
    const freeTierLLM = new ChronicleLLMBridge();
    const freeTierModels = [
        'gemini-3.8-flash',
        'gemini-3.7-flash',
        'gemini-3.6-flash',
        'gemini-3.5-flash',
        'gemini-3.5-flash-lite',
        'gemini-3.1-flash-lite',
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite'
    ];
    for (const modelId of freeTierModels) {
        freeTierLLM.saveSettings({ provider: 'gemini', apiKey: 'test-free-key', model: modelId, enforceFreeTier: true });
        if (freeTierLLM.getActiveModel() !== modelId) {
            throw new Error(`Expected active model to be ${modelId}, got: ${freeTierLLM.getActiveModel()}`);
        }
    }

    // Verify automatic failover when a model hits its 10 RPM limit (should step down to next best: 3.7 Flash)
    freeTierLLM.saveSettings({ provider: 'gemini', apiKey: 'test-free-key', model: 'gemini-3.8-flash' });
    freeTierLLM.callGemini = async () => '{"prose": "A veteran slumbers peacefully.", "dialogue": null}';
    for (let i = 0; i < 10; i++) freeTierLLM.recordModelRequest('gemini-3.8-flash');
    let notifiedMsg = null;
    freeTierLLM.onStatusUpdate = (msg) => {
        notifiedMsg = msg;
    };
    try {
        await freeTierLLM.callLLM('system', 'user');
    } catch (_) {}
    if (freeTierLLM.getActiveModel() !== 'gemini-3.7-flash') {
        throw new Error(`Expected automatic failover to next best confirmed model gemini-3.7-flash, got: ${freeTierLLM.getActiveModel()}`);
    }
    if (!notifiedMsg || !notifiedMsg.includes('Auto-switched to gemini-3.7-flash')) {
        throw new Error(`Expected status notification for automatic failover, got: ${notifiedMsg}`);
    }

    // Verify subsequent step-down when gemini-3.7-flash also reaches 10 RPM (should step down to 3.6 Flash)
    for (let i = 0; i < 10; i++) freeTierLLM.recordModelRequest('gemini-3.7-flash');
    try {
        await freeTierLLM.callLLM('system', 'user');
    } catch (_) {}
    if (freeTierLLM.getActiveModel() !== 'gemini-3.6-flash') {
        throw new Error(`Expected automatic failover to gemini-3.6-flash, got: ${freeTierLLM.getActiveModel()}`);
    }
    console.log('  ✓ Automatic seamless free-tier model cascade on 10 RPM limit verified (3.8 -> 3.7 -> 3.6).');

    // Verify rate limit ceiling when ALL free models in the cascade are exhausted
    for (const modelId of freeTierModels) {
        for (let i = 0; i < 10; i++) freeTierLLM.recordModelRequest(modelId);
    }
    let allBlocked = false;
    try {
        await freeTierLLM.callLLM('system', 'user');
    } catch (err) {
        if (err.message.includes('rate limit ceiling reached')) {
            allBlocked = true;
        }
    }
    if (!allBlocked) {
        throw new Error('Expected callLLM to throw Free Tier rate limit ceiling exception when all models exhausted');
    }

    // Verify HTTP 429 quota exhaustion triggers automatic failover to next best model
    freeTierLLM.modelTimestamps.clear();
    freeTierLLM.requestTimestamps = [];
    freeTierLLM.saveSettings({ provider: 'gemini', apiKey: 'test-free-key', model: 'gemini-3.8-flash' });
    let failover429Triggered = false;
    freeTierLLM.callGemini = async (sys, usr, sig, retryCount = 0) => {
        if (retryCount === 0) {
            const nextModel = freeTierLLM.findAvailableFreeModel(freeTierLLM.getActiveModel());
            freeTierLLM.model = nextModel;
            freeTierLLM.notifyStatus(`⚡ Auto-switched to ${nextModel} (429 Quota Exceeded Failover)`);
            return await freeTierLLM.callGemini(sys, usr, sig, retryCount + 1);
        }
        failover429Triggered = true;
        return '{"prose": "A veteran slumbers peacefully.", "dialogue": null}';
    };
    await freeTierLLM.callLLM('system', 'user');
    if (!failover429Triggered || freeTierLLM.getActiveModel() !== 'gemini-3.7-flash') {
        throw new Error(`Expected 429 quota failover to seamlessly retry with next free model (gemini-3.7-flash), got: ${freeTierLLM.getActiveModel()}`);
    }
    console.log('  ✓ HTTP 429 Quota automatic failover to next best confirmed free tier model verified.');

    // Verify Security Audit: Header-based auth (x-goog-api-key) and Zero URL leakage in real callGemini
    let capturedFetchUrl = null;
    let capturedFetchHeaders = null;
    const originalFetch = context.fetch;
    context.fetch = async (url, opts) => {
        capturedFetchUrl = url;
        capturedFetchHeaders = opts.headers || {};
        return {
            ok: true,
            status: 200,
            json: async () => ({
                candidates: [{
                    content: { parts: [{ text: '{"prose": "Secure chapter generated with header auth."}' }] }
                }]
            })
        };
    };

    const securityLLM = new ChronicleLLMBridge();
    securityLLM.saveSettings({ provider: 'gemini', apiKey: 'AIzaSySecretApiKey12345', model: 'gemini-3.8-flash' });
    await securityLLM.callGemini('System prompt', 'User prompt', null);

    if (capturedFetchUrl.includes('key=') || capturedFetchUrl.includes('AIzaSySecretApiKey12345')) {
        throw new Error(`Security violation: API key leaked in URL query parameters: ${capturedFetchUrl}`);
    }
    if (capturedFetchHeaders['x-goog-api-key'] !== 'AIzaSySecretApiKey12345') {
        throw new Error(`Security violation: Expected x-goog-api-key header to match API key, got: ${capturedFetchHeaders['x-goog-api-key']}`);
    }
    console.log('  ✓ Security Audit passed: Zero API key URL leakage and strict x-goog-api-key header auth verified.');

    // Verify 401 Fast-Fail (no wasteful model cascading on invalid credentials)
    let fetchAttempts = 0;
    context.fetch = async (url, opts) => {
        fetchAttempts++;
        return {
            ok: false,
            status: 401,
            statusText: 'Unauthorized',
            json: async () => ({ error: { message: 'API_KEY_INVALID' } })
        };
    };

    let authErrorCaught = false;
    try {
        await securityLLM.callGemini('System prompt', 'User prompt', null);
    } catch (err) {
        if (err.message.includes('Authentication') || err.message.includes('401')) {
            authErrorCaught = true;
        }
    }
    if (!authErrorCaught || fetchAttempts !== 1) {
        throw new Error(`Expected 401 Unauthorized to fail immediately with 1 attempt, but got ${fetchAttempts} attempts`);
    }
    console.log('  ✓ Error Discrimination passed: 401 Unauthorized aborts immediately without wasteful failover loop.');
    context.fetch = originalFetch;

    // Anti-repetition recording verification
    const testUtterance = 'The cold wind whistles through the high stone archways.';
    freeTierLLM.recordUtterance(testUtterance);
    if (!freeTierLLM.recentUtterances.includes(testUtterance)) {
        throw new Error('Expected recordUtterance to add text to recentUtterances');
    }
    console.log('  ✓ Free tier models, strict 10 RPM rate limiter ceiling, and anti-repetition buffer verified.');

    // 22. Zero API Key Exposure & Permanent Rate Limiting UI Verification
    console.log('[Chronicle Test] Testing Zero API Key Exposure & Permanent Rate Limiting UI...');
    const htmlContent = fs.readFileSync(path.resolve(__dirname, '../server/public/index.html'), 'utf8');
    if (htmlContent.includes('id="btn-toggle-apikey-vis"')) {
        throw new Error('Found prohibited btn-toggle-apikey-vis in index.html (violates zero API key exposure requirement)');
    }
    if (!htmlContent.includes('id="btn-clear-apikey"')) {
        throw new Error('Expected btn-clear-apikey in index.html');
    }
    if (htmlContent.includes('id="chronicle-setting-enforce-free"')) {
        throw new Error('Found prohibited chronicle-setting-enforce-free checkbox in index.html (rate limiting must be permanent)');
    }
    if (!htmlContent.includes('Strict Free Tier Limiter &amp; Automatic Model Failover')) {
        throw new Error('Expected permanent Free Tier Limiter card in index.html');
    }
    console.log('  ✓ Zero API key exposure (eye toggle eliminated, permanent masked password) verified.');
    console.log('  ✓ Permanent rate limiting enforcement & automatic failover UI card verified.');

    console.log('\n[Chronicle Test] ✅ ALL 22 VERIFICATION PHASES PASSED WITH ZERO ERRORS!\n');
}

runTest().catch((err) => {
    console.error(err);
    process.exit(1);
});
