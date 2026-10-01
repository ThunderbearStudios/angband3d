/**
 * Angband3D Cloud Server Daemon
 *
 * Provides:
 *  1. WebSocket bridge relay (/ws) spawning isolated headless Angband C engine instances
 *  2. REST API for cross-platform save game management (/api/saves)
 *  3. Static file delivery for Godot Web export (/) and standalone zip packages (/download/angband3d-standalone.zip)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { WebSocketServer } = require('ws');
const zlib = require('zlib');

// Active session registry for telemetry, leak prevention, and graceful shutdown
const activeSessions = new Map();

// Configuration
const PORT = parseInt(process.env.PORT || '8080', 10);
const IS_WIN = process.platform === 'win32';
const IDLE_TIMEOUT_MS = parseInt(process.env.IDLE_TIMEOUT_MS || `${20 * 60 * 1000}`, 10); // 20 minutes
const MAX_CONCURRENT_GAMES = parseInt(process.env.MAX_CONCURRENT_GAMES || '50', 10);
const MAX_QUEUE_SIZE = parseInt(process.env.MAX_QUEUE_SIZE || '100', 10);

// Waiting queue for connections when activeSessions.size >= MAX_CONCURRENT_GAMES
// Each item: { id, ws, request, enqueueTime, user, save }
const waitingQueue = [];

function resolveEngineExe() {
    if (process.env.ENGINE_EXE && fs.existsSync(process.env.ENGINE_EXE)) {
        return process.env.ENGINE_EXE;
    }
    const localExe = path.resolve(__dirname, '../../engine/build/game', IS_WIN ? 'angband.exe' : 'angband');
    if (fs.existsSync(localExe)) {
        return localExe;
    }
    const systemExe = IS_WIN ? 'angband.exe' : '/usr/local/bin/angband';
    return systemExe;
}

const ENGINE_EXE = resolveEngineExe();
const SAVE_DIR = process.env.SAVE_DIR || path.resolve(__dirname, '../../engine/build/game/lib/save');
const DIST_DIR = process.env.DIST_DIR || path.resolve(__dirname, '../../dist');
const WEB_DIR = process.env.WEB_DIR || path.resolve(__dirname, '../public');

// Ensure directories exist
if (!fs.existsSync(SAVE_DIR)) {
    try { fs.mkdirSync(SAVE_DIR, { recursive: true }); } catch (_) {}
}
if (!fs.existsSync(DIST_DIR)) {
    try { fs.mkdirSync(DIST_DIR, { recursive: true }); } catch (_) {}
}
if (!fs.existsSync(WEB_DIR)) {
    try { fs.mkdirSync(WEB_DIR, { recursive: true }); } catch (_) {}
}

function getSaveDirs() {
    const dirs = new Set();
    if (SAVE_DIR) dirs.add(path.resolve(SAVE_DIR));
    const engineDir = path.dirname(ENGINE_EXE);
    const homeDir = process.env.HOME || '/app';
    const candidates = [
        SAVE_DIR,
        path.join(engineDir, 'lib/save'),
        path.join(engineDir, 'lib/user/save'),
        path.join(homeDir, '.angband/Angband/save'),
        path.join('/root/.angband/Angband/save'),
        path.join('/app/.angband/Angband/save'),
        path.join('/data/save')
    ];
    for (const c of candidates) {
        if (c && fs.existsSync(c)) dirs.add(path.resolve(c));
    }
    return Array.from(dirs);
}

console.log(`[Angband3D Cloud] Engine executable: ${ENGINE_EXE}`);
console.log(`[Angband3D Cloud] Save directory:    ${SAVE_DIR}`);
console.log(`[Angband3D Cloud] Standalone dist:   ${DIST_DIR}`);
console.log(`[Angband3D Cloud] Web root:          ${WEB_DIR}`);

function isReservedFilename(name) {
    if (!name) return true;
    const base = name.split('.')[0].trim();
    return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(base);
}

function sanitizeFilename(name) {
    if (!name) return '';
    return path.basename(name).replace(/[^a-zA-Z0-9_.-]/g, '_');
}

/**
 * Parses Angband 4.2.6 SaveVNLA header from binary save file.
 * Structure:
 *  0..7:   "SaveVNLA" magic
 *  8..23:  "description\0..."
 *  24..27: block version/type
 *  28..31: size (uint32_le)
 *  32..35: checksum
 *  36..:   description string
 */
function readSaveMetadata(filePath) {
    try {
        const stat = fs.statSync(filePath);
        if (stat.size < 36) return null;

        const fd = fs.openSync(filePath, 'r');
        const header = Buffer.alloc(36);
        fs.readSync(fd, header, 0, 36, 0);

        const magic = header.toString('ascii', 0, 8);
        if (magic !== 'SaveVNLA') {
            fs.closeSync(fd);
            return null;
        }

        const blockName = header.toString('ascii', 8, 24).replace(/\0.*$/, '');
        let description = null;
        let charName = null;

        if (blockName === 'description') {
            const size = header.readUInt32LE(28);
            if (size > 0 && size <= 512 && stat.size >= 36 + size) {
                const descBuf = Buffer.alloc(size);
                fs.readSync(fd, descBuf, 0, size, 36);
                const nullIdx = descBuf.indexOf(0);
                const strLen = nullIdx >= 0 ? nullIdx : size;
                description = descBuf.toString('utf8', 0, strLen);
                const commaIdx = description.indexOf(',');
                if (commaIdx > 0) {
                    charName = description.substring(0, commaIdx).trim();
                }
            }
        }

        fs.closeSync(fd);
        return {
            filename: path.basename(filePath),
            characterName: charName || path.basename(filePath),
            description: description || path.basename(filePath),
            sizeBytes: stat.size,
            lastModified: stat.mtime.toISOString(),
        };
    } catch (e) {
        return null;
    }
}

// HTTP Server
const server = http.createServer((req, res) => {
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const pathname = urlObj.pathname;

    // CORS headers for web client interop
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Character-Name');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Health & Liveness Probes (/health and /healthz for Cloud Run / Kubernetes)
    if ((pathname === '/health' || pathname === '/healthz') && req.method === 'GET') {
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        res.end(JSON.stringify({
            status: 'ok',
            uptime: Math.floor(process.uptime()),
            activeSessions: activeSessions.size,
            engine: fs.existsSync(ENGINE_EXE) ? 'ready' : 'missing',
            version: '1.2.1',
            timestamp: Date.now()
        }));
        return;
    }

    // Standalone package ZIP download
    if ((pathname === '/download/angband3d-standalone.zip' || pathname === '/download/Angband3D-Windows-x64.zip' || pathname === '/download/angband3d-windows.zip') && (req.method === 'GET' || req.method === 'HEAD')) {
        // Look for zip in DIST_DIR
        let zipPath = path.join(DIST_DIR, 'Angband3D-Windows-x64.zip');
        if (!fs.existsSync(zipPath)) zipPath = path.join(DIST_DIR, 'angband3d-standalone.zip');
        if (!fs.existsSync(zipPath)) {
            // Check for any zip file in dist directory
            const files = fs.existsSync(DIST_DIR) ? fs.readdirSync(DIST_DIR) : [];
            const found = files.find(f => f.endsWith('.zip'));
            if (found) {
                zipPath = path.join(DIST_DIR, found);
            }
        }

        if (fs.existsSync(zipPath)) {
            const stat = fs.statSync(zipPath);
            res.writeHead(200, {
                'Content-Type': 'application/zip',
                'Content-Length': stat.size,
                'Content-Disposition': `attachment; filename="${path.basename(zipPath)}"`,
            });
            fs.createReadStream(zipPath).pipe(res);
        } else {
            // Redirect to latest GitHub Release asset as fallback
            res.writeHead(302, {
                'Location': 'https://github.com/ThunderbearStudios/angband3d/releases/latest/download/Angband3D-Windows-x64.zip'
            });
            res.end();
        }
        return;
    }

    // Android APK download endpoint
    if ((pathname === '/download/Angband3D-Android.apk' || pathname === '/download/angband3d-android.apk') && (req.method === 'GET' || req.method === 'HEAD')) {
        let apkPath = path.join(DIST_DIR, 'Angband3D-Android.apk');
        if (!fs.existsSync(apkPath)) {
            const files = fs.existsSync(DIST_DIR) ? fs.readdirSync(DIST_DIR) : [];
            const found = files.find(f => f.endsWith('.apk'));
            if (found) apkPath = path.join(DIST_DIR, found);
        }

        if (fs.existsSync(apkPath)) {
            const stat = fs.statSync(apkPath);
            res.writeHead(200, {
                'Content-Type': 'application/vnd.android.package-archive',
                'Content-Length': stat.size,
                'Content-Disposition': 'attachment; filename="Angband3D-Android.apk"',
            });
            fs.createReadStream(apkPath).pipe(res);
        } else {
            // Redirect to latest GitHub Release asset
            res.writeHead(302, {
                'Location': 'https://github.com/ThunderbearStudios/angband3d/releases/latest/download/Angband3D-Android.apk'
            });
            res.end();
        }
        return;
    }

    // REST: List saves
    if (pathname === '/api/saves' && req.method === 'GET') {
        try {
            const saveDirs = getSaveDirs();
            const saves = [];
            const seenFiles = new Set();

            for (const sDir of saveDirs) {
                if (!fs.existsSync(sDir)) continue;
                const files = fs.readdirSync(sDir);
                for (const file of files) {
                    if (file.startsWith('.') || seenFiles.has(file)) continue;
                    const fullPath = path.join(sDir, file);
                    try {
                        const stat = fs.statSync(fullPath);
                        if (stat.isFile() && stat.size > 0) {
                            let meta = readSaveMetadata(fullPath);
                            if (!meta && stat.size >= 36) {
                                meta = {
                                    filename: file,
                                    characterName: file,
                                    description: file,
                                    sizeBytes: stat.size,
                                    lastModified: stat.mtime.toISOString(),
                                };
                            }
                            if (meta) {
                                seenFiles.add(file);
                                // Ensure save is mirrored into primary SAVE_DIR if found in a secondary dir
                                if (SAVE_DIR && sDir !== SAVE_DIR) {
                                    try {
                                        fs.copyFileSync(fullPath, path.join(SAVE_DIR, file));
                                    } catch (_) {}
                                }
                                saves.push(meta);
                            }
                        }
                    } catch (_) {}
                }
            }
            saves.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ saves }));
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // REST: Server Capacity & Telemetry Status
    if (pathname === '/api/status' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'online',
            activeSessions: activeSessions.size,
            maxCapacity: MAX_CONCURRENT_GAMES,
            waitingQueue: waitingQueue.length,
            maxQueueSize: MAX_QUEUE_SIZE,
            version: '1.2.0'
        }));
        return;
    }

    // REST: Download latest or current save direct fallback
    if ((pathname === '/api/saves/latest' || pathname === '/api/saves-download-current') && req.method === 'GET') {
        const charName = urlObj.searchParams.get('char');
        const saveDirs = getSaveDirs();
        let allSaves = [];

        for (const sDir of saveDirs) {
            if (!fs.existsSync(sDir)) continue;
            const files = fs.readdirSync(sDir);
            for (const file of files) {
                if (file.startsWith('.')) continue;
                const fullPath = path.join(sDir, file);
                try {
                    const stat = fs.statSync(fullPath);
                    if (stat.isFile() && stat.size > 0) {
                        let meta = readSaveMetadata(fullPath);
                        if (!meta && stat.size >= 36) {
                            meta = {
                                filename: file,
                                characterName: file,
                                description: file,
                                sizeBytes: stat.size,
                                lastModified: stat.mtime.toISOString(),
                            };
                        }
                        if (meta) {
                            allSaves.push({ ...meta, fullPath });
                        }
                    }
                } catch (_) {}
            }
        }

        allSaves.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
        let match = null;
        if (charName) {
            match = allSaves.find(s =>
                (s.characterName && s.characterName.toLowerCase() === charName.toLowerCase()) ||
                (s.filename && s.filename.toLowerCase() === charName.toLowerCase()) ||
                (s.filename && s.filename.toLowerCase().startsWith(charName.toLowerCase()))
            );
        }
        if (!match && allSaves.length > 0) {
            match = allSaves[0];
        }

        // Final fallback: check for any non-empty file in any save directory
        if (!match) {
            let newestMtime = 0;
            for (const sDir of saveDirs) {
                if (!fs.existsSync(sDir)) continue;
                const files = fs.readdirSync(sDir);
                for (const file of files) {
                    if (file.startsWith('.')) continue;
                    const fullPath = path.join(sDir, file);
                    try {
                        const stat = fs.statSync(fullPath);
                        if (stat.isFile() && stat.size > 0 && stat.mtimeMs > newestMtime) {
                            newestMtime = stat.mtimeMs;
                            match = { fullPath, filename: file, characterName: charName || file };
                        }
                    } catch (_) {}
                }
            }
        }

        if (match && fs.existsSync(match.fullPath)) {
            const outName = (match.characterName || match.filename).replace(/[^a-zA-Z0-9_-]/g, '_') + '.sav';
            res.writeHead(200, {
                'Content-Type': 'application/octet-stream',
                'Content-Disposition': `attachment; filename="${outName}"`,
            });
            fs.createReadStream(match.fullPath).pipe(res);
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'No save files available' }));
        }
        return;
    }

    // REST: Download single save
    if (pathname.startsWith('/api/saves/') && req.method === 'GET') {
        const rawSaveName = pathname.substring('/api/saves/'.length);
        const saveName = sanitizeFilename(rawSaveName);
        if (!saveName || isReservedFilename(saveName)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid save file name' }));
            return;
        }
        const saveDirs = getSaveDirs();
        let targetPath = null;

        for (const sDir of saveDirs) {
            const p = path.join(sDir, saveName);
            if (fs.existsSync(p) && fs.statSync(p).isFile()) {
                targetPath = p;
                break;
            }
        }

        if (targetPath) {
            const outName = saveName.endsWith('.sav') ? saveName : `${saveName}.sav`;
            res.writeHead(200, {
                'Content-Type': 'application/octet-stream',
                'Content-Disposition': `attachment; filename="${outName}"`,
            });
            fs.createReadStream(targetPath).pipe(res);
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Save file not found' }));
        }
        return;
    }

    // REST: Upload save
    if (pathname === '/api/saves/upload' && req.method === 'POST') {
        const chunks = [];
        let totalSize = 0;
        const maxLimit = 10 * 1024 * 1024; // 10 MB limit

        req.on('data', chunk => {
            totalSize += chunk.length;
            if (totalSize > maxLimit) {
                res.writeHead(413, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Payload too large' }));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });

        req.on('end', () => {
            const buf = Buffer.concat(chunks);
            if (buf.length < 36 || buf.toString('ascii', 0, 8) !== 'SaveVNLA') {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid savefile: missing SaveVNLA magic header' }));
                return;
            }

            const headerName = req.headers['x-character-name'];
            let cleanHeaderName = headerName ? sanitizeFilename(headerName) : null;
            if (cleanHeaderName && isReservedFilename(cleanHeaderName)) {
                cleanHeaderName = null;
            }
            let targetName = cleanHeaderName || ('upload_' + Date.now());

            // Extract character name from description if available
            const tempFile = path.join(SAVE_DIR, '.tmp_' + Date.now());
            fs.writeFileSync(tempFile, buf);
            const meta = readSaveMetadata(tempFile);
            if (meta && meta.characterName && !cleanHeaderName) {
                const cleanMetaName = sanitizeFilename(meta.characterName);
                if (cleanMetaName && !isReservedFilename(cleanMetaName)) {
                    targetName = cleanMetaName;
                }
            }

            const destPath = path.join(SAVE_DIR, targetName);
            fs.renameSync(tempFile, destPath);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'saved',
                filename: targetName,
                metadata: readSaveMetadata(destPath)
            }));
        });
        return;
    }

    // REST: Delete save
    if (pathname.startsWith('/api/saves/') && req.method === 'DELETE') {
        const rawSaveName = pathname.substring('/api/saves/'.length);
        const saveName = sanitizeFilename(rawSaveName);
        if (!saveName || isReservedFilename(saveName)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid save file name' }));
            return;
        }
        const savePath = path.join(SAVE_DIR, saveName);
        if (fs.existsSync(savePath) && fs.statSync(savePath).isFile()) {
            try {
                fs.unlinkSync(savePath);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'deleted', filename: saveName }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Save file not found' }));
        }
        return;
    }

    // Static Web Client Files
    let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    if (safePath === '/' || safePath === '\\') safePath = '/index.html';
    const filePath = path.resolve(WEB_DIR, '.' + path.sep + safePath);

    // Guard against directory traversal attacks
    if (!filePath.startsWith(path.resolve(WEB_DIR))) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Access denied' }));
        return;
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const mimeTypes = {
            '.html': 'text/html; charset=utf-8',
            '.js': 'application/javascript; charset=utf-8',
            '.wasm': 'application/wasm',
            '.pck': 'application/octet-stream',
            '.css': 'text/css; charset=utf-8',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.webp': 'image/webp',
            '.svg': 'image/svg+xml',
            '.json': 'application/json; charset=utf-8',
            '.obj': 'text/plain; charset=utf-8',
            '.mtl': 'text/plain; charset=utf-8',
            '.gltf': 'model/gltf+json',
            '.glb': 'model/gltf-binary',
            '.bin': 'application/octet-stream',
            '.wav': 'audio/wav',
            '.ogg': 'audio/ogg',
            '.mp3': 'audio/mpeg',
        };
        const contentType = mimeTypes[ext] || 'application/octet-stream';

        // HTTP Caching Strategy:
        // - HTML, JS, CSS: no-cache, no-store, must-revalidate to ensure instant delivery of app updates
        // - 3D Models, Textures, Audio: 24h caching (immutable static assets)
        let cacheControl = 'no-cache, no-store, must-revalidate';
        if (['.png', '.jpg', '.jpeg', '.webp', '.obj', '.mtl', '.gltf', '.glb', '.bin', '.wasm', '.pck', '.wav', '.ogg', '.mp3'].includes(ext)) {
            cacheControl = 'public, max-age=86400, immutable';
        }

        const headers = {
            'Content-Type': contentType,
            'Cache-Control': cacheControl,
            // Cross-Origin Isolation headers required for Godot 4 WebAssembly multithreading/SharedArrayBuffer
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
        };

        // Gzip compression for text & code payloads (.html, .js, .css, .json, .obj, .mtl, .svg)
        const compressible = ['.html', '.js', '.css', '.json', '.obj', '.mtl', '.svg'].includes(ext);
        const acceptEncoding = req.headers['accept-encoding'] || '';

        if (compressible && acceptEncoding.includes('gzip')) {
            headers['Content-Encoding'] = 'gzip';
            res.writeHead(200, headers);
            fs.createReadStream(filePath).pipe(zlib.createGzip({ level: 6 })).pipe(res);
            return;
        } else if (compressible && acceptEncoding.includes('deflate')) {
            headers['Content-Encoding'] = 'deflate';
            res.writeHead(200, headers);
            fs.createReadStream(filePath).pipe(zlib.createDeflate()).pipe(res);
            return;
        }

        res.writeHead(200, headers);
        fs.createReadStream(filePath).pipe(res);
        return;
    }

    // Return 404 for missing assets or files with extensions instead of returning HTML landing page
    if (pathname.startsWith('/assets/') || path.extname(pathname)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Asset not found: ${pathname}` }));
        return;
    }

    // Default Landing Page
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!DOCTYPE html>
<html>
<head>
    <title>Angband3D Cloud Realm</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0c0d12; color: #dcdcdc; padding: 40px; text-align: center; }
        h1 { color: #e6a817; letter-spacing: 2px; }
        p { color: #8892b0; max-width: 600px; margin: 0 auto 20px; line-height: 1.6; }
        .btn { display: inline-block; padding: 12px 24px; background: #2563eb; color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 10px; }
        .btn:hover { background: #1d4ed8; }
        .card { background: #151821; border: 1px solid #282f44; border-radius: 8px; padding: 20px; max-width: 600px; margin: 30px auto; text-align: left; }
        code { background: #090a0f; padding: 2px 6px; border-radius: 4px; color: #38bdf8; }
    </style>
</head>
<body>
    <h1>ANGBAND 3D</h1>
    <p>Authoritative Cloud Game Server & WebSocket Bridge.</p>
    <div class="card">
        <h3>Server Status: Online</h3>
        <p>Engine Binary: <code>${ENGINE_EXE}</code></p>
        <p>WebSocket Endpoint: <code>ws://${req.headers.host || 'localhost:' + PORT}/ws</code></p>
        <p>Save Directory: <code>${SAVE_DIR}</code></p>
    </div>
    <a href="/download/angband3d-standalone.zip" class="btn">Download Standalone Game (.zip)</a>
</body>
</html>`);
});

// WebSocket Server attached to HTTP server
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
    const urlObj = new URL(request.url, `http://${request.headers.host}`);
    if (urlObj.pathname === '/ws') {
        wss.handleUpgrade(request, socket, head, ws => {
            wss.emit('connection', ws, request);
        });
    } else {
        socket.destroy();
    }
});

function broadcastQueueStatus() {
    // Purge any closed sockets
    for (let i = waitingQueue.length - 1; i >= 0; i--) {
        if (waitingQueue[i].ws.readyState !== 1 /* WebSocket.OPEN */) {
            waitingQueue.splice(i, 1);
        }
    }

    for (let i = 0; i < waitingQueue.length; i++) {
        const item = waitingQueue[i];
        try {
            if (item.ws.readyState === 1) {
                item.ws.send(JSON.stringify({
                    t: 'queue',
                    status: 'waiting',
                    position: i + 1,
                    totalInQueue: waitingQueue.length,
                    maxCapacity: MAX_CONCURRENT_GAMES,
                    activeCount: activeSessions.size
                }));
            }
        } catch (_) {}
    }
}

function processWaitingQueue() {
    while (waitingQueue.length > 0 && activeSessions.size < MAX_CONCURRENT_GAMES) {
        const nextClient = waitingQueue.shift();
        if (!nextClient) break;
        if (nextClient.ws.readyState === 1 /* WebSocket.OPEN */) {
            const waitSeconds = Math.round((Date.now() - nextClient.enqueueTime) / 1000);
            console.log(`[Queue] Admitting queued client ${nextClient.id} after ${waitSeconds}s wait. Active games: ${activeSessions.size + 1}/${MAX_CONCURRENT_GAMES}`);

            // Remove temporary queue listeners
            nextClient.ws.removeAllListeners('message');
            nextClient.ws.removeAllListeners('close');
            nextClient.ws.removeAllListeners('error');

            try {
                nextClient.ws.send(JSON.stringify({
                    t: 'queue',
                    status: 'admitted',
                    position: 0,
                    totalInQueue: waitingQueue.length
                }));
            } catch (_) {}

            spawnGameSession(nextClient.ws, nextClient.request);
        }
    }
    broadcastQueueStatus();
}

// Periodic queue status broadcast (every 5 seconds) to refresh position and keep connection alive
setInterval(() => {
    if (waitingQueue.length > 0) {
        broadcastQueueStatus();
    }
}, 5000).unref();

function spawnGameSession(ws, request) {
    const urlObj = new URL(request.url, `http://${request.headers.host}`);
    const rawUser = urlObj.searchParams.get('user') || null;
    const rawSave = urlObj.searchParams.get('save') || null;
    const user = rawUser ? rawUser.replace(/[^a-zA-Z0-9_-]/g, '') : null;
    const save = rawSave ? rawSave.replace(/[^a-zA-Z0-9_-]/g, '') : null;

    const sessionId = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
    ws.send(JSON.stringify({ t: 'hello', sessionId, version: '1.0.0' }));

    if (!fs.existsSync(ENGINE_EXE)) {
        ws.send(JSON.stringify({
            t: 'bye',
            detail: `Engine binary not found: ${ENGINE_EXE}`
        }));
        ws.close();
        return;
    }

    const isNew = urlObj.searchParams.get('new') === '1' || urlObj.searchParams.get('reroll') === '1';

    const args = ['-mbridge'];
    if (SAVE_DIR) {
        args.push(`-dsave=${SAVE_DIR}`);
        args.push(`-dpanic=${path.join(SAVE_DIR, 'panic')}`);
    }
    if (save) {
        args.push(`-u${save}`);
    } else if (user) {
        args.push(`-u${user}`);
    }
    if (isNew) {
        args.push('-n');
    }

    const engineDir = path.dirname(ENGINE_EXE);

    // If starting a fresh character, purge any stale panic save files so the engine starts cleanly without prompts
    if (isNew) {
        const targetSlot = save || user || 'Adventurer';
        const panicDirs = [
            path.join(SAVE_DIR, 'panic'),
            path.join(engineDir, 'lib/user/panic'),
            path.join(engineDir, 'lib/save/panic')
        ];
        for (const pDir of panicDirs) {
            try {
                if (fs.existsSync(pDir)) {
                    const files = fs.readdirSync(pDir);
                    for (const f of files) {
                        if (f === targetSlot || f.startsWith(targetSlot + '.')) {
                            try { fs.unlinkSync(path.join(pDir, f)); } catch (_) {}
                        }
                    }
                }
            } catch (_) {}
        }
    }
    const child = spawn(ENGINE_EXE, args, {
        cwd: engineDir,
        env: {
            ...process.env,
            ANGBAND_PATH: path.join(engineDir, 'lib'),
            LANG: process.env.LANG || 'C.UTF-8',
            LC_ALL: process.env.LC_ALL || 'C.UTF-8',
            LC_CTYPE: 'C.UTF-8',
            TERM: 'xterm-256color',
            HOME: process.env.HOME || '/app',
        },
        stdio: ['pipe', 'pipe', 'pipe']
    });

    // Register session in active session tracking with idle timer
    activeSessions.set(sessionId, { child, ws, startTime: Date.now(), lastActivityTime: Date.now(), user });

    let lineBuffer = '';

    child.stdout.on('data', chunk => {
        lineBuffer += chunk.toString('utf8');
        let newlineIdx;
        while ((newlineIdx = lineBuffer.indexOf('\n')) !== -1) {
            const line = lineBuffer.substring(0, newlineIdx).trim();
            lineBuffer = lineBuffer.substring(newlineIdx + 1);
            if (line.length > 0 && ws.readyState === ws.OPEN) {
                ws.send(line);
            }
        }
    });

    child.stderr.on('data', chunk => {
        console.error(`[Engine Stderr] ${chunk.toString('utf8').trim()}`);
    });

    child.on('error', err => {
        console.error(`[Engine Process Error] ${err.message}`);
        activeSessions.delete(sessionId);
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ t: 'bye', detail: err.message }));
            ws.close();
        }
        setTimeout(processWaitingQueue, 50);
    });

    child.on('close', (code, signal) => {
        console.log(`[Engine Process Exit] Code: ${code}, Signal: ${signal}`);
        activeSessions.delete(sessionId);
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ t: 'bye', detail: `process exited with code ${code}` }));
            ws.close();
        }
        setTimeout(processWaitingQueue, 50);
    });

    ws.on('message', message => {
        const session = activeSessions.get(sessionId);
        if (session) {
            session.lastActivityTime = Date.now();
        }
        const str = message.toString();
        // Respond immediately to latency heartbeat pings
        if (str.startsWith('{')) {
            try {
                const parsed = JSON.parse(str);
                if (parsed.t === 'ping') {
                    if (ws.readyState === ws.OPEN) {
                        ws.send(JSON.stringify({ t: 'pong', time: parsed.time }));
                    }
                    return;
                }
            } catch (_) {}
        }
        // Client sends command line e.g. "key left" or "frame"
        if (child.stdin && child.stdin.writable) {
            child.stdin.write(str.trim() + '\n');
        }
    });

    ws.on('close', () => {
        console.log('[WebSocket] Client disconnected. Saving authoritative state before stopping engine...');
        activeSessions.delete(sessionId);
        try {
            if (child && !child.killed && child.stdin && child.stdin.writable) {
                // Issue clean bridge 'save' command to write persistent state without triggering panic save
                child.stdin.write('save\n');
                setTimeout(() => {
                    try {
                        if (child && !child.killed) {
                            child.stdin.end();
                            child.kill();
                        }
                    } catch (_) {}
                }, 200);
            } else if (child && !child.killed) {
                child.kill();
            }
        } catch (_) {}
        setTimeout(processWaitingQueue, 50);
    });

    ws.on('error', err => {
        console.error(`[WebSocket Error] ${err.message}`);
        activeSessions.delete(sessionId);
        try {
            if (child && !child.killed) {
                child.kill('SIGKILL');
            }
        } catch (_) {}
        setTimeout(processWaitingQueue, 50);
    });
}

wss.on('connection', (ws, request) => {
    const urlObj = new URL(request.url, `http://${request.headers.host}`);
    const rawUser = urlObj.searchParams.get('user') || null;
    const rawSave = urlObj.searchParams.get('save') || null;
    const user = rawUser ? rawUser.replace(/[^a-zA-Z0-9_-]/g, '') : null;
    const save = rawSave ? rawSave.replace(/[^a-zA-Z0-9_-]/g, '') : null;

    console.log(`[WebSocket] Client connection attempt. User: ${user || 'default'}, Save: ${save || 'none'}. (Active: ${activeSessions.size}/${MAX_CONCURRENT_GAMES}, Queue: ${waitingQueue.length})`);

    // If active games are at capacity or a queue already exists, enqueue!
    if (activeSessions.size >= MAX_CONCURRENT_GAMES || waitingQueue.length > 0) {
        if (waitingQueue.length >= MAX_QUEUE_SIZE) {
            console.warn(`[Queue] Realm and queue at capacity (${activeSessions.size}/${MAX_CONCURRENT_GAMES}, Queue: ${waitingQueue.length}/${MAX_QUEUE_SIZE}). Rejecting.`);
            ws.send(JSON.stringify({
                t: 'bye',
                detail: 'The realm is currently at maximum player and queue capacity. Please try reconnecting shortly.'
            }));
            ws.close();
            return;
        }

        const queueId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
        const queueItem = {
            id: queueId,
            ws,
            request,
            enqueueTime: Date.now(),
            user,
            save
        };
        waitingQueue.push(queueItem);
        const position = waitingQueue.length;

        console.log(`[Queue] Enqueued client ${queueId} (Position: #${position}/${waitingQueue.length}, Active games: ${activeSessions.size}/${MAX_CONCURRENT_GAMES})`);

        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({
                t: 'queue',
                status: 'waiting',
                position: position,
                totalInQueue: waitingQueue.length,
                maxCapacity: MAX_CONCURRENT_GAMES,
                activeCount: activeSessions.size
            }));
        }

        ws.on('message', message => {
            const str = message.toString();
            if (str.startsWith('{')) {
                try {
                    const parsed = JSON.parse(str);
                    if (parsed.t === 'ping') {
                        if (ws.readyState === ws.OPEN) {
                            ws.send(JSON.stringify({ t: 'pong', time: parsed.time }));
                        }
                        return;
                    }
                    if (parsed.t === 'cancel') {
                        console.log(`[Queue] Client canceled queue wait: ${queueId}`);
                        ws.close();
                        return;
                    }
                } catch (_) {}
            }
        });

        ws.on('close', () => {
            const idx = waitingQueue.findIndex(item => item.id === queueId);
            if (idx !== -1) {
                waitingQueue.splice(idx, 1);
                console.log(`[Queue] Client left queue: ${queueId}. Remaining in queue: ${waitingQueue.length}`);
                broadcastQueueStatus();
            }
        });

        ws.on('error', err => {
            console.error(`[Queue Error] ${err.message}`);
            const idx = waitingQueue.findIndex(item => item.id === queueId);
            if (idx !== -1) {
                waitingQueue.splice(idx, 1);
                broadcastQueueStatus();
            }
        });

        broadcastQueueStatus();
        return;
    }

    spawnGameSession(ws, request);
});

// Periodic idle session reaper: safely flush saves and release memory for inactive tabs
setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of activeSessions.entries()) {
        if (now - session.lastActivityTime > IDLE_TIMEOUT_MS) {
            console.log(`[Angband3D Cloud] Reaping idle session ${sessionId} (${Math.round((now - session.lastActivityTime) / 60000)}m inactive). Saving state...`);
            try {
                if (session.ws && session.ws.readyState === 1) {
                    session.ws.send(JSON.stringify({
                        t: 'bye',
                        detail: 'Session timed out due to 20 minutes of inactivity. Progress has been safely saved.'
                    }));
                    session.ws.close();
                }
                if (session.child && !session.child.killed && session.child.stdin && session.child.stdin.writable) {
                    session.child.stdin.write('save\n');
                    setTimeout(() => {
                        try {
                            if (session.child && !session.child.killed) {
                                session.child.stdin.end();
                                session.child.kill();
                            }
                        } catch (_) {}
                    }, 200);
                } else if (session.child && !session.child.killed) {
                    session.child.kill();
                }
            } catch (err) {
                console.error(`[Idle Reaper Error] ${err.message}`);
            }
            activeSessions.delete(sessionId);
            setTimeout(processWaitingQueue, 50);
        }
    }
}, 30000).unref();

// Graceful container shutdown: terminate child processes before container exit
function gracefulShutdown(signal) {
    console.log(`[Angband3D Cloud] Received ${signal}. Terminating all ${activeSessions.size} active engine sessions...`);
    for (const [sessionId, session] of activeSessions.entries()) {
        try {
            if (session.ws && session.ws.readyState === 1) {
                session.ws.send(JSON.stringify({ t: 'bye', detail: 'Server shutting down' }));
                session.ws.close();
            }
            if (session.child && !session.child.killed) {
                session.child.kill('SIGTERM');
            }
        } catch (_) {}
    }
    activeSessions.clear();
    for (const item of waitingQueue) {
        try {
            if (item.ws && item.ws.readyState === 1) {
                item.ws.send(JSON.stringify({ t: 'bye', detail: 'Server shutting down' }));
                item.ws.close();
            }
        } catch (_) {}
    }
    waitingQueue.length = 0;
    server.close(() => {
        console.log('[Angband3D Cloud] HTTP server closed cleanly. Exiting.');
        process.exit(0);
    });
    setTimeout(() => {
        console.warn('[Angband3D Cloud] Forcing exit after shutdown timeout.');
        process.exit(0);
    }, 5000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

server.listen(PORT, () => {
    console.log(`[Angband3D Cloud Server] Listening on http://localhost:${PORT}`);
});
