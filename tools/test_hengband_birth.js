const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

const binPath = path.resolve(__dirname, '../variants/hengband/bin/hengband.exe');
const libPath = path.resolve(__dirname, '../variants/hengband/lib');

console.log('=== Hengband 3.0.1 Birth & Bridge Verification ===');
console.log('Binary:', binPath);
console.log('Lib path:', libPath);

const proc = spawn(binPath, ['-mbridge', '-n'], {
  env: {
    ...process.env,
    ANGBAND_PATH: libPath,
    HENG_PATH: libPath
  },
  cwd: path.resolve(__dirname, '../variants/hengband')
});

const rl = readline.createInterface({ input: proc.stdout });

let frameCount = 0;
let step = 0;

rl.on('line', (line) => {
  try {
    const data = JSON.parse(line);
    if (data.t === 'hello') {
      console.log('[HELLO] Version:', data.version, 'Realm:', data.realm, 'Caps:', JSON.stringify(data.caps));
    } else if (data.t === 'frame') {
      frameCount++;
      console.log(`\n[Frame ${frameCount}] Phase=${data.phase} Overlay=${data.ui?.overlay} Awaiting=${data.ui?.awaiting_command} More=${data.ui?.more}`);
      
      if (data.term?.rows) {
        data.term.rows.forEach((r, idx) => {
          if (r.g && r.g.trim()) console.log(`  [${idx.toString().padStart(2, ' ')}] ${r.g.trim()}`);
        });
      }

      if (data.phase === 'play') {
        console.log('\n*** ENTERED HENGBAND PLAY PHASE! ***');
        console.log('Player name:', data.player?.name);
        console.log('Player telemetry:', JSON.stringify(data.player, null, 2));
        console.log('Level:', data.player?.level || data.player?.lev, 'HP:', data.player?.hp, '/', data.player?.hp_max);
        console.log('Map size:', data.map?.w, 'x', data.map?.h);
        console.log('Dungeon depth:', data.dungeon?.depth, 'Name:', data.dungeon?.name);
        console.log('Messages:', data.messages);
        
        setTimeout(() => {
          console.log('\nSending graceful quit in play phase...');
          proc.stdin.write('quit\n');
        }, 500);
      } else {
        // Step progression for birth screens
        handleBirthStep(data);
      }
    } else if (data.t === 'bye') {
      console.log('\n[BYE] Received clean bridge shutdown bye signal.');
      process.exit(0);
    }
  } catch (err) {
    console.log('[RAW STDOUT]:', line);
  }
});

function handleBirthStep(data) {
  // Inspect terminal text to make intelligent decisions
  const screenText = data.term?.rows ? data.term.rows.map(r => r.g || '').join('\n') : '';

  if (screenText.includes('Are you sure? [Y/n]') || screenText.includes('are you sure? [y/n]')) {
    console.log('-> Answering Yes (y)');
    setTimeout(() => proc.stdin.write('key y\n'), 100);
    return;
  }

  if (screenText.includes('Choose a Sex') || screenText.includes('Sex:')) {
    console.log('-> Choosing Male (b)');
    setTimeout(() => proc.stdin.write('key b\n'), 100);
    return;
  }

  if (screenText.includes('Choose a Race') || screenText.includes('Race:')) {
    console.log('-> Choosing Human (a)');
    setTimeout(() => proc.stdin.write('key a\n'), 100);
    return;
  }

  if (screenText.includes('Choose a Class') || screenText.includes('Class:')) {
    console.log('-> Choosing Warrior (a)');
    setTimeout(() => proc.stdin.write('key a\n'), 100);
    return;
  }

  if (screenText.includes('Choose a Realm') || screenText.includes('Choose a realm') || screenText.includes('Realm 1:')) {
    console.log('-> Choosing Life Realm (a)');
    setTimeout(() => proc.stdin.write('key a\n'), 100);
    return;
  }

  if (screenText.includes('Choose a Personality') || screenText.includes('Personality:')) {
    console.log('-> Choosing Ordinary (a)');
    setTimeout(() => proc.stdin.write('key a\n'), 100);
    return;
  }

  if (screenText.includes('ESC:accept') || screenText.includes('Birth Options') || screenText.includes('birth options')) {
    console.log('-> Accepting birth options with ESC');
    setTimeout(() => proc.stdin.write('key escape\n'), 100);
    return;
  }

  if (screenText.includes("Enter your player's name") || screenText.includes('Enter name:')) {
    console.log('-> Entering name: Musashi');
    setTimeout(() => {
      proc.stdin.write('key M\n');
      proc.stdin.write('key u\n');
      proc.stdin.write('key s\n');
      proc.stdin.write('key a\n');
      proc.stdin.write('key s\n');
      proc.stdin.write('key h\n');
      proc.stdin.write('key i\n');
      proc.stdin.write('key enter\n');
    }, 100);
    return;
  }

  if (screenText.includes('Press any key') || screenText.includes('Hit any key') || screenText.includes('press space')) {
    console.log('-> Pressing space');
    setTimeout(() => proc.stdin.write('key space\n'), 100);
    return;
  }

  // Fallback progression
  step++;
  console.log(`Fallback Step ${step} -> Pressing Enter`);
  setTimeout(() => proc.stdin.write('key enter\n'), 150);
}

proc.stderr.on('data', (d) => console.error('[STDERR]:', d.toString()));
proc.on('exit', (c) => {
  console.log('[EXIT] Process exited with code', c);
});

setTimeout(() => {
  console.log('[TIMEOUT] Reached 30s timeout without completing birth, sending quit...');
  try {
    proc.stdin.write('quit\n');
  } catch (_) {}
  setTimeout(() => process.exit(1), 2000);
}, 30000);
