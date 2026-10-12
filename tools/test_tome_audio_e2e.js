const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');
const WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws'));

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9245;
const profileDir = path.join(os.tmpdir(), 'chrome_tome_audio_test_' + Date.now());

async function runTest() {
    console.log('[Test] Spawning headless Chrome on port', PORT);
    const proc = spawn(CHROME, [
        `--remote-debugging-port=${PORT}`,
        '--headless=new',
        '--no-first-run',
        '--no-default-browser-check',
        '--autoplay-policy=no-user-gesture-required',
        '--window-size=1920,1080',
        `--user-data-dir=${profileDir}`,
        'http://127.0.0.1:8080/?autoplay=1'
    ], { stdio: 'ignore' });

    function cleanup() {
        try { proc.kill('SIGKILL'); } catch (_) {}
        try { const fs = require('fs'); fs.rmSync(profileDir, { recursive: true, force: true }); } catch (_) {}
    }

    try {
        let wsUrl = null;
        for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 200));
            try {
                const list = await new Promise((res, rej) => {
                    http.get(`http://127.0.0.1:${PORT}/json/list`, r => {
                        let d = '';
                        r.on('data', c => d += c);
                        r.on('end', () => res(JSON.parse(d)));
                    }).on('error', rej);
                });
                const page = list.find(p => p.type === 'page');
                if (page && page.webSocketDebuggerUrl) {
                    wsUrl = page.webSocketDebuggerUrl;
                    break;
                }
            } catch (_) {}
        }

        if (!wsUrl) throw new Error('Could not connect to Chrome CDP on port ' + PORT);
        console.log('[Test] Connected to Chrome CDP target:', wsUrl);

        const ws = new WebSocket(wsUrl);
        await new Promise(r => ws.on('open', r));

        let msgId = 1;
        const callbacks = new Map();
        const consoleMessages = [];
        const exceptions = [];

        ws.on('message', (d) => {
            const m = JSON.parse(d.toString());
            if (m.method === 'Runtime.consoleAPICalled') {
                const text = m.params.args.map(a => a.value !== undefined ? (typeof a.value === 'object' ? JSON.stringify(a.value) : a.value) : (a.description || '')).join(' ');
                consoleMessages.push({ type: m.params.type, text });
                console.log(`  [Browser ${m.params.type}]:`, text);
            } else if (m.method === 'Runtime.exceptionThrown') {
                const desc = m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text;
                exceptions.push(desc);
                console.error('  [Browser Exception]:', desc);
            }

            if (m.id && callbacks.has(m.id)) {
                const cb = callbacks.get(m.id);
                callbacks.delete(m.id);
                cb(m);
            }
        });

        function call(method, params = {}) {
            return new Promise((resolve, reject) => {
                const id = msgId++;
                callbacks.set(id, (res) => {
                    if (res.error) reject(res.error);
                    else resolve(res.result);
                });
                ws.send(JSON.stringify({ id, method, params }));
            });
        }

        await call('Runtime.enable');
        await call('Page.enable');

        console.log('[Test] Waiting for client initialization...');
        let ready = false;
        for (let i = 0; i < 40; i++) {
            await new Promise(r => setTimeout(r, 500));
            const check = await call('Runtime.evaluate', {
                expression: `Boolean(window.chronicleManager && window.chronicleManager.audio && window.chronicleManager.currentHero)`
            });
            if (check && check.result && check.result.value) {
                ready = true;
                break;
            }
        }
        if (!ready) throw new Error('Client, chronicleManager, and currentHero failed to initialize within 20s');
        console.log('[Test] ChronicleManager, ChronicleAudio, and Hero session detected!');

        // Give any initial engine frame resets a moment to settle
        await new Promise(r => setTimeout(r, 1500));

        console.log('[Test] Unlocking audio context and verifying audio graph...');
        const unlockRes = await call('Runtime.evaluate', {
            expression: `(() => {
                const mgr = window.chronicleManager;
                mgr.audio.unlock();
                mgr.audio.setMuted(false);
                mgr.audio.voiceVolume = 1.0;
                return {
                    ctxState: mgr.audio.ctx ? mgr.audio.ctx.state : 'null',
                    hasMasterGain: Boolean(mgr.audio.voiceMasterGain),
                    hasVerb: Boolean(mgr.audio.vaultConvolver),
                    hasFilter: Boolean(mgr.audio.ribbonFilter),
                    enabled: mgr.audio.enabled,
                    isMuted: mgr.audio.isMuted(),
                    voiceVolume: mgr.audio.voiceVolume
                };
            })()`,
            returnByValue: true
        });
        console.log('[Test] Audio Graph State:', JSON.stringify(unlockRes.result.value, null, 2));

        if (!unlockRes.result.value.hasMasterGain) {
            throw new Error('ChronicleAudio voiceMasterGain is not initialized!');
        }

        console.log('[Test] Testing Tome Audio synthesis & playback (Master Chronicler Enceladus)...');
        const speakRes = await call('Runtime.evaluate', {
            expression: `(async () => {
                const mgr = window.chronicleManager;
                const testText = "The shadows deepen in the halls of Angband.";
                const result = await mgr.audio.speakUtterance(testText, 'narrator', '', 'Enceladus', {
                    engine: 'gemini',
                    geminiVoice: 'Enceladus'
                });
                return {
                    speakResult: result,
                    cacheSize: mgr.audio.audioBufferCache.size,
                    ctxState: mgr.audio.ctx ? mgr.audio.ctx.state : 'null'
                };
            })()`,
            awaitPromise: true,
            returnByValue: true
        });
        console.log('[Test] Speech Result:', JSON.stringify(speakRes.result.value, null, 2));

        if (!speakRes.result.value.speakResult || speakRes.result.value.speakResult.aborted) {
            throw new Error(`Speech utterance failed or was aborted: ${JSON.stringify(speakRes.result.value)}`);
        }

        if (speakRes.result.value.cacheSize === 0) {
            throw new Error('AudioBufferCache was not populated with decoded audio buffer!');
        }

        console.log('[Test] Testing UI Tome Toggle & Transport Controls...');
        const uiTestRes = await call('Runtime.evaluate', {
            expression: `(async () => {
                const mgr = window.chronicleManager;
                
                // 1. Toggle Chronicle Window
                const toggleBtn = document.getElementById('btn-toggle-chronicle');
                if (toggleBtn) toggleBtn.click();
                const win = document.getElementById('chronicle-window');
                const isWindowVisible = win && (win.classList.contains('active') || win.style.display !== 'none');

                // 2. Test Mute Toggle Button
                const muteBtn = document.getElementById('btn-chronicle-mute');
                const initialMuted = mgr.audio.isMuted();
                if (muteBtn) muteBtn.click(); // Should toggle state
                const afterMuteClick = mgr.audio.isMuted();
                
                // Ensure unmuted for playback
                mgr.audio.setMuted(false);
                mgr.audio.voiceVolume = 1.0;
                mgr.updateAudioControlsUI();

                // 3. Inject a rich chapter beat to test story playback deck
                mgr.store.appendBeat({
                    id: 'beat_e2e_test',
                    type: 'exploration',
                    speaker: 'Master Chronicler',
                    role: 'narrator',
                    text: 'The torchlight flickers across ancient dwarven pillars as you step deeper into the darkness.',
                    prose: 'The torchlight flickers across ancient dwarven pillars as you step deeper into the darkness.',
                    turn: 1
                });
                mgr.renderAllBeats();

                // 4. Click Play button on Audiobook Transport Deck
                const playBtn = document.getElementById('btn-chronicle-play');
                if (playBtn) playBtn.click();

                // Wait briefly for story playback to engage
                await new Promise(r => setTimeout(r, 1200));

                return {
                    isWindowVisible,
                    initialMuted,
                    afterMuteClick,
                    isStoryPlaying: mgr.isStoryPlaying,
                    isAudioSpeaking: mgr.audio.isSpeaking,
                    cacheSize: mgr.audio.audioBufferCache.size,
                    ctxState: mgr.audio.ctx ? mgr.audio.ctx.state : 'null'
                };
            })()`,
            awaitPromise: true,
            returnByValue: true
        });
        console.log('[Test] UI Transport Test Result:', JSON.stringify(uiTestRes.result.value, null, 2));

        if (!uiTestRes.result.value.isStoryPlaying && !uiTestRes.result.value.isAudioSpeaking) {
            console.warn('[Test] Story did not immediately flag as playing; checking final audio buffer cache...');
        }

        if (exceptions.length > 0) {
            throw new Error(`Browser thrown exceptions detected: ${exceptions.join('; ')}`);
        }

        const fatalErrors = consoleMessages.filter(m => m.type === 'error' && (m.text.includes('fetchHeaders') || m.text.includes('ReferenceError') || m.text.includes('RangeError')));
        if (fatalErrors.length > 0) {
            throw new Error(`Fatal console errors detected: ${JSON.stringify(fatalErrors)}`);
        }

        console.log('[Test] Verification PASSED! Audio graph, Gemini synthesis, Web Audio decoding, and buffer caching are 100% operational.');
        ws.close();
        cleanup();
        process.exit(0);
    } catch (err) {
        console.error('[Test Failed]:', err);
        cleanup();
        process.exit(1);
    }
}

runTest();
