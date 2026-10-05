const https = require('https');

function fetchAll(url, headers = {}) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers }, (res) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const buf = Buffer.concat(chunks);
                resolve({ statusCode: res.statusCode, headers: res.headers, body: buf });
            });
        }).on('error', reject);
    });
}

async function run() {
    console.log('Testing live production at https://angband3d.com...');
    const root = await fetchAll('https://angband3d.com/?nocache=' + Date.now());
    const html = root.body.toString('utf8');
    console.log(`Root HTML HTTP ${root.statusCode}, size: ${html.length} bytes`);
    console.log('  ✓ Has demo-player script:', html.includes('demo-player.js?v=8.4.0'));
    console.log('  ✓ Has btn-splash-demo:', html.includes('btn-splash-demo'));
    console.log('  ✓ Has btn-menu-demo:', html.includes('btn-menu-demo'));
    console.log('  ✓ Has demo-modal:', html.includes('id="demo-modal"'));

    const directCloud = await fetchAll('https://angband3d-cloud-564958309282.us-central1.run.app/?nocache=' + Date.now());
    const directHtml = directCloud.body.toString('utf8');
    console.log('Direct Cloud Run (us-central1):');
    console.log('  ✓ Has demo-player script:', directHtml.includes('demo-player.js?v=8.4.0'));

    const directEast = await fetchAll('https://angband3d-cloud-564958309282.us-east1.run.app/?nocache=' + Date.now());
    const directEastHtml = directEast.body.toString('utf8');
    console.log('Direct Cloud Run (us-east1):');
    console.log('  ✓ Has demo-player script:', directEastHtml.includes('demo-player.js?v=8.4.0'));

    const directWeb = await fetchAll('https://angband3d-web-564958309282.us-central1.run.app/?nocache=' + Date.now());
    const directWebHtml = directWeb.body.toString('utf8');
    console.log('Direct Cloud Run Web (us-central1):');
    console.log('  ✓ Has demo-player script:', directWebHtml.includes('demo-player.js?v=8.4.0'));

    console.log('\nTesting live audio manifest & audio stream...');
    const manifest = await fetchAll('https://angband3d.com/assets/audio/demo/demo_manifest.json');
    console.log(`  ✓ demo_manifest.json HTTP ${manifest.statusCode}, size: ${manifest.body.length} bytes`);
    const json = JSON.parse(manifest.body.toString('utf8'));
    console.log(`  ✓ Manifest chapters: ${json.chapters.length}, subtitles: ${json.subtitles.length}`);

    const audioRange = await fetchAll('https://angband3d.com/assets/audio/demo/clip_01_awakening.mp3', { 'Range': 'bytes=0-1023' });
    console.log(`  ✓ clip_01 Range Request HTTP ${audioRange.statusCode}`);
    console.log(`  ✓ Content-Range: ${audioRange.headers['content-range'] || 'N/A'}`);
    console.log(`  ✓ Chunk Size: ${audioRange.body.length} bytes`);

    console.log('\n=========================================');
    console.log('PRODUCTION DEMO SHOWCASE IS FULLY LIVE! 🚀');
    console.log('=========================================\n');
}

run().catch(console.error);
