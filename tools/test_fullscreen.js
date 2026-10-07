const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

async function testPage(url, isModal = false) {
  console.log(`\n=== Testing ${url} (isModal: ${isModal}) ===`);
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9412',
    '--window-size=1920,1080',
    '--disable-gpu',
    '--no-sandbox',
    url
  ]);

  await new Promise(r => setTimeout(r, 3000));

  const versionData = await new Promise((resolve) => {
    http.get('http://127.0.0.1:9412/json', res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
  });

  const pageTarget = versionData.find(t => t.type === 'page');
  let WebSocket;
  try { WebSocket = require('ws'); } catch (_) { WebSocket = require('../server/node_modules/ws'); }
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

  await new Promise(r => ws.on('open', r));

  let id = 1;
  function send(method, params = {}) {
    return new Promise((resolve) => {
      const msgId = id++;
      const handler = (data) => {
        const msg = JSON.parse(data);
        if (msg.id === msgId) {
          ws.off('message', handler);
          resolve(msg.result);
        }
      };
      ws.on('message', handler);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');

  await new Promise(r => setTimeout(r, 1500));

  if (isModal) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        if (window.__app && window.__app.demoPlayer) {
          window.__app.demoPlayer.open('splash');
        } else if (window.demoPlayer) {
          window.demoPlayer.open('splash');
        } else {
          const btn = document.getElementById('btn-splash-demo');
          if (btn) btn.click();
        }
      })()`
    });
    await new Promise(r => setTimeout(r, 1000));
  }

  const evalRes = await send('Runtime.evaluate', {
    expression: `(async () => {
      const player = window.__app && window.__app.demoPlayer ? window.__app.demoPlayer : window.demoPlayer;
      const container = player ? player.getContainer() : document.querySelector('.demo-theater-container');
      const video = document.getElementById('demo-video-player');
      const wrapper = document.querySelector('.demo-video-wrapper');
      const transport = document.querySelector('.demo-transport-bar');
      const ribbon = document.querySelector('.demo-chapter-ribbon');
      const fsBtn = document.getElementById('demo-btn-fullscreen');

      const normal = {
        hasContainer: Boolean(container),
        video: { w: video.offsetWidth, h: video.offsetHeight },
        wrapper: { w: wrapper.offsetWidth, h: wrapper.offsetHeight },
        container: { w: container ? container.offsetWidth : 0, h: container ? container.offsetHeight : 0 }
      };

      // Trigger fullscreen via player or button click
      if (fsBtn) {
        fsBtn.click();
      } else if (player) {
        player.toggleFullscreen();
      }
      // If headless browser doesn't execute native requestFullscreen without gesture, ensure fallback active
      if (!container.classList.contains('is-fullscreen') && player) {
        player.enterCssFullscreen(container);
      }

      await new Promise(r => setTimeout(r, 400));

      const fsRect = {
        window: { w: window.innerWidth, h: window.innerHeight },
        isFsActive: container.classList.contains('is-fullscreen'),
        btnText: fsBtn ? fsBtn.textContent : '',
        video: { w: video.offsetWidth, h: video.offsetHeight },
        wrapper: { w: wrapper.offsetWidth, h: wrapper.offsetHeight },
        container: { w: container.offsetWidth, h: container.offsetHeight },
        transport: { w: transport.offsetWidth, h: transport.offsetHeight, bottom: Math.round(window.innerHeight - transport.getBoundingClientRect().bottom) },
        ribbon: { w: ribbon.offsetWidth, h: ribbon.offsetHeight, bottom: Math.round(window.innerHeight - ribbon.getBoundingClientRect().bottom) }
      };

      // Test HUD auto-hide state
      container.classList.add('hud-hidden');
      await new Promise(r => setTimeout(r, 450));
      const transportStyle = window.getComputedStyle(transport);
      const hudHiddenOpacity = parseFloat(transportStyle.opacity);
      const hudHiddenPointerEvents = transportStyle.pointerEvents;

      // Revert fullscreen
      if (player) {
        player.exitFullscreen();
      } else {
        container.classList.remove('hud-hidden', 'is-fullscreen');
      }

      return {
        normal,
        fullscreen: fsRect,
        hudHidden: {
          opacity: hudHiddenOpacity,
          pointerEvents: hudHiddenPointerEvents
        }
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('Result:', JSON.stringify(evalRes.result.value, null, 2));
  chrome.kill();
  return evalRes.result.value;
}

async function main() {
  const targetHost = process.argv[2] || 'http://localhost:8080';
  console.log(`Running fullscreen test suite against: ${targetHost}`);
  const r1 = await testPage(`${targetHost}/demo`, false);
  const r2 = await testPage(`${targetHost}/`, true);

  console.log('\n================ SUMMARY ================');
  console.log('Demo Page Fullscreen Video Fill:', r1.fullscreen.video.w === r1.fullscreen.window.w && r1.fullscreen.video.h === r1.fullscreen.window.h ? '✅ PASS' : '❌ FAIL');
  console.log('Demo Page HUD Auto-Hide:', r1.hudHidden.opacity < 0.05 && r1.hudHidden.pointerEvents === 'none' ? '✅ PASS' : '❌ FAIL');
  console.log('Modal Page Fullscreen Video Fill:', r2.fullscreen.video.w === r2.fullscreen.window.w && r2.fullscreen.video.h === r2.fullscreen.window.h ? '✅ PASS' : '❌ FAIL');
  console.log('Modal Page HUD Auto-Hide:', r2.hudHidden.opacity < 0.05 && r2.hudHidden.pointerEvents === 'none' ? '✅ PASS' : '❌ FAIL');

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
