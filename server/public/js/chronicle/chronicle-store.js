/**
 * ChronicleStore — Independent Story Persistence & Portability Engine
 * Manages standalone .chronicle.json files, localStorage persistence,
 * Epoch compression, and the in-universe "Torch Passes" character bridge.
 */

class ChronicleStore {
    static STORAGE_KEY = 'angband3d_active_chronicle';
    static MAX_EXPANDED_CHAPTERS = 25; // Keep 25 recent passages expanded, compress older into epochs

    static createNewChronicle(hero) {
        const name = (hero && hero.name) ? hero.name : 'Adventurer';
        const race = (hero && hero.race) ? hero.race : 'Human';
        const heroClass = (hero && hero.class) ? hero.class : 'Warrior';

        return {
            version: '1.0',
            id: 'chronicle_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
            created_at: Date.now(),
            last_updated: Date.now(),
            title: `The Chronicles of ${name}`,
            protagonists: [{
                name: name,
                race: race,
                class: heroClass,
                status: 'Active',
                started_depth: (hero && typeof hero.depth === 'number') ? hero.depth : 0,
                start_time: Date.now()
            }],
            current_protagonist_idx: 0,
            rolling_summary: (() => {
                const backstory = (typeof ChronicleGrounder !== 'undefined' && ChronicleGrounder.formatBackstorySummary) ? ChronicleGrounder.formatBackstorySummary(hero) : '';
                return backstory ? `${name}, a ${race} ${heroClass} (${backstory}), arrived at the frontier town above Angband to begin their descent.` : `${name}, a ${race} ${heroClass}, arrived in the frontier town above Angband to begin their descent.`;
            })(),
            isManuallyImported: false,
            chapters: [],
            epochs: [] // Compressed summaries of ancient chapters
        };
    }

    static isMatchingHero(chronicle, activeHero) {
        return this.checkCompatibility(chronicle, activeHero).compatible;
    }

    static loadActive() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (err) {
            console.warn('[ChronicleStore] Failed to load active chronicle from localStorage:', err);
            return null;
        }
    }

    static saveActive(chronicle) {
        if (!chronicle) return false;
        try {
            chronicle.last_updated = Date.now();
            this.enforceStorageLimits(chronicle);
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(chronicle));
            return true;
        } catch (err) {
            console.error('[ChronicleStore] Storage quota hit / write failure:', err);
            return false;
        }
    }

    static appendChapter(chronicle, chapter) {
        if (!chronicle || !chapter) return;
        chapter.chapter_num = chronicle.chapters.length + 1;
        chapter.timestamp = Date.now();
        if (!chapter.paragraphs || chapter.paragraphs.length === 0) {
            chapter.paragraphs = [{
                prose: chapter.prose,
                dialogue: chapter.dialogue || null,
                insight: chapter.insight || null,
                isLorekeeper: chapter.isLorekeeper || false,
                timestamp: chapter.timestamp
            }];
        }
        chronicle.chapters.push(chapter);
        chronicle.rolling_summary = chapter.summary || chapter.prose.substring(0, 180) + '...';
        this.saveActive(chronicle);
    }

    /**
     * Appends a continuous flowing narrative paragraph to the active chapter
     * without creating a new chapter header, keeping the saga flowing.
     */
    static appendParagraph(chronicle, entry) {
        if (!chronicle || !entry) return null;
        if (!chronicle.chapters || chronicle.chapters.length === 0) {
            const initialChapter = {
                title: 'The Journey Begins',
                depth: entry.depth || 0,
                prose: entry.prose,
                dialogue: entry.dialogue || null,
                insight: entry.insight || null,
                paragraphs: [{
                    prose: entry.prose,
                    dialogue: entry.dialogue || null,
                    insight: entry.insight || null,
                    isLorekeeper: entry.isLorekeeper || false,
                    timestamp: Date.now()
                }]
            };
            this.appendChapter(chronicle, initialChapter);
            return initialChapter;
        }

        const currentChapter = chronicle.chapters[chronicle.chapters.length - 1];
        if (!currentChapter.paragraphs) {
            currentChapter.paragraphs = [{
                prose: currentChapter.prose,
                dialogue: currentChapter.dialogue || null,
                insight: currentChapter.insight || null,
                timestamp: currentChapter.timestamp || Date.now()
            }];
        }
        currentChapter.paragraphs.push({
            prose: entry.prose,
            dialogue: entry.dialogue || null,
            insight: entry.insight || null,
            isLorekeeper: entry.isLorekeeper || false,
            timestamp: Date.now()
        });
        currentChapter.prose = currentChapter.paragraphs.map(p => p.prose).join('\n\n');
        chronicle.rolling_summary = entry.summary || entry.prose.substring(0, 180) + '...';
        this.saveActive(chronicle);
        return currentChapter;
    }

    /**
     * Prevents localStorage quota overflow by compressing old chapters
     * and maintaining only the last N base64 thumbnails.
     */
    static enforceStorageLimits(chronicle) {
        if (!chronicle || !chronicle.chapters) return;

        // Epoch Compression: If passage count exceeds threshold, compress the oldest 15
        if (chronicle.chapters.length > this.MAX_EXPANDED_CHAPTERS) {
            const numToCompress = chronicle.chapters.length - 15;
            const oldestSlice = chronicle.chapters.splice(0, numToCompress);
            
            const epochStart = oldestSlice[0].chapter_num || 1;
            const epochEnd = oldestSlice[oldestSlice.length - 1].chapter_num || oldestSlice.length;
            const combinedSummary = oldestSlice.map(c => c.prose).join(' ');

            chronicle.epochs = chronicle.epochs || [];
            chronicle.epochs.push({
                chapters_range: `Passages ${epochStart}–${epochEnd}`,
                summary: combinedSummary.substring(0, 500) + '...',
                timestamp: Date.now()
            });
        }
    }

    /**
     * Reconciles an imported chronicle with the active player.
     * Detects if the story belongs to this hero or if "The Torch Passes" bridge is needed.
     */
    static checkCompatibility(chronicle, activeHero) {
        if (!chronicle || !chronicle.protagonists || chronicle.protagonists.length === 0) {
            return { compatible: true, isNewHero: false };
        }

        const currentProtag = chronicle.protagonists[chronicle.current_protagonist_idx] || chronicle.protagonists[0];
        const heroName = (activeHero && activeHero.name) ? activeHero.name.toLowerCase() : 'adventurer';
        const heroRace = (activeHero && activeHero.race) ? activeHero.race : '';
        const heroClass = (activeHero && activeHero.class) ? activeHero.class : '';

        const isExactMatch = currentProtag.name.toLowerCase() === heroName &&
            (!heroRace || currentProtag.race === heroRace) &&
            (!heroClass || currentProtag.class === heroClass);

        return {
            compatible: isExactMatch,
            isNewHero: !isExactMatch,
            previousProtagonist: currentProtag,
            newProtagonist: {
                name: (activeHero && activeHero.name) ? activeHero.name : 'Adventurer',
                race: heroRace || 'Human',
                class: heroClass || 'Warrior',
                depth: (activeHero && typeof activeHero.depth === 'number') ? activeHero.depth : 0
            }
        };
    }

    /**
     * Executes "The Torch Passes" bridge chapter into the chronicle
     */
    static passTorch(chronicle, newHero, bridgeProse) {
        const prev = chronicle.protagonists[chronicle.current_protagonist_idx];
        if (prev) {
            prev.status = 'Fallen in the Deeps';
            prev.end_time = Date.now();
        }

        chronicle.protagonists.push({
            name: newHero.name,
            race: newHero.race,
            class: newHero.class,
            status: 'Active',
            started_depth: newHero.depth || 0,
            start_time: Date.now()
        });
        chronicle.current_protagonist_idx = chronicle.protagonists.length - 1;

        // Record the Hand-off Chapter
        const bridgeChapter = {
            chapter_num: chronicle.chapters.length + 1,
            title: `Interlude: The Fallen Hero's Tome`,
            depth: newHero.depth || 0,
            timestamp: Date.now(),
            prose: bridgeProse,
            is_bridge: true
        };
        chronicle.chapters.push(bridgeChapter);
        chronicle.rolling_summary = `${newHero.name} the ${newHero.race} ${newHero.class} discovered the waterlogged journal of ${prev ? prev.name : 'the fallen'} in the dark, claiming the quest as their own.`;
        this.saveActive(chronicle);
        return bridgeChapter;
    }

    // --- Export Generators ---

    static exportAsJson(chronicle) {
        return JSON.stringify(chronicle, null, 2);
    }

    static exportAsMarkdown(chronicle) {
        if (!chronicle) return '';
        const currentHero = chronicle.protagonists[chronicle.current_protagonist_idx] || {};
        let md = `# ${chronicle.title || 'The Chronicles of Angband'}\n\n`;
        md += `* **Protagonist**: ${currentHero.name || 'Wanderer'} (${currentHero.race || 'Unknown'} ${currentHero.class || 'Hero'})\n`;
        md += `* **Recorded**: ${new Date(chronicle.created_at).toLocaleDateString()}\n`;
        md += `* **Total Chapters**: ${chronicle.chapters.length}\n\n---\n\n`;

        if (chronicle.epochs && chronicle.epochs.length > 0) {
            md += `## 📜 Ancient Annals\n\n`;
            for (const ep of chronicle.epochs) {
                md += `### ${ep.chapters_range}\n${ep.summary}\n\n`;
            }
            md += `---\n\n`;
        }

        for (const entry of chronicle.chapters) {
            const depthText = (entry.depth !== undefined && entry.depth !== null)
                ? (entry.depth === 0 ? 'Town' : `${entry.depth * 50}ft`)
                : null;
            if (depthText) {
                md += `*${depthText}*\n\n`;
            }
            md += `${entry.prose}\n\n`;
            if (entry.dialogue) {
                md += `> **${entry.dialogue.speaker}**: *"${entry.dialogue.text}"*\n\n`;
            }
            if (entry.insight) {
                md += `💡 *Lorekeeper's Insight*: ${entry.insight}\n\n`;
            }
            md += `---\n\n`;
        }

        return md;
    }

    static exportAsStandaloneHtml(chronicle) {
        const mdBody = this.exportAsMarkdown(chronicle)
            .replace(/\n\n/g, '</p><p>')
            .replace(/## (.*?)\n/g, '<h2>$1</h2>')
            .replace(/### (.*?)\n/g, '<h3>$1</h3>')
            .replace(/# (.*?)\n/g, '<h1>$1</h1>');

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${chronicle.title || 'Chronicles of Angband'}</title>
<style>
body { background: #0c0f17; color: #e2e8f0; font-family: "IM Fell English", Georgia, serif; line-height: 1.6; max-width: 800px; margin: 40px auto; padding: 20px; }
h1, h2, h3 { color: #ffd700; border-bottom: 1px solid rgba(212, 175, 55, 0.3); padding-bottom: 6px; }
blockquote { border-left: 3px solid #ffd700; padding: 6px 12px; margin: 10px 0; background: rgba(212, 175, 55, 0.08); font-style: italic; color: #fef08a; }
img { max-width: 100%; border-radius: 6px; border: 1px solid rgba(212, 175, 55, 0.4); margin: 10px 0; }
hr { border: 0; border-top: 1px solid rgba(212, 175, 55, 0.2); margin: 30px 0; }
</style>
</head>
<body>
<p>${mdBody}</p>
</body>
</html>`;
    }
}

if (typeof window !== 'undefined') {
    window.ChronicleStore = ChronicleStore;
}
