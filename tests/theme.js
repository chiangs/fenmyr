// Follow Caelestia: with a Caelestia scheme.json present, Settings offers the switch; when it's on, the board takes the
// scheme's colors and light/dark mode, and follows a new scheme live. Without Caelestia the switch isn't shown.
//   xvfb-run -a node tests/theme.js
const { _electron: electron } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');

const scheme = (mode, surface, primary) => ({ name: 'dynamic', flavour: 'default', mode, variant: 'tonalspot',
  colours: { surface: surface.slice(1), surfaceContainer: primary.slice(1), outlineVariant: '777777', primary: primary.slice(1), onPrimary: 'ffffff' } });
// the way Caelestia saves it: a new file swapped in, not an edit
const put = (dir, s) => { fs.writeFileSync(path.join(dir, 'scheme.json.tmp'), JSON.stringify(s)); fs.renameSync(path.join(dir, 'scheme.json.tmp'), path.join(dir, 'scheme.json')); };

async function open(env) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-theme-'));
  const app = await electron.launch({ args: [path.join(__dirname, '..'), '--no-sandbox'], env: { ...process.env, XDG_DATA_HOME: data, HOME: data, ...env } });
  const page = await app.firstWindow(), errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.waitForTimeout(2500); await page.getByText('Skip setup').click(); await page.waitForTimeout(1000); await page.keyboard.press('Escape');
  return { app, page, errors };
}
const look = page => page.evaluate(() => { const b = getComputedStyle(document.body); return { dark: document.body.classList.contains('dark'), board: b.getPropertyValue('--board').trim(), accent: b.getPropertyValue('--pink-deep').trim(), panel: b.getPropertyValue('--panel').trim(), offered: getComputedStyle(document.querySelector('[data-set="caelestia"]').closest('label')).display !== 'none' }; });
const settle = () => new Promise(r => setTimeout(r, 800));

(async () => {
  const r = {};
  // no Caelestia: nothing offered
  { const state = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-state-')); const { app, page, errors } = await open({ XDG_STATE_HOME: state });
    r.without = await look(page); r.errors1 = errors; await app.close(); }
  // Caelestia, dark
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-state-')), dir = path.join(state, 'caelestia'); fs.mkdirSync(dir);
  put(dir, scheme('dark', '#1a1b26', '#bb9af7'));
  const { app, page, errors } = await open({ XDG_STATE_HOME: state });
  r.before = await look(page);
  await page.evaluate(() => { const t = document.querySelector('[data-set="caelestia"]'); t.checked = true; t.onchange(); }); await settle();
  r.on = await look(page);
  put(dir, scheme('light', '#fdf8f0', '#2e7d32')); await settle();   // a new wallpaper
  r.live = await look(page);
  await page.evaluate(() => { const t = document.querySelector('[data-set="caelestia"]'); t.checked = false; t.onchange(); }); await settle();
  r.off = await look(page);
  r.errors = errors; await app.close();
  console.log(JSON.stringify(r, null, 1));
  const ok = !r.without.offered && r.before.offered && r.before.board !== '#1a1b26'
    && r.on.dark && r.on.board === '#1a1b26' && r.on.accent === '#bb9af7' && r.on.panel === '#bb9af7'
    && !r.live.dark && r.live.board === '#fdf8f0' && r.live.accent === '#2e7d32'
    && r.off.board !== '#fdf8f0' && r.off.accent !== '#2e7d32' && !r.errors.length && !r.errors1.length;
  console.log(ok ? 'THEME OK' : 'THEME FAILED'); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
