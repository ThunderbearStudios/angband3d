const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { WebSocket } = require('../server/node_modules/ws');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function testPage(url, isModal = false) {
    const port = 9340 + Math.floor(Math.random() * 100);
    const pDir = path.join(os.tmpdir(), 'chrome_live_test_' + Date.now() + '_' + port);
    
    console.log(`\nLaunching Chrome for ${url} (port ${port})...`);
    const ch = spawn(CHROME, [
        '--remote-debugging-port=' + port,
        '--headless=new',
        '--window-size=1920,1080',
        '--autoplay-policy=no-user-gesture-required',
        '--user-data-dir=' + pDir,
        url
    ], { stdio: 'ignore' });

    let wsUrl = null;
    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 200));
        try {
            const list = await new Promise((res, rej) => http.get('http://127.0.0.1:' + port + '/json', r => {
                let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
            }).on('error', rej));
            const p = list.find(x => x.type === 'page');
            if (p && p.webSocketDebuggerUrl) { wsUrl = p.webSocketDebuggerUrl; break; }
        } catch(_) {}
    }

    if (!wsUrl) {
        ch.kill();
        throw new Error('Failed to connect to Chrome CDP on port ' + port);
    }

    const ws = new WebSocket(wsUrl);
    await new Promise(r => ws.on('open', r));
    let id = 1;
    const send = (m, p = {}) => new Promise((res, rej) => {
        const myId = id++;
        const h = d => {
            const j = JSON.parse(d);
            if (j.id === myId) {
                ws.off('message', h);
                if (j.error) rej(j.error);
                else res(j.result);
            }
        };
        ws.on('message', h);
        ws.send(JSON.stringify({ id: myId, method: m, params: p }));
    });

    await send('Page.enable');
    await send('Runtime.enable');
    await new Promise(r => setTimeout(r, 2500));

    if (isModal) {
        console.log('Opening Demo Theater modal on home page...');
        await send('Runtime.evaluate', {
            expression: `(() => {
                const btn = document.getElementById('btn-splash-demo') || document.getElementById('btn-menu-demo');
                if (btn) btn.click();
                else if (window.demoPlayer) window.demoPlayer.open('splash');
            })()`
        });
        await new Promise(r => setTimeout(r, 1500));
    }

    // 1. Initial State Check
    const state0 = await send('Runtime.evaluate', {
        expression: `(() => {
            const v = document.getElementById('demo-video-player');
            const acts = Array.from(document.querySelectorAll('.demo-chapter-pill')).map(b => ({
                label: b.innerText,
                time: parseFloat(b.dataset.time),
                active: b.classList.contains('active')
            }));
            const glow = document.getElementById('demo-ambient-glow') ? document.getElementById('demo-ambient-glow').style.background : '';
            return {
                videoReady: !!v,
                currentTime: v ? v.currentTime : -1,
                duration: v ? v.duration : -1,
                paused: v ? v.paused : true,
                actsCount: acts.length,
                acts,
                glow
            };
        })()`,
        returnByValue: true
    });
    console.log('Initial State:', JSON.stringify(state0.result.value, null, 2));

    // 2. Click Act 3 (80x24 CRT Terminal, 75.0s)
    console.log('Clicking Act 3 (75.0s)...');
    await send('Runtime.evaluate', {
        expression: `(() => {
            const btn = document.querySelector('.demo-chapter-pill[data-time="75.0"]') || document.querySelector('.demo-chapter-pill[data-time="75"]');
            if (btn) btn.click();
        })()`
    });
    await new Promise(r => setTimeout(r, 2500));

    const stateAct3 = await send('Runtime.evaluate', {
        expression: `(() => {
            const v = document.getElementById('demo-video-player');
            const activeBtn = document.querySelector('.demo-chapter-pill.active');
            const glow = document.getElementById('demo-ambient-glow') ? document.getElementById('demo-ambient-glow').style.background : '';
            return {
                currentTime: v ? v.currentTime : -1,
                activeAct: activeBtn ? activeBtn.innerText.replace(/\\n/g, ' ') : null,
                glow
            };
        })()`,
        returnByValue: true
    });
    console.log('State after Act 3 click:', JSON.stringify(stateAct3.result.value, null, 2));

    // 3. Click Act 7 (Dragon Clash, 197.5s)
    console.log('Clicking Act 7 (197.5s)...');
    await send('Runtime.evaluate', {
        expression: `(() => {
            const btn = document.querySelector('.demo-chapter-pill[data-time="197.5"]');
            if (btn) btn.click();
        })()`
    });
    await new Promise(r => setTimeout(r, 2500));

    const stateAct7 = await send('Runtime.evaluate', {
        expression: `(() => {
            const v = document.getElementById('demo-video-player');
            const activeBtn = document.querySelector('.demo-chapter-pill.active');
            const glow = document.getElementById('demo-ambient-glow') ? document.getElementById('demo-ambient-glow').style.background : '';
            return {
                currentTime: v ? v.currentTime : -1,
                activeAct: activeBtn ? activeBtn.innerText.replace(/\\n/g, ' ') : null,
                glow
            };
        })()`,
        returnByValue: true
    });
    // 4. Test Arrow Right (+5s skip forward) and Arrow Left (-5s skip backward)
    console.log('Testing Arrow Right (+5s skip forward)...');
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 39, code: 'ArrowRight', key: 'ArrowRight' });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 39, code: 'ArrowRight', key: 'ArrowRight' });
    await new Promise(r => setTimeout(r, 1200));

    const stateArrowRight = await send('Runtime.evaluate', {
        expression: '(() => { const v = document.getElementById("demo-video-player"); return { currentTime: v ? v.currentTime : -1 }; })()',
        returnByValue: true
    });
    console.log('State after Arrow Right:', JSON.stringify(stateArrowRight.result.value));

    console.log('Testing Arrow Left (-5s skip backward)...');
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', windowsVirtualKeyCode: 37, code: 'ArrowLeft', key: 'ArrowLeft' });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 37, code: 'ArrowLeft', key: 'ArrowLeft' });
    await new Promise(r => setTimeout(r, 1200));

    const stateArrowLeft = await send('Runtime.evaluate', {
        expression: '(() => { const v = document.getElementById("demo-video-player"); return { currentTime: v ? v.currentTime : -1 }; })()',
        returnByValue: true
    });
    console.log('State after Arrow Left:', JSON.stringify(stateArrowLeft.result.value));

    // Screenshot
    const snapName = isModal ? 'snap_live_modal.png' : 'snap_live_demo.png';
    const s = await send('Page.captureScreenshot');
    fs.writeFileSync(path.join('tools', snapName), Buffer.from(s.data, 'base64'));
    console.log(`Saved screenshot to tools/${snapName}`);

    ws.close();
    ch.kill();
    return {
        state0: state0.result.value,
        stateAct3: stateAct3.result.value,
        stateAct7: stateAct7.result.value,
        stateArrowRight: stateArrowRight.result.value,
        stateArrowLeft: stateArrowLeft.result.value
    };
}

(async () => {
    const BASE_URL = (process.argv[2] || 'https://angband3d.com').replace(/\/+$/, '');
    console.log(`=== TESTING DEDICATED DEMO PAGE (${BASE_URL}/demo) ===`);
    const demoRes = await testPage(BASE_URL + '/demo');

    console.log(`\n=== TESTING MAIN PAGE MODAL (${BASE_URL}) ===`);
    const mainRes = await testPage(BASE_URL, true);

    console.log('\n================ TEST SUMMARY ================');
    const demoOk = Math.abs(demoRes.stateAct3.currentTime - 75) < 5 && Math.abs(demoRes.stateAct7.currentTime - 197.5) < 5;
    const mainOk = Math.abs(mainRes.stateAct3.currentTime - 75) < 5 && Math.abs(mainRes.stateAct7.currentTime - 197.5) < 5;
    const demoArrowOk = demoRes.stateArrowRight.currentTime > demoRes.stateAct7.currentTime && demoRes.stateArrowLeft.currentTime < demoRes.stateArrowRight.currentTime;
    const mainArrowOk = mainRes.stateArrowRight.currentTime > mainRes.stateAct7.currentTime && mainRes.stateArrowLeft.currentTime < mainRes.stateArrowRight.currentTime;
    console.log('Demo Page Act Navigation Working:', demoOk ? '✅ PASS' : '❌ FAIL');
    console.log('Modal Page Act Navigation Working:', mainOk ? '✅ PASS' : '❌ FAIL');
    console.log('Demo Page Arrow Key Skipping Working:', demoArrowOk ? '✅ PASS' : '❌ FAIL');
    console.log('Modal Page Arrow Key Skipping Working:', mainArrowOk ? '✅ PASS' : '❌ FAIL');
    if (!demoOk || !mainOk || !demoArrowOk || !mainArrowOk) {
        process.exit(1);
    }
})().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
