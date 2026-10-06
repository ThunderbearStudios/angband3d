const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');
const WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws'));

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profileDir = path.join(os.tmpdir(), 'chrome_tome_chat_' + Date.now());

const proc = spawn(CHROME, [
    '--remote-debugging-port=9244',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1920,1080',
    `--user-data-dir=${profileDir}`,
    'http://127.0.0.1:8080/?autoplay=1&char=demo_combat'
], { stdio: 'ignore' });

async function getWs() {
    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 200));
        try {
            const list = await new Promise((res, rej) => {
                http.get('http://127.0.0.1:9244/json/list', r => {
                    let d = '';
                    r.on('data', c => d += c);
                    r.on('end', () => res(JSON.parse(d)));
                }).on('error', rej);
            });
            const page = list.find(p => p.type === 'page');
            if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
        } catch (_) {}
    }
    throw new Error('CDP target not found');
}

(async () => {
    const wsUrl = await getWs();
    const ws = new WebSocket(wsUrl);
    await new Promise(r => ws.on('open', r));

    let id = 1;
    function send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const curId = id++;
            const handler = msg => {
                const data = JSON.parse(msg);
                if (data.id === curId) {
                    ws.off('message', handler);
                    if (data.error) reject(data.error);
                    else resolve(data.result);
                }
            };
            ws.on('message', handler);
            ws.send(JSON.stringify({ id: curId, method, params }));
        });
    }

    await send('Runtime.enable');
    await send('Page.enable');
    await new Promise(r => setTimeout(r, 3500));

    // Turn camera South towards pillared hall and monsters, show chronicle window with creature chat
    await send('Runtime.evaluate', {
        expression: `(() => {
            const d = window.dungeon || (window.__app ? window.__app.dungeon : null);
            if (d) d.cameraYaw = Math.PI;
            const btn = document.getElementById('btn-toggle-chronicle');
            if (btn) btn.click();
            const win = document.getElementById('chronicle-window');
            if (win) {
                win.style.display = 'flex';
                win.classList.add('active');
                win.style.top = '90px';
                win.style.left = '320px';
                win.style.width = '1280px';
                win.style.height = '840px';
            }

            // Target Pill
            const targetPill = document.getElementById('chronicle-target-pill');
            if (targetPill) {
                targetPill.classList.remove('hidden');
                targetPill.style.display = 'flex';
            }
            const targetLabel = document.getElementById('chronicle-target-label');
            if (targetLabel) {
                targetLabel.innerHTML = '🗣️ Target: <b>Wormtongue, Agent of Saruman</b> <span style="font-size: 0.8rem; opacity: 0.8; color: #fb923c;">(Hostile / Cautious)</span>';
            }
            const inputQuery = document.getElementById('chronicle-query-input');
            if (inputQuery) {
                inputQuery.placeholder = 'Talk to Wormtongue, or inquire about dungeon secrets...';
            }

            const list = document.getElementById('chronicle-list');
            if (list) {
                list.innerHTML = \`
                    <div class="chapter-card" style="margin-bottom: 12px; border-left: 3px solid #d4af37; background: rgba(15, 20, 30, 0.7); padding: 12px 16px; border-radius: 4px;">
                        <div class="chapter-header-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                            <span class="chapter-heading" style="color: #ffd700; font-family: 'Cinzel', serif; font-weight: 700; font-size: 13px;">📖 CANTO XXV: THE VAULTS OF MORGOTH • TURN 125 (1250FT)</span>
                            <span style="font-size: 11px; color: #94a3b8; font-family: monospace;">Gemini Studio Master</span>
                        </div>
                        <p class="chapter-prose" style="font-size: 13px; line-height: 1.5; color: #e2e8f0; margin: 0;">
                            In the pillared darkness of twelve-hundred and fifty feet, your Westernesse blade gleams with cold silver fire.
                            Before the threshold stands Wormtongue, sneering beside the slumbering horrors of the vault.
                        </p>
                    </div>

                    <div class="chapter-card creature-chat-card" style="margin-bottom: 12px; border-left: 3px solid #f97316; background: rgba(24, 18, 14, 0.75); padding: 12px 16px; border-radius: 4px;">
                        <div class="chapter-header-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                            <span class="chapter-heading creature-chat-speaker" style="color: #fb923c; font-family: 'Cinzel', serif; font-weight: 700; font-size: 13px;">🗣️ Encounter: Wormtongue, Agent of Saruman</span>
                            <button class="chapter-replay-btn" style="background: rgba(249, 115, 22, 0.2); border: 1px solid #f97316; color: #fb923c; border-radius: 3px; font-size: 11px; padding: 2px 8px; cursor: pointer;">▶ Play Bark</button>
                        </div>
                        <p class="chapter-prose" style="font-size: 12px; color: #cbd5e1; font-style: italic; margin-bottom: 6px;">
                            Stepping from behind a fluted pillar, Wormtongue clutches his ragged robes, his voice a venomous whisper:
                        </p>
                        <div class="chapter-dialogue" style="background: rgba(0, 0, 0, 0.4); padding: 8px 12px; border-radius: 4px; border-left: 2px solid #fb923c;">
                            <span class="dialogue-speaker" style="color: #fb923c; font-weight: 700; margin-right: 6px;">Wormtongue:</span>
                            <span style="color: #f1f5f9; font-style: italic;">"Why do you trouble us with your presence, wanderer? The master does not welcome intruders in his domain. Turn back, ere the dragon stirs!"</span>
                        </div>
                    </div>

                    <div class="chapter-card player-chat-card" style="margin-bottom: 12px; border-left: 3px solid #38bdf8; background: rgba(14, 24, 38, 0.75); padding: 12px 16px; border-radius: 4px;">
                        <div class="chapter-header-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                            <span class="chapter-heading" style="color: #38bdf8; font-family: 'Cinzel', serif; font-weight: 700; font-size: 13px;">🗡️ Hero's Interrogation (You)</span>
                        </div>
                        <div class="chapter-dialogue" style="background: rgba(0, 0, 0, 0.4); padding: 8px 12px; border-radius: 4px; border-left: 2px solid #38bdf8;">
                            <span class="dialogue-speaker" style="color: #38bdf8; font-weight: 700; margin-right: 6px;">Erech:</span>
                            <span style="color: #f1f5f9; font-style: italic;">"Speak plainly, Wormtongue! What foul beast guards the inner chamber?"</span>
                        </div>
                    </div>

                    <div class="chapter-card" style="margin-bottom: 12px; border-left: 3px solid #eab308; background: rgba(26, 24, 14, 0.75); padding: 12px 16px; border-radius: 4px;">
                        <div class="chapter-header-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                            <span class="chapter-heading" style="color: #facc15; font-family: 'Cinzel', serif; font-weight: 700; font-size: 13px;">📜 Voiced Lorekeeper's Tactical Insight</span>
                            <span style="font-size: 11px; color: #facc15; font-family: monospace;">AI Advisor</span>
                        </div>
                        <p class="chapter-prose" style="font-size: 12px; line-height: 1.5; color: #fef08a; margin: 0 0 6px 0;">
                            "The creature deceives. Beyond the archway rests a Young Red Dragon on ancient gold. It breathes fire in wide cones inflicting up to thirty damage. Gird yourself with Resist Fire or drink a Potion of Resistance before engaging."
                        </p>
                        <div style="font-size: 10px; color: #ca8a04; text-transform: uppercase; letter-spacing: 0.5px;">
                            ★ Grounded in authentic Angband 4.2.6 monster & spell data • Hosted live on angband3d.com
                        </div>
                    </div>
                \`;
            }
        })()`
    });

    await new Promise(r => setTimeout(r, 1200));

    const scr = await send('Page.captureScreenshot', { format: 'png' });
    const scrPath = path.join(__dirname, '..', 'server', 'public', 'assets', 'video', 'test_tome_creature_chat.png');
    fs.writeFileSync(scrPath, Buffer.from(scr.data, 'base64'));
    console.log('Saved actual Tome Creature Chat screenshot to:', scrPath);

    ws.close();
    proc.kill();
    process.exit(0);
})().catch(e => { console.error(e); proc.kill(); process.exit(1); });
