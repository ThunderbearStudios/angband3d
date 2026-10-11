const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const WebSocket = require('../server/node_modules/ws');

async function testLocalSecurity() {
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const port = 9260;
    const tempDir = path.join(__dirname, 'temp_chrome_audit_local');

    console.log(`[LocalAudit] Launching Chrome on port ${port}...`);
    const chrome = spawn(chromePath, [
        '--headless=new',
        `--remote-debugging-port=${port}`,
        '--disable-gpu-shader-disk-cache',
        '--window-size=1280,800',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${tempDir}`
    ], { stdio: 'ignore' });

    let target = null;
    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 200));
        try {
            const res = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent('http://localhost:8080')}`, { method: 'PUT' });
            target = await res.json();
            if (target && target.webSocketDebuggerUrl) break;
        } catch (_) {}
    }

    if (!target) {
        try { chrome.kill(); } catch (_) {}
        throw new Error(`Chrome failed to respond on port ${port}`);
    }

    try {
        const ws = new WebSocket(target.webSocketDebuggerUrl);

        await new Promise((resolve) => {
            let id = 1;
            const callbacks = new Map();
            const securityIssues = [];
            const consoleErrors = [];
            const failedRequests = [];

            function send(method, params = {}) {
                return new Promise((r) => {
                    const reqId = id++;
                    callbacks.set(reqId, r);
                    ws.send(JSON.stringify({ id: reqId, method, params }));
                });
            }

            ws.on('open', async () => {
                await send('Page.enable');
                await send('Network.enable');
                await send('Log.enable');
                await send('Security.enable');
                await send('Audits.enable');
                await send('Runtime.enable');

                setTimeout(async () => {
                    console.log('\n========================================');
                    console.log('--- LOCAL SECURITY & HEALTH AUDIT RESULTS ---');
                    console.log('========================================');
                    console.log('Security Issues count:', securityIssues.length);
                    for (const issue of securityIssues) console.log('  [SECURITY]:', JSON.stringify(issue));
                    console.log('Console Errors/Warnings count:', consoleErrors.length);
                    for (const err of consoleErrors) console.log(`  [CONSOLE ${err.level}]:`, err.text);
                    console.log('Failed Requests count:', failedRequests.length);
                    for (const f of failedRequests) console.log('  [NET FAILED]:', f.url, '->', f.errorText);
                    console.log('========================================\n');
                    resolve();
                }, 4000);
            });

            ws.on('message', (msg) => {
                const data = JSON.parse(msg.toString());
                if (data.id && callbacks.has(data.id)) {
                    const cb = callbacks.get(data.id);
                    callbacks.delete(data.id);
                    cb(data.result);
                }
                if (data.method === 'Audits.issueAdded') securityIssues.push(data.params.issue);
                if (data.method === 'Log.entryAdded' && (data.params.entry.level === 'error' || data.params.entry.level === 'warning')) {
                    consoleErrors.push(data.params.entry);
                }
                if (data.method === 'Runtime.consoleAPICalled' && (data.params.type === 'error' || data.params.type === 'warning')) {
                    consoleErrors.push({ level: data.params.type, text: data.params.args.map(a => a.value || a.description || '').join(' ') });
                }
                if (data.method === 'Network.loadingFailed') failedRequests.push(data.params);
            });
        });
        ws.close();
    } finally {
        try { chrome.kill(); } catch (_) {}
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    }
}

testLocalSecurity()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
