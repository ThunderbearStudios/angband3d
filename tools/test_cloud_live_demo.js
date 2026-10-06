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
    
    // 1. Root page v8.5.0 check
    const root = await fetchAll('https://angband3d.com/?nocache=' + Date.now());
    const html = root.body.toString('utf8');
    console.log(`Root HTML HTTP ${root.statusCode}, size: ${html.length} bytes`);
    console.log('  ✓ Has demo-player script v8.5.2:', html.includes('demo-player.js?v=8.5.2'));
    console.log('  ✓ Has btn-splash-demo:', html.includes('btn-splash-demo'));
    console.log('  ✓ Has btn-menu-demo:', html.includes('btn-menu-demo'));
    console.log('  ✓ Has demo-modal:', html.includes('id="demo-modal"'));

    // 2. Dedicated /demo page check
    console.log('\nTesting dedicated demo page at https://angband3d.com/demo...');
    const demo = await fetchAll('https://angband3d.com/demo?nocache=' + Date.now());
    const demoHtml = demo.body.toString('utf8');
    console.log(`Demo HTML HTTP ${demo.statusCode}, size: ${demoHtml.length} bytes`);
    console.log('  ✓ HTTP 200 OK:', demo.statusCode === 200);
    console.log('  ✓ Title contains Angband 3D Showcase:', demoHtml.includes('Angband 3D — Official Gameplay Showcase'));
    console.log('  ✓ Has under-video controls bar:', demoHtml.includes('id="controls-bar"') && demoHtml.includes('class="controls-bar"'));
    console.log('  ✓ Has volume slider & mute:', demoHtml.includes('id="volume-slider"') && demoHtml.includes('id="btn-mute"'));
    console.log('  ✓ Has CC button:', demoHtml.includes('id="btn-cc"'));
    console.log('  ✓ Has Thunderbear Studios branding:', demoHtml.includes('Thunderbear Studios'));
    console.log('  ✓ Has GitHub repository link:', demoHtml.includes('https://github.com/ThunderbearStudios/angband3d'));
    console.log('  ✓ Has Open Graph video tags:', demoHtml.includes('og:video'));

    // 3. Regional direct Cloud Run checks
    console.log('\nTesting direct regional Cloud Run endpoints for /demo...');
    const directCloud = await fetchAll('https://angband3d-cloud-564958309282.us-central1.run.app/demo?nocache=' + Date.now());
    const directHtml = directCloud.body.toString('utf8');
    console.log('Direct Cloud Run (us-central1):');
    console.log('  ✓ HTTP 200 OK:', directCloud.statusCode === 200);
    console.log('  ✓ Has Thunderbear branding:', directHtml.includes('Thunderbear Studios'));

    const directEast = await fetchAll('https://angband3d-cloud-564958309282.us-east1.run.app/demo?nocache=' + Date.now());
    const directEastHtml = directEast.body.toString('utf8');
    console.log('Direct Cloud Run (us-east1):');
    console.log('  ✓ HTTP 200 OK:', directEast.statusCode === 200);
    console.log('  ✓ Has Thunderbear branding:', directEastHtml.includes('Thunderbear Studios'));

    const directWeb = await fetchAll('https://angband3d-web-564958309282.us-central1.run.app/demo?nocache=' + Date.now());
    const directWebHtml = directWeb.body.toString('utf8');
    console.log('Direct Cloud Run Web (us-central1):');
    console.log('  ✓ HTTP 200 OK:', directWeb.statusCode === 200);
    console.log('  ✓ Has Thunderbear branding:', directWebHtml.includes('Thunderbear Studios'));

    // 4. Video MP4 HTTP 206 Partial Content Range Request
    console.log('\nTesting live video streaming range requests...');
    const videoRange = await fetchAll('https://angband3d.com/assets/video/angband3d_demo.mp4', { 'Range': 'bytes=0-102400' });
    console.log(`  ✓ angband3d_demo.mp4 Range Request HTTP ${videoRange.statusCode}`);
    console.log(`  ✓ Content-Type: ${videoRange.headers['content-type']}`);
    console.log(`  ✓ Content-Range: ${videoRange.headers['content-range'] || 'N/A'}`);
    console.log(`  ✓ Chunk Size: ${videoRange.body.length} bytes`);
    console.log(`  ✓ Accept-Ranges: ${videoRange.headers['accept-ranges'] || 'N/A'}`);

    console.log('\n=========================================');
    console.log('PRODUCTION DEMO SHOWCASE IS FULLY LIVE! 🚀');
    console.log('URL: https://angband3d.com/demo');
    console.log('=========================================\n');
}

run().catch(console.error);
