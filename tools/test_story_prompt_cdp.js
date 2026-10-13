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

        // Verify button exists in DOM
        const btnState = await evaluate(`(() => {
            const btn = document.getElementById('btn-story-prompt');
            const tomeBtn = document.getElementById('btn-toggle-chronicle');
            return {
                exists: !!btn,
                visible: btn && btn.style.display !== 'none' && btn.offsetWidth > 0,
                text: btn ? btn.textContent.trim() : null,
                title: btn ? btn.getAttribute('title') : null,
                tomeExists: !!tomeBtn,
                tomeVisible: tomeBtn && tomeBtn.style.display !== 'none'
            };
        })()`);
        console.log('[Test] Button state in top-right-bar:', JSON.stringify(btnState));
        if (!btnState.exists || !btnState.visible) {
            throw new Error('#btn-story-prompt must exist and be visible in 3D play');
        }

        // Click #btn-story-prompt
        console.log('[Test] Clicking #btn-story-prompt...');
        await evaluate(`(() => {
            const btn = document.getElementById('btn-story-prompt');
            if (btn) btn.click();
        })()`);
        await sleep(1500);

        // Verify chronicle state
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

        // Verify transport deck button #btn-chronicle-prompt-tale exists
        const tomeDeckState = await evaluate(`(() => {
            const btn = document.getElementById('btn-chronicle-prompt-tale');
            return {
                exists: !!btn,
                title: btn ? btn.getAttribute('title') : null,
                text: btn ? btn.textContent.trim() : null
            };
        })()`);
        console.log('[Test] Tome deck button state:', JSON.stringify(tomeDeckState));
        if (!tomeDeckState.exists) {
            throw new Error('#btn-chronicle-prompt-tale must exist in chronicle-window');
        }

        // Capture verification screenshot
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
