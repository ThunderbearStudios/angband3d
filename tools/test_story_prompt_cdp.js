'use strict';
const path = require('path');
const fs = require('fs');
const { runCdpSession, sleep } = require('../tools/lib/cdp');

const testChar = `Tale_${Date.now().toString(36).slice(-4)}`;
const TARGET_URL = `http://localhost:8080/?play=1&new=1&realm=angband&lang=en&char=${testChar}`;

async function main() {
    console.log('[Test] Starting CDP verification for Story Prompt on localhost:8080...');
    let passed = false;

    await runCdpSession(TARGET_URL, async ({ evaluate, sendCommand, takeScreenshot }) => {
        // Wait for 3D play
        console.log('[Test] Waiting for 3D play state...');
        for (let i = 0; i < 35; i++) {
            await evaluate(`(() => {
                const a = window.__app;
                if (a && a.isBirthReviewActive && a.isBirthReviewActive() && a.confirmHeroBirth) {
                    a.confirmHeroBirth();
                }
            })()`);
            const inPlay = await evaluate(`(() => {
                const a = window.__app;
                if (!a) return false;
                const f = a.getLastFrame ? a.getLastFrame() : window.__lastFrame;
                const term = document.getElementById('terminal-container');
                return f && f.phase === 'play' && f.map && f.player && term && term.classList.contains('hidden');
            })()`);
            if (inPlay) {
                console.log(`[Test] Reached 3D play on iteration ${i}!`);
                break;
            }
            await sleep(1000);
        }

        // 1. Verify #btn-story-prompt is NOT in top-right-bar or DOM (Tale is exclusively in Tome deck)
        const hudState = await evaluate(`(() => {
            const topStoryBtn = document.getElementById('btn-story-prompt');
            const tomeBtn = document.getElementById('btn-toggle-chronicle');
            const cm = window.chronicleManager;
            const audio = cm ? cm.audio : null;
            return {
                isApk: window.__app ? window.__app.isApk : null,
                chronicleClass: typeof ChronicleManager,
                cmExists: !!cm,
                audioExists: !!audio,
                topStoryBtnExists: !!topStoryBtn,
                tomeExists: !!tomeBtn,
                tomeVisible: tomeBtn && tomeBtn.style.display !== 'none',
                narratorVoice: audio ? audio.narratorVoice : null
            };
        })()`);
        console.log('[Test] HUD state & Narrator voice:', JSON.stringify(hudState));
        if (hudState.topStoryBtnExists) {
            throw new Error('#btn-story-prompt must NOT exist in top-right-bar (Tale button belongs only in Tome menu)');
        }
        if (!hudState.tomeExists || !hudState.tomeVisible) {
            throw new Error('#btn-toggle-chronicle must exist and be visible in 3D play');
        }
        if (hudState.narratorVoice !== 'Enceladus') {
            throw new Error(`Expected narrator voice to be Enceladus (Old English male voice), got "${hudState.narratorVoice}"`);
        }

        // 2. Open Living Chronicle Tome window
        console.log('[Test] Opening Living Chronicle Tome window...');
        await evaluate(`(() => {
            if (window.chronicleManager) {
                window.chronicleManager.showWindow();
            }
        })()`);
        await sleep(500);

        // 3. Verify transport deck button #btn-chronicle-prompt-tale exists and is visible in Tome menu
        const tomeDeckState = await evaluate(`(() => {
            const btn = document.getElementById('btn-chronicle-prompt-tale');
            const win = document.getElementById('chronicle-window');
            return {
                exists: !!btn,
                winVisible: win && win.style.display !== 'none' && !win.classList.contains('hidden'),
                title: btn ? btn.getAttribute('title') : null,
                text: btn ? btn.textContent.trim() : null
            };
        })()`);
        console.log('[Test] Tome deck button state:', JSON.stringify(tomeDeckState));
        if (!tomeDeckState.exists) {
            throw new Error('#btn-chronicle-prompt-tale must exist in chronicle-window transport deck');
        }

        // 4. Click Tale button inside Tome transport deck
        console.log('[Test] Clicking #btn-chronicle-prompt-tale inside Tome menu...');
        await evaluate(`(() => {
            const btn = document.getElementById('btn-chronicle-prompt-tale');
            if (btn) btn.click();
        })()`);
        await sleep(1500);

        // 5. Verify chronicle state
        const chronicleState = await evaluate(`(() => {
            const mgr = window.chronicleManager;
            if (!mgr) return { error: 'No chronicleManager' };
            const active = mgr.activeChronicle;
            const chapters = active ? active.chapters : [];
            const promptChapters = chapters.filter(c => c && (c.isStoryPrompt || (c.title && c.title.includes('Tale'))));
            const promptCards = document.querySelectorAll('.chapter-story-prompt');
            return {
                active: !!active,
                totalChapters: chapters.length,
                promptChaptersCount: promptChapters.length,
                lastChapterTitle: chapters.length > 0 ? chapters[chapters.length - 1].title : null,
                lastChapterProse: chapters.length > 0 ? chapters[chapters.length - 1].prose : null,
                domPromptCardsCount: promptCards.length
            };
        })()`);
        console.log('[Test] Chronicle state after click:', JSON.stringify(chronicleState));
        if (chronicleState.promptChaptersCount < 1) {
            throw new Error('Expected at least 1 story prompt chapter in activeChronicle');
        }
        if (chronicleState.domPromptCardsCount < 1) {
            throw new Error('Expected at least 1 .chapter-story-prompt card rendered in DOM');
        }

        // 6. Capture verification screenshot
        const scrPath = path.join(__dirname, '..', 'tools', 'story_prompt_verified.png');
        await takeScreenshot(scrPath);
        console.log('[Test] Screenshot saved to:', scrPath);

        passed = true;
    });

    if (!passed) {
        console.error('[Test] Verification failed!');
        process.exit(1);
    }
    console.log('[Test] SUCCESS: Story prompt end-to-end verified in live Chrome browser!');
}

main().catch(err => {
    console.error('[Test] ERROR:', err);
    process.exit(1);
});
