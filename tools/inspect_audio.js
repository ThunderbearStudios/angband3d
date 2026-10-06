const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const dir = path.join(__dirname, '..', 'server', 'public', 'assets', 'audio', 'demo');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.wav'));
let totalDur = 0;
const list = [];
for (const f of files) {
    const full = path.join(dir, f);
    const out = execSync(`"C:\\msys64\\mingw64\\bin\\ffprobe.exe" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${full}"`).toString().trim();
    const dur = parseFloat(out);
    totalDur += dur;
    list.push({ file: f, duration: dur });
    console.log(f.padEnd(30), dur.toFixed(2) + 's');
}
console.log('Total dialogue duration:', totalDur.toFixed(1) + 's');
