// The app page runs no inline script and has no inline handlers, so a policy can ban them. What those lines did still
// happens: a file that loads first sets the 'native' class, the window buttons act, and the website version registers its
// service worker and has it keep boot.js.
import assert from 'node:assert';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { parseHTML } from 'linkedom';
import { launch, ROOT } from './support/launch.ts';

const web = path.join(ROOT, 'web');
const { document } = parseHTML(fs.readFileSync(path.join(web, 'index.html'), 'utf8'));
const inline = [...document.querySelectorAll('script')].filter(s => !s.getAttribute('src'));
assert.deepStrictEqual(
  inline.map(s => (s.textContent ?? '').trim().slice(0, 60)),
  [],
  'index.html has no inline script',
);
const handlers = [...document.querySelectorAll('*')].flatMap(el =>
  el
    .getAttributeNames()
    .filter(n => n.startsWith('on'))
    .map(n => `<${el.localName}> ${n}`),
);
assert.deepStrictEqual(handlers, [], 'index.html has no inline handler');
assert.strictEqual(document.querySelector('script')?.getAttribute('src'), 'boot.js', 'boot.js loads first');

// tiling compositors such as Hyprland switch the buttons off by default, so this asks for them
const l = await launch({ settings: { winButtons: true } });
const { app, page } = l;
try {
  assert.deepStrictEqual(
    await page.evaluate(() => ['native', 'linux'].map(c => document.documentElement.classList.contains(c))),
    [true, true],
    'boot.js sets the classes the desktop app needs',
  );

  const windowState = () =>
    app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      return { maximized: !!w?.isMaximized(), minimized: !!w?.isMinimized() };
    });
  // the host has dealt with a button once it answers the next thing the page asks, because the page's messages arrive in order
  const press = async (button: string) => {
    await page.click(`#winCtl ${button}`);
    await page.evaluate(() => Fenmyr.version());
  };
  await press('.wc-max');
  assert.strictEqual((await windowState()).maximized, true, 'Maximise maximises');
  await press('.wc-max');
  assert.strictEqual((await windowState()).maximized, false, 'and again restores');
  await press('.wc-min');
  assert.strictEqual((await windowState()).minimized, true, 'Minimise minimises');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.restore());
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.once('close', e => {
      e.preventDefault();
      Reflect.set(globalThis, 'closeAsked', true);
    });
  });
  await press('.wc-close');
  assert.strictEqual(await app.evaluate(() => Reflect.get(globalThis, 'closeAsked')), true, 'Close closes the window');

  assert.notStrictEqual(
    await page.evaluate(() =>
      navigator.serviceWorker.getRegistration().then(
        r => !!r,
        () => false,
      ),
    ),
    true,
    'the desktop app registers no service worker',
  );
  // the website version: the page, served from localhost, registers sw.js, which keeps boot.js for offline
  const types: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
  };
  const server = http.createServer((req, res) => {
    const asked = path.join(web, new URL(req.url ?? '/', 'http://localhost').pathname);
    const file = fs.existsSync(asked) && fs.statSync(asked).isDirectory() ? path.join(asked, 'index.html') : asked;
    if (!file.startsWith(web + path.sep) || !fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise<void>(done => server.listen(0, 'localhost', done));
  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object', 'the server is listening');
    const opened = app.waitForEvent('window');
    await app.evaluate(({ BrowserWindow }, url) => {
      new BrowserWindow({ show: false }).loadURL(url);
    }, `http://localhost:${address.port}/index.html`);
    const site = await opened;
    // ready waits for an active worker, and never comes if the page registered none, so the wait has a limit
    await site.evaluate(() => {
      navigator.serviceWorker.ready.then(() => Reflect.set(window, 'workerReady', true));
    });
    await site.waitForFunction(() => Reflect.get(window, 'workerReady') === true, null, { timeout: 20000 });
    assert.ok(
      await site.evaluate(async () => !!(await caches.match('boot.js'))),
      'the worker keeps boot.js with the rest of the files',
    );
  } finally {
    server.close();
  }

  console.log('PAGE SCRIPTS OK');
} finally {
  await l.close();
}
