/**
 * grimoire-renderers.js — Rich Spellbook Cards & Desktop/Mobile Merchant Store Cards
 * Companion module to grimoire-deck.js (kept separate to stay under WS42 LOC budget).
 * Contract: Pure UMD module, 100% IP-clean (IP-CLEAN-01).
 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.GrimoireRenderers = factory();
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const SCHOOL_SVGS = Object.freeze({
        fire: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#f97316" stroke-width="1.9"><path d="M12 2c2.5 4 5.5 6.4 5.5 11a5.5 5.5 0 1 1-11 0c0-2.5 1.3-4.9 3-6.7.2 1.7 1.2 2.9 2.5 3.3-.6-2.4-.5-5 0-7.6z"/></svg>',
        frost: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#38bdf8" stroke-width="1.9"><path d="M12 2v20M4.2 6.5l15.6 11M19.8 6.5L4.2 17.5M9 4l3 2 3-2M9 20l3-2 3 2"/></svg>',
        divine: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#facc15" stroke-width="1.9"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/></svg>',
        shadow: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#a855f7" stroke-width="1.9"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/><circle cx="12" cy="12" r="2.2" fill="#a855f7"/></svg>',
        nature: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#22c55e" stroke-width="1.9"><path d="M11 20A7 7 0 0 1 4 13C4 6 12 3 20 3c0 8-3 17-9 17z"/><path d="M11 20L20 3"/></svg>',
        arcane: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#60a5fa" stroke-width="1.9"><polygon points="12 2 20 8 17 20 7 20 4 8 12 2"/><circle cx="12" cy="12" r="2.6"/></svg>',
        utility: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#cbd5e1" stroke-width="1.9"><circle cx="11" cy="11" r="6"/><path d="M20 20l-4.2-4.2"/></svg>'
    });

    function escapeHtml(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function detectSpellSchool(name) {
        const s = String(name || '').toLowerCase();
        if (/(fire|flame|hellfire|meteor|plasma|burn|brimstone|blaze|firebolt|fireball|火|炎|爆)/i.test(s)) return 'fire';
        if (/(frost|ice|cold|blizzard|freeze|glacial|氷|冷)/i.test(s)) return 'frost';
        if (/(heal|cure|bless|holy|sanct|prayer|orb of draining|restor|prot|purify|turn undead|癒|祝福|聖)/i.test(s)) return 'divine';
        if (/(dark|shadow|nether|drain|vampir|death|chaos|doom|curse|fear|wraith|confus|sleep|闇|呪|死|混沌)/i.test(s)) return 'shadow';
        if (/(poison|acid|venom|stone|earth|quake|thorn|entangle|spear of light|toxic|毒|酸|石|地)/i.test(s)) return 'nature';
        if (/(detect|identify|sense|teleport|phase|light|mapping|probe|magic mapping|haste|speed|wizard lock|感知|鑑定|テレポート|加速)/i.test(s)) return 'utility';
        return 'arcane';
    }

    function parseSpellEntry(rawDesc, curSp) {
        const clean = String(rawDesc || '').trim();
        let name = clean.replace(/^[a-zA-Z][)\]-]\s+/, '').trim();
        let level = null, mana = null, failPct = null, status = 'Castable';

        const illegible = /\b(illegible|unknown|forgotten|unreadable|未修得|解読不能)\b/i.test(clean);
        const untried = /\b(untried|未体験|未使用)\b/i.test(clean);

        // Typical Angband/FCB/Hengband columns: "Magic Missile       1    1   5% safe"
        const colMatch = name.match(/^(.+?)\s{2,}(\d{1,2})\s+(\d{1,3})\s+(\d{1,3})%(.*)$/);
        if (colMatch) {
            name = colMatch[1].trim();
            level = Number(colMatch[2]);
            mana = Number(colMatch[3]);
            failPct = Number(colMatch[4]);
            const tail = (colMatch[5] || '').trim();
            if (untried || /untried/i.test(tail)) status = 'Untried';
            else if (/exhaust|low|dam/i.test(tail)) status = tail;
        } else {
            const fm = name.match(/\b(\d{1,3})%/);
            if (fm) failPct = Number(fm[1]);
            const mpMatch = name.match(/\b(\d{1,3})\s*(?:mp|sp|mana)\b/i);
            if (mpMatch) mana = Number(mpMatch[1]);
            const lvMatch = name.match(/\b(?:lv|lvl|level)\s*[:.]?\s*(\d{1,2})\b/i);
            if (lvMatch) level = Number(lvMatch[1]);
            name = name
                .replace(/\s+\d{1,3}%\s*(?:fail|失敗|safe|untried)?.*$/i, '')
                .replace(/\s+\d{1,3}\s*(?:mp|sp|mana)\b/i, '')
                .replace(/\[[^\]]*\]/g, '')
                .trim();
        }

        if (illegible) status = 'Illegible';
        else if (untried && status === 'Castable') status = 'Untried';
        if (typeof curSp === 'number' && mana !== null && curSp < mana && status === 'Castable') {
            status = 'Low MP';
        }

        const failTier = failPct === null ? 'unknown' : (failPct <= 10 ? 'low' : (failPct <= 35 ? 'med' : 'high'));
        const school = detectSpellSchool(name);
        return {
            name: name || clean,
            school,
            schoolIconSvg: SCHOOL_SVGS[school] || SCHOOL_SVGS.arcane,
            level,
            mana,
            failPct,
            failTier,
            status
        };
    }

    function renderSpellCard(opts) {
        const o = opts || {};
        const key = String(o.key || 'a');
        const row = Number(o.row || 0);
        const col = Number(o.col || 0);
        const isJp = Boolean(o.isJp);
        const curSp = (o.vitals && typeof o.vitals.sp === 'number') ? o.vitals.sp : null;
        const sp = parseSpellEntry(o.desc, curSp);

        const lvHtml = sp.level !== null ? `<span class="grimoire-meta-stat">Lv ${sp.level}</span>` : '';
        const mpHtml = sp.mana !== null ? `<span class="grimoire-spell-mp ${sp.status === 'Low MP' ? 'is-low' : ''}">${sp.mana} MP</span>` : '';
        const failHtml = sp.failPct !== null ? `<span class="grimoire-spell-fail fail-${sp.failTier}">${sp.failPct}% Fail</span>` : '';
        const statusCls = sp.status === 'Castable' ? 'status-ready' : (sp.status === 'Untried' ? 'status-untried' : 'status-warn');
        const statusHtml = `<span class="grimoire-spell-status ${statusCls}">${escapeHtml(sp.status)}</span>`;

        return `<div class="grimoire-item-card grimoire-spell-card rarity-${sp.status === 'Low MP' || sp.status === 'Illegible' ? 'common' : 'enchanted'}" data-slot-key="${escapeHtml(key)}" data-item-cat="spell"><div class="grimoire-card-main" role="button" tabindex="0" data-grimoire-cmd="item-primary" data-grimoire-key="${escapeHtml(key)}" data-grimoire-verb="" data-grimoire-row="${row}" data-grimoire-col="${col}"><span class="grimoire-slot-medallion">${escapeHtml(key)})</span><span class="grimoire-spell-school-icon" title="${escapeHtml(sp.school)}" aria-hidden="true">${sp.schoolIconSvg}</span><div class="grimoire-item-copy"><div class="grimoire-item-title">${escapeHtml(sp.name)} ${statusHtml}</div><div class="grimoire-item-meta">${lvHtml}${mpHtml}${failHtml}</div></div></div><div class="grimoire-card-actions"><button type="button" class="grimoire-card-verb-btn grimoire-act-btn is-primary-verb" data-grimoire-cmd="item-primary" data-grimoire-key="${escapeHtml(key)}" data-grimoire-verb="" data-grimoire-name="${escapeHtml(sp.name)}" data-grimoire-category="spell" data-grimoire-row="${row}" data-grimoire-col="${col}">${isJp ? '✨ 詠唱' : '✨ Cast'}</button><button type="button" class="grimoire-card-verb-btn grimoire-act-btn is-secondary-verb grimoire-bind-btn" data-grimoire-cmd="bind-quick-slot" data-grimoire-key="${escapeHtml(key)}" data-grimoire-verb="__bind_spell__" data-grimoire-name="${escapeHtml(sp.name)}" data-grimoire-category="spell" data-grimoire-row="${row}" data-grimoire-col="${col}">⚡ Bind</button></div></div>`;
    }

    function parsePriceNum(priceStr) {
        if (!priceStr) return null;
        const m = String(priceStr).match(/(\d+)/);
        return m ? parseInt(m[1], 10) : null;
    }

    function parsePlayerGold(vitals, promptText) {
        if (vitals && typeof vitals.au === 'number') return vitals.au;
        if (vitals && typeof vitals.gold === 'number') return vitals.gold;
        const m = String(promptText || '').match(/\bGold\s*:\s*(\d+)/i);
        return m ? parseInt(m[1], 10) : null;
    }

    function renderStoreCardMeta(metrics, vitals, promptText) {
        const priceNum = parsePriceNum(metrics && metrics.price);
        if (priceNum === null) return '';
        const gold = parsePlayerGold(vitals, promptText);
        if (gold === null) {
            return `<span class="grimoire-meta-price">🪙 ${priceNum} au</span>`;
        }
        const remain = gold - priceNum;
        if (remain >= 0) {
            return `<span class="grimoire-meta-price">🪙 ${priceNum} au</span><span class="grimoire-store-after is-affordable">After: ${remain} au</span>`;
        }
        return `<span class="grimoire-meta-price">🪙 ${priceNum} au</span><span class="grimoire-store-after is-unaffordable">Need +${Math.abs(remain)} au</span>`;
    }

    return {
        SCHOOL_SVGS,
        detectSpellSchool,
        parseSpellEntry,
        renderSpellCard,
        renderStoreCardMeta
    };
});
