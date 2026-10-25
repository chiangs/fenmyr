// Zoom: Ctrl + mouse wheel moves one even step per notch, a touchpad pinch stays smooth, Ctrl+0 resets to 100%,
// and the percentage opens the zoom menu (in, out, 100%, fit, quick sizes) with Ctrl shortcuts.
//   xvfb-run -a node tests/zoom.js
const { _electron: electron } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');

(async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-zoom-'));
  const app = await electron.launch({ args: [path.join(__dirname, '..'), '--no-sandbox'], env: { ...process.env, XDG_DATA_HOME: data, HOME: data } });
  const page = await app.firstWindow(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.waitForTimeout(2500); await page.getByText('Skip setup').click(); await page.waitForTimeout(1500); await page.keyboard.press('Escape');
  const pct = () => page.evaluate(() => document.getElementById('zoom').textContent);
  const r = {};
  await page.keyboard.press('Control+0'); await page.waitForTimeout(400); r.reset = await pct();
  // a mouse wheel: Ctrl held, one notch at a time (Chromium on Linux reports ~120px per notch)
  await page.mouse.move(700, 400); await page.keyboard.down('Control');
  const steps = [];
  for (const dy of [-120, -120, -120, 120, 120, 120, 120]) { await page.mouse.wheel(0, dy); await page.waitForTimeout(300); steps.push(await pct()); }
  // a high-resolution wheel: small events that add up to one notch
  await page.keyboard.up('Control'); await page.keyboard.press('Control+0'); await page.waitForTimeout(400); await page.keyboard.down('Control');
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -15);   // 45px: one notch
  await page.waitForTimeout(300); r.hires = await pct();
  await page.keyboard.up('Control');
  // a touchpad pinch: ctrl + wheel without Ctrl held, small deltas
  await page.keyboard.press('Control+0'); await page.waitForTimeout(400);
  await page.evaluate(() => { const s = document.querySelector('.stage') || document.getElementById('stage'); for (let i = 0; i < 3; i++) s.dispatchEvent(new WheelEvent('wheel', { deltaY: -4, ctrlKey: true, clientX: 700, clientY: 400, bubbles: true, cancelable: true })); });
  await page.waitForTimeout(300); r.pinch = await pct();
  // a big pinch flick can't jump: at most 5% per event (113% × e^0.05 ≈ 119%)
  await page.evaluate(() => { const s = document.querySelector('.stage') || document.getElementById('stage'); s.dispatchEvent(new WheelEvent('wheel', { deltaY: -300, ctrlKey: true, clientX: 700, clientY: 400, bubbles: true, cancelable: true })); });
  await page.waitForTimeout(300); r.flick = await pct();
  // the percentage opens the zoom menu; "Zoom to 100%" goes back
  await page.click('#zoom'); await page.waitForTimeout(300);
  r.menu = await page.evaluate(() => [...document.querySelectorAll('#rowMenu button')].map(b => b.textContent.replace(/\s+/g, ' ').trim()));
  await page.locator('#rowMenu button', { hasText: 'Zoom to 100%' }).click(); await page.waitForTimeout(500); r.click = await pct();
  // Ctrl + = steps along the same ladder as the wheel
  await page.keyboard.press('Control+='); await page.waitForTimeout(500); r.plus = await pct();
  r.steps = steps; r.errors = errors;
  await page.screenshot({ path: path.join(data, 'zoom.png'), clip: { x: 250, y: 800, width: 900, height: 100 } });
  console.log(JSON.stringify(r), '\n  toolbar:', path.join(data, 'zoom.png'));
  await app.close();
  const ok = r.reset === '100%' && JSON.stringify(steps) === JSON.stringify(['110%', '125%', '150%', '125%', '110%', '100%', '90%'])
    && r.hires === '110%' && r.pinch === '113%' && r.flick === '119%' && r.click === '100%' && r.plus === '110%' && r.menu.includes('Zoom in Ctrl++') && r.menu.includes('Zoom to 100% Ctrl+0') && !r.menu.join().includes('⌘') && !errors.length;
  console.log(ok ? 'ZOOM OK' : 'ZOOM FAILED'); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
