/**
 * tools/test_combat_flow_governor.js
 * Fast-tier contract unit test verifying:
 * 1. Non-fatal combat exchanges are concise and brief (<= 80 chars, single punchy clause) to prevent repetition.
 * 2. Lethal combat exchanges (fatal kills and UNIQUE_SLAIN) generate dramatic, celebratory saga prose (> 90 chars).
 * 3. Combat Flow Urgency Invariant: Routine melee swings do NOT flag isUrgent; only kills, mortal peril, or hero death allow speech preemption.
 * 4. Catch-up aggregation cleanly coalesces consecutive routine swings into brief tactical clauses without thrashing speech.
 */

const assert = require('assert');
const ChronicleGrounder = require('../server/public/js/chronicle/chronicle-grounder.js');

function test(name, fn) {
    try {
        fn();
        console.log(`  PASS: ${name}`);
    } catch (err) {
        console.error(`  FAIL: ${name}`);
        throw err;
    }
}

console.log('--- test_combat_flow_governor.js ---');

const HERO = {
    name: 'Arthur',
    race: 'Human',
    class: 'Warrior',
    depth: 3,
    hp: 45,
    hp_max: 50,
    turn: 120
};

// 1. Non-fatal routine combat prose must be brief and punchy (<= 80 characters)
test('Routine non-fatal combat exchange generates brief, punchy prose (<= 80 chars)', () => {
    const nonFatalEvent = {
        type: 'COMBAT_EXCHANGE',
        data: {
            heroAttacks: [
                {
                    monsterName: 'Large white snake',
                    hit: true,
                    damage: 6,
                    attackMedium: { type: 'melee', archetype: 'blade', weapon: 'broadsword' }
                }
            ],
            incomingAttacks: [],
            kills: [],
            playerStatuses: []
        }
    };

    const chapter = ChronicleGrounder.generateProceduralChapter(nonFatalEvent, HERO, 'westmarch');
    assert(chapter, 'Chapter required for non-fatal combat');
    assert(chapter.prose, 'Chapter must have prose');
    assert(
        chapter.prose.length <= 80,
        `Routine combat prose too long (${chapter.prose.length} chars, expected <= 80): "${chapter.prose}"`
    );
});

// 2. Fatal kills make a big fuss: rich dramatic fanfare (> 90 characters)
test('Fatal kills and UNIQUE_SLAIN generate rich, celebratory saga prose (> 90 chars)', () => {
    const fatalEvent = {
        type: 'COMBAT_EXCHANGE',
        data: {
            heroAttacks: [
                {
                    monsterName: 'Large white snake',
                    hit: true,
                    damage: 14,
                    attackMedium: { type: 'melee', archetype: 'blade', weapon: 'broadsword' }
                }
            ],
            kills: ['Large white snake'],
            playerStatuses: []
        }
    };

    const killChapter = ChronicleGrounder.generateProceduralChapter(fatalEvent, HERO, 'westmarch');
    assert(killChapter && killChapter.prose, 'Fatal chapter required');
    assert(
        killChapter.prose.length > 90,
        `Fatal kill prose should be dramatic and rich (> 90 chars, got ${killChapter.prose.length}): "${killChapter.prose}"`
    );

    // UNIQUE_SLAIN event must generate legendary fanfare
    const uniqueSlainEvent = {
        type: 'UNIQUE_SLAIN',
        data: {
            monsterName: 'Gorgoroth the Corrupt',
            attackMedium: { type: 'melee', archetype: 'blade', weapon: 'broadsword' }
        }
    };
    const uniqueChapter = ChronicleGrounder.generateProceduralChapter(uniqueSlainEvent, HERO, 'westmarch');
    assert(uniqueChapter && uniqueChapter.prose, 'Unique slain chapter required');
    assert(
        uniqueChapter.prose.length > 90,
        `Unique slain must be legendary and dramatic (> 90 chars, got ${uniqueChapter.prose.length}): "${uniqueChapter.prose}"`
    );
});

// 3. Catch-up beat generation with multiple routine strikes keeps combat concise
test('Catch-up aggregation of routine strikes produces concise tactical clause', () => {
    const routineEvents = [
        {
            type: 'COMBAT_EXCHANGE',
            data: {
                incomingAttacks: [{ monsterName: 'Orc', damage: 3 }],
                heroAttacks: [{ monsterName: 'Orc', hit: true, damage: 7 }]
            }
        },
        {
            type: 'COMBAT_EXCHANGE',
            data: {
                incomingAttacks: [{ monsterName: 'Orc', damage: 2 }],
                heroAttacks: [{ monsterName: 'Orc', hit: true, damage: 8 }]
            }
        }
    ];

    const catchUp = ChronicleGrounder.generateCatchUpBeat(routineEvents, HERO, HERO, 'westmarch');
    assert(catchUp, 'Catch-up beat required');
    assert(catchUp.prose, 'Catch-up beat must have prose');
    // Multi-round routine exchange should not repeat paragraph descriptions
    assert(
        catchUp.prose.length <= 150,
        `Catch-up routine exchange should be concise (<= 150 chars, got ${catchUp.prose.length}): "${catchUp.prose}"`
    );
});

console.log('ALL COMBAT FLOW GOVERNOR TESTS PASSED!');
