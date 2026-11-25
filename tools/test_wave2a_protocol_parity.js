'use strict';

/**
 * tools/test_wave2a_protocol_parity.js
 * Wave 2A verification: Protocol v1.3 dirty-row delta reconstruction, server reconnect
 * keyframe guard & --seed forwarding, input stride/walkability parity, and 4 C/C++ bridge parity.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let passed = 0;
function check(cond, msg) {
    assert(cond, `Wave 2A assertion failed: ${msg}`);
    passed++;
}

function testBridgeSources() {
    const engines = [
        { name: 'angband', rel: 'engine-patch/0001-bridge-frontend.patch' },
        { name: 'silq', rel: 'variants/silq-src/src/main-bridge.c' },
        { name: 'frogcomposband', rel: 'variants/frogcomposband-src/src/main-bridge.c' },
        { name: 'hengband', rel: 'variants/hengband-src/src/main-bridge.cpp' }
    ];
    for (const eng of engines) {
        const src = read(eng.rel);
        check(src.includes('BRIDGE_PROTOCOL_MINOR 3'), `${eng.name}: bumps BRIDGE_PROTOCOL_MINOR to 3`);
        check(src.includes('setvbuf(stdout, bridge_stdout_buf, _IOFBF, sizeof(bridge_stdout_buf))'), `${eng.name}: 128 KB setvbuf stdout buffer`);
        check(src.includes('--seed=') || src.includes('YASD_SEED'), `${eng.name}: deterministic seed parsing`);
        check(src.includes('"delta"') && src.includes('force_full_frame'), `${eng.name}: Protocol v1.3 dirty-row delta + keyframe guard`);
        check(src.includes('"door_states"'), `${eng.name}: emits locked/jammed door_states`);
        check(src.includes('"artifact"') && src.includes('"ego"') && src.includes('"cursed"'), `${eng.name}: emits artifact/ego/cursed floor metadata`);
        check(src.includes('"attr_multi"'), `${eng.name}: emits attr_multi`);
        if (eng.name !== 'silq') {
            check(src.includes('"fast"') && src.includes('"slow"'), `${eng.name}: emits fast/slow`);
        }
        if (eng.name === 'angband' || eng.name === 'frogcomposband') {
            check(src.includes('"paralyzed"'), `${eng.name}: emits paralyzed`);
        }
    }

    const angPatch = read('engine-patch/0001-bridge-frontend.patch');
    check(angPatch.includes('hallucination') && angPatch.includes('Strange Apparition') && angPatch.includes('Strange Object'), 'angband: hallucination phantom guard');
    check(angPatch.includes('square_islockeddoor') && angPatch.includes('ODESC_PREFIX | ODESC_FULL'), 'angband: locked doors & full object names');

    const silqSrc = read('variants/silq-src/src/main-bridge.c');
    check(silqSrc.includes('STANCE_FLEEING') && silqSrc.includes('image_r_idx') && silqSrc.includes('Entranced'), 'silq: fleeing/hallucination/entranced parity');

    const fcbSrc = read('variants/frogcomposband-src/src/main-bridge.c');
    check(fcbSrc.includes('strstr(name, "broken") != NULL') && fcbSrc.includes('MST_BREATH') && fcbSrc.includes('MST_SUMMON'), 'frogcomposband: broken doors & breather/summoner parity');

    const hengSrc = read('variants/hengband-src/src/main-bridge.cpp');
    check(hengSrc.includes('TerrainTag::BROKEN_DOOR') && hengSrc.includes('TerrainTag::MAGMA_VEIN') && hengSrc.includes('DARK_PIT'), 'hengband: broken doors, JP veins & chasm 41 parity');
}

function testServerWiring() {
    const serverSrc = read('server/src/server.js');
    check(serverSrc.includes("'delta'") && serverSrc.includes("cmd !== 'delta on' && cmd !== 'delta off'"), 'server.js allowlists delta on/off');
    check(serverSrc.includes('session.deltaEnabled = true'), 'server.js tracks deltaEnabled on session');
    check(serverSrc.includes("!line.includes('\"delta\":true')"), 'server.js never caches delta frames in lastFrame');
    check(serverSrc.includes("existingSession.deltaEnabled"), 'server.js forces fresh full frame on delta reconnect');
    check(serverSrc.includes('args.push(`--seed=${h}`)') || serverSrc.includes('`--seed=${seedParam}`'), 'server.js forwards --seed across native & cartridge realms');
}

function testNetworkDeltaClient() {
    const networkSrc = read('server/public/js/network.js');
    const sentCmds = [];
    const framesDelivered = [];
    const locObj = { protocol: 'https:', host: 'yasd3d.com', hostname: 'yasd3d.com', href: 'https://yasd3d.com/' };
    const ctx = {
        location: locObj,
        window: { PROTOCOL_DELTA: true, location: locObj, localStorage: { getItem: () => null, setItem: () => {} } },
        localStorage: { getItem: () => null, setItem: () => {} },
        performance: { now: () => 1000 },
        console: { log: () => {}, warn: () => {}, error: () => {} },
        WebSocket: { OPEN: 1, CONNECTING: 0 },
        setTimeout: () => 1,
        clearTimeout: () => {},
        URLSearchParams
    };
    vm.createContext(ctx);
    vm.runInContext(networkSrc + '\nthis.__GameNetwork = GameNetwork;', ctx);
    const nc = new ctx.__GameNetwork();
    nc.requestedRealm = 'angband';
    nc.sendCommand = (c) => sentCmds.push(c);
    nc.flushOfflineSync = () => {};
    nc.startPingHeartbeat = () => {};
    nc.onFrame = (f) => framesDelivered.push(f);
    nc.ws = { readyState: 1, close: () => {}, send: () => {} };

    // Re-bind handlers cleanly by testing connect()-style handler behavior directly via simulated connect
    const fakeSockets = [];
    ctx.WebSocket = class FakeWS {
        constructor(url) {
            this.url = url;
            this.readyState = 1;
            fakeSockets.push(this);
        }
        send() {}
        close() {}
    };
    ctx.WebSocket.OPEN = 1;
    ctx.WebSocket.CONNECTING = 0;

    nc.connect('SeedHero', true, null, 'angband');
    const ws = fakeSockets[0];
    check(Boolean(ws), 'NetworkClient constructed WebSocket');

    ws.onmessage({ data: JSON.stringify({ t: 'hello', protocol: 1, protocol_minor: 3, realm: 'angband' }) });
    check(sentCmds.includes('delta on'), 'network.js requests delta on when protocol_minor >= 3');

    ws.onmessage({
        data: JSON.stringify({
            t: 'frame',
            realm: 'angband',
            seq: 1,
            map: { w: 4, h: 2, rows: [{ g: '....', a: '0101', f: '0101', l: '1111' }, { g: '####', a: '0101', f: '1515', l: '1111' }] },
            term: { w: 4, h: 2, rows: [{ g: 'row0', a: '0101' }, { g: 'row1', a: '0101' }] }
        })
    });
    check(framesDelivered.length === 1 && framesDelivered[0].map.rows.length === 2, 'network.js stores full keyframe');

    ws.onmessage({
        data: JSON.stringify({
            t: 'frame',
            realm: 'angband',
            seq: 2,
            map: { w: 4, h: 2, delta: true, rows: [{ y: 0, g: '.@..', a: '010f', f: '0101', l: '3333' }] },
            term: { w: 4, h: 2, delta: true, rows: [{ y: 1, g: 'HP99', a: '0202' }] }
        })
    });
    check(framesDelivered.length === 2, 'network.js delivers reconstructed delta frame');
    check(framesDelivered[1].map.rows[0].g === '.@..' && framesDelivered[1].map.rows[1].g === '####', 'network.js merges dirty map row while keeping clean row');
    check(framesDelivered[1].term.rows[0].g === 'row0' && framesDelivered[1].term.rows[1].g === 'HP99', 'network.js merges dirty term row while keeping clean row');
    check(!framesDelivered[1].map.delta && !framesDelivered[1].term.delta, 'network.js clears delta flags after reconstruction');

    // Cache-miss / dimension mismatch requests fresh keyframe
    sentCmds.length = 0;
    ws.onmessage({
        data: JSON.stringify({
            t: 'frame',
            realm: 'angband',
            seq: 3,
            map: { w: 8, h: 2, delta: true, rows: [] }
        })
    });
    check(sentCmds.includes('frame') && framesDelivered.length === 2, 'network.js requests full frame on delta cache/dim mismatch');
}

function testInputWalkabilityAndPipeline() {
    const inputSrc = read('server/public/js/input.js');
    check(inputSrc.includes('fDef.passable !== false') && inputSrc.includes('_inFlightMoves'), 'input.js uses featureDefs walkability & stride pipelining');
    check(inputSrc.includes('rttWindowMs'), 'input.js uses adaptive RTT stride window');
}

testBridgeSources();
testServerWiring();
testNetworkDeltaClient();
testInputWalkabilityAndPipeline();
console.log(`[PASS] Wave 2A protocol v1.3 & parity suite: ${passed} assertions passed.`);
