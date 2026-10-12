const { runCdpSession } = require('./lib/cdp');

async function main() {
    await runCdpSession('https://angband3d.com', async ({ ws, send, evaluate, takeScreenshot }) => {
        // Enable Console and Network
        await send('Console.enable');
        await send('Runtime.enable');
        await send('Network.enable');

        const consoleMessages = [];
        const networkFailures = [];

        ws.on('message', data => {
            const msg = JSON.parse(data.toString());
            if (msg.method === 'Runtime.consoleAPICalled') {
                console.log('[BROWSER CONSOLE]', msg.params.type, msg.params.args.map(a => a.value || a.description).join(' '));
            } else if (msg.method === 'Runtime.exceptionThrown') {
                console.error('[BROWSER EXCEPTION]', msg.params.exceptionDetails);
            } else if (msg.method === 'Network.loadingFailed') {
                console.error('[NETWORK FAILED]', msg.params.requestId, msg.params.errorText);
            } else if (msg.method === 'Network.responseReceived') {
                if (msg.params.response.status >= 400) {
                    console.error('[HTTP ERROR]', msg.params.response.status, msg.params.response.url);
                }
            }
        });

        console.log('Waiting 3s for page to load...');
        await new Promise(r => setTimeout(r, 3000));

        const appState0 = await evaluate('window.__app ? window.__app.getAppState() : null');
        console.log('Initial appState:', appState0);

        // Click on Enter Realm button
        console.log('Clicking #btn-splash-start...');
        const clickSplash = await evaluate(`(() => {
            const btn = document.getElementById('btn-splash-start');
            if (!btn) return 'not found';
            btn.click();
            return 'clicked';
        })()`);
        console.log('Click splash result:', clickSplash);

        await new Promise(r => setTimeout(r, 1000));

        const appState1 = await evaluate('window.__app ? window.__app.getAppState() : null');
        console.log('AppState after clicking splash:', appState1);

        // Click Quick Start (Random Hero)
        console.log('Clicking Quick Start (#btn-menu-random)...');
        const clickRandom = await evaluate(`(() => {
            const btn = document.getElementById('btn-menu-random');
            if (!btn) return 'not found';
            btn.click();
            return 'clicked';
        })()`);
        console.log('Click random result:', clickRandom);

        // Wait up to 10s and observe frames
        for (let i = 0; i < 10; i++) {
            await new Promise(r => setTimeout(r, 1000));
            const status = await evaluate(`(() => {
                const a = window.__app;
                const f = a && a.getLastFrame ? a.getLastFrame() : window.__lastFrame;
                const loading = document.getElementById('loading-overlay');
                const term = document.getElementById('terminal-container');
                return {
                    appState: a ? a.getAppState() : null,
                    loadingVisible: loading && !loading.classList.contains('hidden'),
                    termVisible: term && !term.classList.contains('hidden'),
                    phase: f ? f.phase : null,
                    hasMap: !!(f && f.map),
                    hasPlayer: !!(f && f.player)
                };
            })()`);
            console.log(`[T+${i+1}s] Status:`, JSON.stringify(status));
            if (status.phase === 'play' && status.hasMap) {
                console.log('SUCCESS! REACHED 3D PLAY ON LIVE SITE!');
                break;
            }
        }
    });
}

main().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
