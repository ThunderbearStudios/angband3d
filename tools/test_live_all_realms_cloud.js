
const WebSocket = require('../server/node_modules/ws');

async function testRealm(realm) {
    return new Promise((resolve, reject) => {
        const shortUser = ('Hero_' + realm.slice(0, 4) + '_' + Date.now().toString().slice(-6)).slice(0, 28);
        const url = 'wss://angband3d.com/ws?realm=' + realm + '&new=1&user=' + shortUser;
        console.log('Testing realm:', realm, 'at', url);
        const ws = new WebSocket(url);
        const timer = setTimeout(() => { ws.terminate(); reject(new Error('Timeout on ' + realm)); }, 20000);
        ws.on('message', data => {
            const msg = JSON.parse(data.toString());
            if (msg.t === 'hello') {
                console.log('  -> ' + realm + ' HELLO: realm=' + msg.realm + ', engine=' + msg.engineName + ', isFallback=' + msg.isFallback);
                if (msg.isFallback) reject(new Error('Unexpected fallback for ' + realm));
            } else if (msg.t === 'frame') {
                console.log('  -> ' + realm + ' FRAME received! phase=' + msg.phase);
                clearTimeout(timer);
                ws.terminate();
                resolve(true);
            }
        });
        ws.on('error', err => { clearTimeout(timer); reject(err); });
    });
}

async function main() {
    for (const r of ['angband', 'silq', 'frogcomposband', 'hengband']) {
        await testRealm(r);
    }
    console.log('ALL 4 REALMS VERIFIED LIVE ON ANGBAND3D.COM!');
}

main().catch(err => { console.error('FAILED:', err); process.exit(1); });
