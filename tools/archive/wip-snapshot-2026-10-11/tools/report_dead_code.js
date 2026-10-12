const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const publicJsDir = path.join(__dirname, '../server/public/js');
const indexHtmlPath = path.join(__dirname, '../server/public/index.html');
const filesToScan = ['app.js', 'input.js', 'hud.js'];

const allJsFiles = fs.readdirSync(publicJsDir)
    .filter(f => f.endsWith('.js'))
    .map(f => path.join(publicJsDir, f));
allJsFiles.push(indexHtmlPath);

const deadCode = {};

for (const file of filesToScan) {
    const p = path.join(publicJsDir, file);
    if (!fs.existsSync(p)) continue;
    const content = fs.readFileSync(p, 'utf8');
    const funcRegex = /function\s+([a-zA-Z0-9_]+)\s*\(/g;
    const arrowFuncRegex = /(?:const|let|var)\s+([a-zA-Z0-9_]+)\s*=\s*(?:async\s+)?(?:\([^\)]*\)|[a-zA-Z0-9_]+)\s*=>/g;
    
    let matches;
    const funcs = new Set();
    while ((matches = funcRegex.exec(content)) !== null) {
        funcs.add(matches[1]);
    }
    while ((matches = arrowFuncRegex.exec(content)) !== null) {
        funcs.add(matches[1]);
    }

    deadCode[file] = [];
    
    for (const func of funcs) {
        // Exclude window.* assignments if we can detect them easily, 
        // or just rely on the reference count.
        
        let refCount = 0;
        for (const scanFile of allJsFiles) {
            const scanContent = fs.readFileSync(scanFile, 'utf8');
            // RegExp to match word boundary, function name, word boundary
            // We want references that aren't the declaration itself.
            const regex = new RegExp(`\\b${func}\\b`, 'g');
            const fileMatches = scanContent.match(regex);
            if (fileMatches) {
                refCount += fileMatches.length;
            }
        }
        
        // The declaration itself is at least 1 count.
        if (refCount === 1) {
            deadCode[file].push(func);
        }
    }
}

const reportsDir = path.join(__dirname, 'reports');
if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir);
}

let report = '# Dead Code Report\n\n';
for (const [file, funcs] of Object.entries(deadCode)) {
    report += `## ${file}\n`;
    if (funcs.length === 0) {
        report += 'No dead code found.\n';
    } else {
        report += funcs.map(f => `- ${f}`).join('\n') + '\n';
    }
    report += '\n';
}

fs.writeFileSync(path.join(reportsDir, 'dead_code.md'), report);
console.log(`Dead code report written to tools/reports/dead_code.md. ${Object.values(deadCode).flat().length} potential dead functions found.`);
