const http = require('http');
const fs = require('fs');
const cp = require('child_process');
const crypto = require('crypto');
const path = require('path');

async function run() {
    // use native fetch

    // Test 1: Upload a save, should get no error if file doesn't exist
    let buf = Buffer.from("SaveVNLA" + "0".repeat(100));
    let res = await fetch('http://127.0.0.1:8080/api/saves/upload', {
        method: 'POST',
        headers: { 'X-Character-Name': 'TestOwned', 'X-Owner-Token': 't1' },
        body: buf
    });
    console.log("Upload new:", res.status);
    
    // Simulate Spawning to claim the save
    const sha = t => crypto.createHash('sha256').update(String(t)).digest('hex');
    const ownerPath = path.join('engine', 'build', 'game', 'lib', 'save', 'TestOwned.owner.json');
    fs.writeFileSync(ownerPath, JSON.stringify({
        hash: sha('t1'),
        createdAt: Date.now()
    }), 'utf8');
    console.log("Claimed save by writing", ownerPath);
    
    // Test 2: Upload again with wrong token, should 403
    let res2 = await fetch('http://127.0.0.1:8080/api/saves/upload', {
        method: 'POST',
        headers: { 'X-Character-Name': 'TestOwned', 'X-Owner-Token': 'wrong' },
        body: buf
    });
    console.log("Upload overwrite wrong token:", res2.status);
    
    // Test 3: Delete with wrong token, should 403
    let res3 = await fetch('http://127.0.0.1:8080/api/saves/TestOwned', {
        method: 'DELETE',
        headers: { 'X-Owner-Token': 'wrong' }
    });
    console.log("Delete wrong token:", res3.status);
    
    // Test 4: Delete with right token, should 200
    let res4 = await fetch('http://127.0.0.1:8080/api/saves/TestOwned', {
        method: 'DELETE',
        headers: { 'X-Owner-Token': 't1' }
    });
    console.log("Delete right token:", res4.status);
}
run().catch(console.error);
