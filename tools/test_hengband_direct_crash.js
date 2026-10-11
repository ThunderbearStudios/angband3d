const { spawn } = require('child_process');
const path = require('path');

const binPath = path.resolve(__dirname, '../variants/hengband/bin/hengband.exe');
const libPath = path.resolve(__dirname, '../variants/hengband/lib');

const proc = spawn(binPath, ['-mbridge', '-n'], {
  env: {
    ...process.env,
    ANGBAND_PATH: libPath,
    HENG_PATH: libPath
  },
  cwd: path.resolve(__dirname, '../variants/hengband')
});

let frameCount = 0;
let buffer = '';

proc.stdout.on('data', (d) => {
  buffer += d.toString('utf8');
  let lines = buffer.split('\n');
  buffer = lines.pop();

  for (const line of lines) {
    if (!line.trim()) continue;
    let data;
    try { data = JSON.parse(line); } catch (e) {
      console.log('[NON-JSON STDOUT]:', line);
      continue;
    }

    if (data.t === 'hello') {
      console.log('[HELLO]');
    } else if (data.t === 'event') {
      console.log('[EVENT]', data.type, data.detail);
    } else if (data.t === 'frame') {
      frameCount++;
      const termRows = data.term?.rows || data.term?.lines || [];
      const screenText = termRows.map(r => r.g || '').join('\n');
      console.log(`[Frame ${frameCount}] Phase=${data.phase} Awaiting=${data.awaiting_command || data.ui?.awaiting_command}`);
      console.log(`   Text: ${screenText.replace(/\s+/g, ' ').slice(0, 140)}`);

      if (data.phase === 'play') {
        console.log('*** REACHED PLAY PHASE! ***');
        proc.stdin.write('quit\n');
        return;
      }

      // Exact progression sequence
      if (frameCount === 8) {
        console.log('-> Frame 8: Escape (options)');
        proc.stdin.write('key escape\n');
      } else if (screenText.includes('よろしいですか？[Y/n]') || screenText.includes('[Y/n]') || screenText.includes('[y/n]')) {
        console.log(`-> Frame ${frameCount}: y`);
        proc.stdin.write('key y\n');
      } else if (frameCount === 19) {
        console.log(`-> Frame ${frameCount}: ENTER (GAME START!)`);
        proc.stdin.write('key enter\n');
      } else {
        console.log(`-> Frame ${frameCount}: enter`);
        proc.stdin.write('key enter\n');
      }
    }
  }
});

proc.stderr.on('data', (d) => {
  console.log('[STDERR]:', d.toString('utf8'));
});

proc.on('close', (code, signal) => {
  console.log(`[PROCESS CLOSED] code=${code} signal=${signal}`);
  process.exit(code || 0);
});

setTimeout(() => {
  console.log('[DIRECT TIMEOUT 15s]');
  proc.kill();
  process.exit(1);
}, 15000);
