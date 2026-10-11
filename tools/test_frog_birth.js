const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

const binPath = path.resolve(__dirname, '../variants/frogcomposband/bin/frogcomposband.exe');
const libPath = path.resolve(__dirname, '../variants/frogcomposband/lib');

console.log('Spawning:', binPath);
console.log('Lib path:', libPath);

const proc = spawn(binPath, ['-mbridge', '-n'], {
  env: {
    ...process.env,
    ANGBAND_PATH: libPath,
    FROX_PATH: libPath
  },
  cwd: path.resolve(__dirname, '..')
});

const rl = readline.createInterface({ input: proc.stdout });

let frameCount = 0;
let step = 0;

rl.on('line', (line) => {
  try {
    const data = JSON.parse(line);
    if (data.t === 'hello') {
      console.log('Received hello:', data);
    } else if (data.t === 'frame') {
      frameCount++;
      const topRow = data.term?.rows?.[0]?.g || '';
      const bottomRow = data.term?.rows?.[23]?.g || '';
      console.log(`[Frame ${frameCount}] Phase=${data.phase} Overlay=${data.ui?.overlay} Awaiting=${data.ui?.awaiting_command} More=${data.ui?.more}`);
      if (data.term?.rows) {
        data.term.rows.forEach((r, idx) => {
          if (r.g && r.g.trim()) console.log(`    [${idx}] ${r.g.trim()}`);
        });
      }

      if (data.phase === 'play') {
        console.log('*** ENTERED PLAY PHASE! ***');
        console.log('Player:', JSON.stringify(data.player));
        console.log('Map size:', data.map?.w, 'x', data.map?.h);
        console.log('Messages:', data.messages);
        setTimeout(() => {
          console.log('Sending quit command in play...');
          proc.stdin.write('quit\n');
        }, 300);
      } else if (step === 0) {
        step++;
        console.log('Step 0 -> Press Space to pass splash');
        setTimeout(() => proc.stdin.write('key space\n'), 100);
      } else if (step === 1) {
        step++;
        console.log('Step 1 -> Select Beginner Mode (b)');
        setTimeout(() => proc.stdin.write('key b\n'), 100);
      } else if (step === 2) {
        step++;
        console.log('Step 2 -> Accept Race/Class/Name (enter)');
        setTimeout(() => proc.stdin.write('key enter\n'), 100);
      } else if (step === 3) {
        step++;
        console.log('Step 3 -> Accept Stats & Begin Play (enter)');
        setTimeout(() => proc.stdin.write('key enter\n'), 100);
      }
    } else if (data.t === 'bye') {
      console.log('Received bye');
      process.exit(0);
    }
  } catch (err) {
    console.log('Raw output:', line);
  }
});

proc.stderr.on('data', (d) => console.error('stderr:', d.toString()));
proc.on('exit', (c) => console.log('Process exited with code', c));

setTimeout(() => {
  console.log('Timeout - quitting');
  proc.stdin.write('quit\n');
  setTimeout(() => process.exit(0), 1000);
}, 10000);
