// A form in a prototype's preview works as it would in a browser: its submit handler runs, by the button or by Enter. What
// it can't do is go anywhere. A form aimed at another site, one the page leaves alone and one the page submits from code
// all leave the preview as it was, and nothing reaches the other site.
import assert from 'node:assert';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { launch } from './support/launch.ts';
import { freshRepo } from './support/prototype.ts';

const { work, repo } = freshRepo('fenmyr-preview-forms-');
// the other site: a form posted there would show up in hits
const hits: string[] = [];
const other = http.createServer((req, res) => {
  hits.push(`${req.method} ${req.url}`);
  res.end('elsewhere');
});
await new Promise<void>(done => other.listen(0, '127.0.0.1', done));
const port = (() => {
  const a = other.address();
  return a && typeof a === 'object' ? a.port : 0;
})();

// each form counts its submit events in the page; only #send stops the browser's own submission
const pageHtml = `<!doctype html>
<html><head><meta charset="utf-8"><title>Forms</title></head><body>
<p id="warm">Click here</p>
<p id="clicks">0</p>
<form id="send"><input id="name" value="Ann"><button id="go">Send</button></form>
<p id="said">nothing sent</p>
<form id="away" action="http://127.0.0.1:${port}/claim" method="post"><input id="away-in" name="n" value="1"><button id="leave">Leave</button></form>
<p id="left">0</p>
<form id="plain"><input id="plain-in" name="q" value="x"><button id="again">Search</button></form>
<p id="searched">0</p>
<button id="code" type="button">Submit from code</button>
<p id="refused">nothing refused</p>
<dialog id="d" open><form method="dialog"><button id="close">Close</button></form></dialog>
<script>
window.alive = 'the same page';
const text = (id, to) => { document.getElementById(id).textContent = to; };
let clicked = 0, sent = 0, left = 0, searched = 0;
document.addEventListener('click', () => text('clicks', String(++clicked)), true);
document.getElementById('send').addEventListener('submit', e => {
  e.preventDefault();
  text('said', 'sent ' + ++sent + ' for ' + document.getElementById('name').value);
});
document.getElementById('away').addEventListener('submit', () => text('left', String(++left)));
document.getElementById('plain').addEventListener('submit', () => text('searched', String(++searched)));
document.getElementById('code').addEventListener('click', () => document.getElementById('plain').submit());
document.addEventListener('securitypolicyviolation', e => text('refused', e.violatedDirective));
</script></body></html>`;

const l = await launch();
const { page } = l;

try {
  const dir = await page.evaluate(async repo => {
    await window.Fenmyr.saveFolders({
      projects: [{ id: 'p1', name: 'Acme', open: true, repo: { path: repo } }],
      folders: [{ id: 'pf', name: 'Prototypes', project: 'p1', kind: 'prototyping', open: true }],
      order: {},
    });
    const proto = await window.Fenmyr.protoCreate({ root: repo, name: 'Claims', stack: 'html' });
    await window.Fenmyr.save({
      id: 'fb',
      name: 'Claims',
      folder: 'pf',
      kind: 'prototype',
      proto,
      cards: [],
      links: [],
      tray: [],
    });
    return proto.dir;
  }, repo);
  fs.writeFileSync(path.join(repo, dir, 'index.html'), pageHtml);
  await page.evaluate(async () => {
    await window.__fenmyr.refreshBoards();
    await window.__fenmyr.openBoard('fb');
  });
  const frame = page.frameLocator('#pr-preview iframe');
  const address = () => frame.locator('html').evaluate(() => document.URL);
  // what #id says, or where the preview is if it has no such thing, which is a preview that has gone somewhere
  const said = (id: string) =>
    frame
      .locator(`#${id}`)
      .textContent({ timeout: 2000 })
      .catch(async () => `nothing, the preview is at ${await address()}`);
  const shows = async (id: string, words: string, what: string) => {
    try {
      await frame.locator(`#${id}`, { hasText: new RegExp(`^${words}$`) }).waitFor({ timeout: 15000 });
    } catch {
      assert.fail(`${what}: #${id} says ${await said(id)}`);
    }
  };
  await frame.locator('#said').waitFor();
  // A click reaches a frame only once it has painted, which two frames of its own show
  const painted = () =>
    frame.locator('html').evaluate(
      () =>
        new Promise<void>(done => {
          requestAnimationFrame(() => requestAnimationFrame(() => done()));
        }),
    );
  const sawClick = () =>
    frame
      .locator('#clicks', { hasText: /^[1-9]/ })
      .waitFor({ timeout: 500 })
      .then(
        () => true,
        () => false,
      );
  // The preview is scaled to fit its pane, which a click Playwright aims inside a frame doesn't allow for. This clicks
  // where the element is on the page.
  const tap = async (selector: string) => {
    await painted();
    const outer = await page.locator('#pr-preview iframe').evaluate(f => {
      const r = f.getBoundingClientRect();
      return { x: r.x, y: r.y, scale: r.width / f.clientWidth };
    });
    const inner = await frame.locator(selector).evaluate(el => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.click(outer.x + inner.x * outer.scale, outer.y + inner.y * outer.scale);
  };

  // The browser sends a click into a frame only once it knows where the frame is, and nothing in either page says when
  // that is. So the first click is tried until the page has seen one.
  for (let tries = 0; ; tries++) {
    await tap('#warm');
    if (await sawClick()) break;
    if (tries === 40) assert.fail('a click never reached the preview');
  }

  const first = await address();
  assert.match(first, /^fenmyrpreview:\/\/[0-9a-f-]{36}\/$/, 'the preview loads from fenmyrpreview:');
  // every load of the frame after this one is the page going somewhere
  await page.evaluate(() => {
    Reflect.set(window, 'framesLoaded', 0);
    document.querySelector('#pr-preview iframe')?.addEventListener('load', () => {
      Reflect.set(window, 'framesLoaded', Number(Reflect.get(window, 'framesLoaded')) + 1);
    });
  });
  const stays = async (what: string) => {
    // a frame that is on its way elsewhere has no frames to wait for, and the address says where it went
    await painted().catch(() => {});
    const now = await address().catch(() => 'a page that was being replaced');
    assert.strictEqual(now, first, `${what}: the preview is at the same address`);
    assert.strictEqual(
      await frame.locator('html').evaluate(() => Reflect.get(window, 'alive')),
      'the same page',
      `${what}: and the same page`,
    );
  };

  await tap('#go');
  await shows('said', 'sent 1 for Ann', 'the button submits the form, and its handler runs');
  await frame.locator('#name').press('Enter');
  await shows('said', 'sent 2 for Ann', 'Enter in a field submits it too');
  await stays('a form the page handles');

  await tap('#leave');
  await shows('left', '1', 'a form aimed at another site still runs its handler');
  await stays('a form aimed at another site');
  await frame.locator('#away-in').press('Enter');
  await shows('left', '2', 'by Enter as well');
  await stays('a form aimed at another site');

  await tap('#again');
  await shows('searched', '1', 'a form the page leaves alone runs its handler');
  await frame.locator('#plain-in').press('Enter');
  await shows('searched', '2', 'by Enter as well');
  await stays('a form the page leaves alone');

  await tap('#code');
  await shows('refused', 'form-action', 'a form submitted from code is refused by the preview’s policy');
  await stays('a form submitted from code');

  await tap('#close');
  await frame
    .locator('#d:not([open])')
    .waitFor({ state: 'attached', timeout: 15000 })
    .catch(() => assert.fail('a form with method="dialog" still closes its dialog'));

  await tap('#go');
  await shows('said', 'sent 3 for Ann', 'the page still works after all of them');
  assert.strictEqual(
    await page.evaluate(() => Reflect.get(window, 'framesLoaded')),
    0,
    'the frame loaded nothing else, not even an error page',
  );
  assert.deepStrictEqual(hits, [], 'nothing reached the other site');
  console.log('PREVIEW FORMS OK');
} finally {
  await l.close();
  other.close();
  fs.rmSync(work, { recursive: true, force: true });
}
