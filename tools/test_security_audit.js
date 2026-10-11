const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const WebSocket = require('../server/node_modules/ws');

async function auditSite(targetUrl) {
    console.log(`\n======================================================`);
    console.log(`[Security Audit] Testing target: ${targetUrl}`);
    console.log(`======================================================`);

    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const port = 9250 + Math.floor(Math.random() * 50);
    const tempDir = path.join(__dirname, 'temp_chrome_audit_' + Date.now());

    const chrome = spawn(chromePath, [
        '--headless=new',
        `--remote-debugging-port=${port}`,
        '--window-size=1280,800',
        '--no-first-run',
        '--no-default-browser-check',
        `--user-data-dir=${tempDir}`
    ], { stdio: 'ignore' });

    let res = null;
    for (let attempt = 0; attempt < 12; attempt++) {
        try {
            res = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(targetUrl)}`, { method: 'PUT' });
            if (res.ok) break;
        } catch (_) {
            await new Promise(r => setTimeout(r, 300));
        }
    }
    if (!res || !res.ok) {
        throw new Error(`Failed to connect to headless Chrome on port ${port}`);
    }

    try {
        const target = await res.json();
        const ws = new WebSocket(target.webSocketDebuggerUrl);

        await new Promise((resolve, reject) => {
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
                await send('Runtime.enable');

                // Wait 6 seconds for full page load and resource fetching
                setTimeout(async () => {
                    console.log(`\n[Results for ${targetUrl}]`);
                    console.log(`Security Issues count: ${securityIssues.length}`);
                    for (const issue of securityIssues) {
                        console.log(`  [SECURITY]:`, issue);
                    }

                    console.log(`Console Errors/Warnings count: ${consoleErrors.length}`);
                    for (const err of consoleErrors) {
                        console.log(`  [CONSOLE ${err.level}]:`, err.text, err.url ? `(at ${err.url}:${err.lineNumber})` : '');
                    }

                    console.log(`Failed Requests count: ${failedRequests.length}`);
                    for (const f of failedRequests) {
                        console.log(`  [NET FAILED]: ${f.url} -> ${f.errorText} (${f.canceled ? 'Canceled' : 'Blocked/Failed'})`);
                    }

                    resolve();
                }, 6000);
            });

            ws.on('message', (msg) => {
                const data = JSON.parse(msg.toString());
                if (data.id && callbacks.has(data.id)) {
                    const cb = callbacks.get(data.id);
                    callbacks.delete(data.id);
                    cb(data.result);
                }

                if (data.method === 'Security.securityStateChanged') {
                    if (data.params.securityState !== 'secure') {
                        securityIssues.push(data.params);
                    }
                }

                if (data.method === 'Audits.issueAdded') {
                    securityIssues.push(data.params.issue);
                }

                if (data.method === 'Log.entryAdded') {
                    const entry = data.params.entry;
                    if (entry.level === 'error' || entry.level === 'warning') {
                        consoleErrors.push(entry);
                    }
                }

                if (data.method === 'Runtime.consoleAPICalled') {
                    const params = data.params;
                    if (params.type === 'error' || params.type === 'warning') {
                        consoleErrors.push({
                            level: params.type,
                            text: params.args.map(a => a.value || a.description || '').join(' ')
                        });
                    }
                }

                if (data.method === 'Network.loadingFailed') {
                    failedRequests.push(data.params);
                }
            });

            ws.on('error', reject);
        });

        ws.close();
    } finally {
        try { chrome.kill(); } catch (_) {}
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    }
}

(async () => {
    await auditSite('http://localhost:8080');
    await auditSite('https://angband3d.com');
    await auditSite('https://angband3d-cloud-iuawf47jqa-uc.a.run.app');
    await auditSite('http://angband3d.com');
    process.exit(0);
})();
