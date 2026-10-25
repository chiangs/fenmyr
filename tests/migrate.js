// Coming from Mochiboard for Linux: its boards and settings folders move into Myra the first time Myra opens, Myra's own
// data is never overwritten, and settings the page kept (mochiboard:… in its storage) carry over.
//   xvfb-run -a node tests/migrate.js
const { _electron: electron } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');

(async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mb-migrate-')), share = path.join(home, '.local/share'), conf = path.join(home, '.config');
  // what Mochiboard for Linux left behind: a board, a folder list, and its settings folder
  const old = path.join(share, 'mochiboard');
  fs.mkdirSync(path.join(old, 'boards'), { recursive: true });
  fs.writeFileSync(path.join(old, 'boards', 'old1.json'), JSON.stringify({ id: 'old1', name: 'From Mochiboard', color: 'mint', cards: [{ id: 'n1', type: 'note', x: 0, y: 0, w: 220, h: 140, text: 'still here', color: 'butter' }], links: [], tray: [] }));
  fs.writeFileSync(path.join(old, 'folders.json'), '[{"id":"f1","name":"Kept folder"}]');
  fs.mkdirSync(path.join(conf, 'Mochiboard'), { recursive: true }); fs.writeFileSync(path.join(conf, 'Mochiboard', 'marker'), 'old settings');

  const env = { ...process.env, HOME: home, XDG_DATA_HOME: share, XDG_CONFIG_HOME: conf, XDG_STATE_HOME: path.join(home, '.local/state') };
  const r = {};
  let app = await electron.launch({ args: [path.join(__dirname, '..'), '--no-sandbox'], env });
  let page = await app.firstWindow(); const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
  await page.waitForFunction(() => window.MB); await page.waitForTimeout(800);
  r.list = await page.evaluate(async () => (await MB.list()).map(b => b.name));
  r.folders = await page.evaluate(async () => (await MB.folders()).map(f => f.name));
  r.board = await page.evaluate(async () => (await MB.load('old1')).cards[0].text);
  r.oldDataGone = !fs.existsSync(old); r.newData = fs.existsSync(path.join(share, 'myra', 'boards', 'old1.json'));
  r.settingsMoved = fs.existsSync(path.join(conf, 'Myra', 'marker')) && !fs.existsSync(path.join(conf, 'Mochiboard'));
  // settings the page kept under mochiboard:… come along (as if this were the first Myra start)
  await page.evaluate(() => { localStorage.removeItem('myra:migrated'); localStorage.removeItem('myra:settings'); localStorage.setItem('mochiboard:settings', JSON.stringify({ name: 'Old name', mochi: 'blue' })); localStorage.setItem('mochiboard:newsSeen', '1.7.3'); });
  await page.reload(); await page.waitForFunction(() => window.MB); await page.waitForTimeout(800);
  r.storage = await page.evaluate(() => ({ settings: JSON.parse(localStorage.getItem('myra:settings') || '{}').name, newsSeen: localStorage.getItem('myra:newsSeen') }));
  await app.close();

  // a second start with new Mochiboard leftovers: Myra's own data stays as it is
  fs.mkdirSync(path.join(old, 'boards'), { recursive: true }); fs.writeFileSync(path.join(old, 'boards', 'stray.json'), '{"id":"stray","name":"Stray"}');
  app = await electron.launch({ args: [path.join(__dirname, '..'), '--no-sandbox'], env });
  page = await app.firstWindow(); await page.waitForFunction(() => window.MB); await page.waitForTimeout(500);
  r.second = await page.evaluate(async () => (await MB.list()).map(b => b.name));
  r.strayLeftAlone = fs.existsSync(path.join(old, 'boards', 'stray.json'));
  await app.close();
  r.errors = errors;
  console.log(JSON.stringify(r, null, 1));
  const ok = r.list.includes('From Mochiboard') && r.folders.includes('Kept folder') && r.board === 'still here' && r.oldDataGone && r.newData && r.settingsMoved
    && r.storage.settings === 'Old name' && r.storage.newsSeen !== '1.7.3' && !r.second.includes('Stray') && r.strayLeftAlone && !errors.length;
  fs.rmSync(home, { recursive: true, force: true });
  console.log(ok ? 'MIGRATE OK' : 'MIGRATE FAILED'); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
