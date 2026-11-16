// How long a preview check waits, and for what. It starts once the frame's own scripts have run, so an image that never
// loads neither holds the build waiting behind it nor counts as an error, while a frame whose scripts never run ends at
// the 15 s cap as an error. A render that takes the frame meanwhile is checked in its place, so the check doesn't wait
// out the cap on the frame it lost. A check cut short by a capture's commit is done once Back to latest shows the files.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { ChatMsg } from '../src/shared/chat.ts';
import { replyBoard } from './fixtures/boards.ts';
import { buildStandIn } from './support/buildStandIn.ts';
import { launch, settle } from './support/launch.ts';
import { freshRepo } from './support/prototype.ts';

const { work, repo } = freshRepo('fenmyr-build-check-wait-');
const git = (...args: string[]) =>
  execFileSync('git', ['-C', repo, '-c', 'user.name=T', '-c', 'user.email=t@e.st', ...args])
    .toString()
    .trim();
fs.mkdirSync(path.join(repo, 'prototypes'));
fs.writeFileSync(path.join(repo, 'prototypes', 'design.md'), 'x\n');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-build-check-wait-data-'));
const l = await launch({ data, boards: [replyBoard('one', 'One')], open: 'one', claude: true });
const standIn = buildStandIn(l);
const { page } = l;

// a server that takes a connection and never answers, so what the frame asks of it never arrives
const sockets: net.Socket[] = [];
const server = net.createServer(s => sockets.push(s));
await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
const address = server.address();
const hang = `https://127.0.0.1:${address && typeof address === 'object' ? address.port : 0}`;

const lastLine = () =>
  page.evaluate(() => [...document.querySelectorAll('#mcList .mc-msg.bare .m-summary li')].at(-1)?.textContent ?? '');
const texts = () =>
  page.evaluate(() => [...document.querySelectorAll('#mcList .mc-msg')].map(m => m.firstChild?.textContent ?? ''));
const until = async (check: () => Promise<boolean> | boolean, what: string, ms = 30000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await page.waitForTimeout(50);
  }
  assert.fail(`${what}: ${await lastLine()} ${JSON.stringify(await texts())}`);
};
type Stored = Extract<NonNullable<ChatMsg['acts']>[number], { kind: 'build' }>;
const checkOf = (request: string) => {
  const r = (JSON.parse(fs.readFileSync(path.join(data, 'fenmyr', 'boards', 'pb.json'), 'utf8')).chat ?? [])
    .flatMap((m: ChatMsg) => m.acts ?? [])
    .find((a: Stored) => a.kind === 'build' && a.request === request);
  return r?.end?.kind === 'built' ? r.end.check : undefined;
};
const ask = (request: string) =>
  page.evaluate(r => window.__fenmyr.applyMyra({ say: 'Writing it now.', build: { request: r } }, r), request);
const landed = (request: string) =>
  until(async () => (await texts()).includes(`Done: ${request}`), `the build “${request}” lands`);
const index = (head: string, body = '') =>
  `<!doctype html>\n<html lang="en"><head><meta charset="utf-8" /><title>P</title>${head}</head>\n<body>${body}<div id="root"></div><script type="module" src="./src/main.tsx"></script></body></html>\n`;
const app = (words: string) => `export function App() { return <h1>${words}</h1>; }\n`;

// A build of `files` lands with another waiting behind it. Gives the ms from its landing to its check being kept, and
// to the build behind it starting, with `meanwhile` run while the check waits.
async function queuedBehind(request: string, files: Record<string, string>, meanwhile = async () => {}) {
  standIn.next({ files, hold: true, reply: `Done: ${request}` });
  await ask(request);
  await until(() => standIn.wrote() === Object.keys(files).length, `the build “${request}” writes its files`);
  await ask(`Behind ${request}`);
  await until(async () => (await lastLine()) === `Behind ${request}`, 'another waits behind it');
  standIn.next({ files: { 'src/Behind.tsx': 'export const behind = 1;\n' }, reply: `Done: Behind ${request}` });
  const ran = standIn.builds().length,
    asked = sockets.length;
  standIn.release();
  await landed(request);
  const at = Date.now();
  if (files['index.html']?.includes(hang))
    await until(() => sockets.length > asked, 'the frame asks for what never comes', 10000);
  await meanwhile();
  let kept = -1,
    started = -1;
  while (Date.now() - at < 40000 && (kept < 0 || started < 0)) {
    if (kept < 0 && checkOf(request)) kept = Date.now() - at;
    if (started < 0 && standIn.builds().length > ran) started = Date.now() - at;
    await page.waitForTimeout(50);
  }
  await landed(`Behind ${request}`);
  return { kept, started };
}

try {
  const proto = await page.evaluate(async repo => {
    await window.Fenmyr.saveFolders({
      projects: [{ id: 'p1', name: 'Acme', open: true, repo: { path: repo } }],
      folders: [{ id: 'pf', name: 'Prototypes', project: 'p1', kind: 'prototyping', open: true }],
      order: {},
    });
    return window.Fenmyr.protoCreate({ root: repo, name: 'Checkout', stack: 'react' });
  }, repo);
  git('add', '-A');
  git('commit', '-qm', 'start');
  const capture = { commit: git('rev-parse', 'HEAD'), device: 'phone', width: 390, at: 1 };
  await page.evaluate(
    async ({ proto, capture }) => {
      const card = { id: 'cap', type: 'image' as const, x: 40, y: 40, w: 160, h: 120, src: '', capture };
      await window.Fenmyr.save({
        id: 'pb',
        name: 'Checkout',
        folder: 'pf',
        kind: 'prototype',
        proto,
        cards: [card],
        links: [],
        tray: [],
      });
      await window.__fenmyr.refreshBoards();
      await window.__fenmyr.openBoard('pb');
    },
    { proto, capture },
  );
  await settle(page, 600);

  standIn.next({ files: { 'src/App.tsx': app('Captured') }, reply: 'Done: Captured.' });
  await ask('Captured.');
  await landed('Captured.');
  await until(async () => (await lastLine()) === 'Checking the preview', 'a build lands and is being checked');
  await page.locator('.card[data-id="cap"]').evaluate(el => {
    const r = el.getBoundingClientRect(),
      at = { bubbles: true, clientX: r.x + 20, clientY: r.y + 20, pointerId: 1 };
    el.dispatchEvent(new PointerEvent('pointerdown', at));
    el.dispatchEvent(new PointerEvent('pointerup', at));
  });
  await until(
    async () => (await lastLine()) === 'Preview not checked yet',
    'a capture shown during the check stops it',
  );
  await page.click('[data-pv="latest"]');
  await until(async () => (await lastLine()) === 'Preview runs · no errors', 'Back to latest checks the build');

  const slow = await queuedBehind('Slow.', {
    'index.html': index('', `<img src="${hang}/never.png" alt="">`),
    'src/App.tsx': app('Slow'),
  });
  assert.deepStrictEqual(
    checkOf('Slow.'),
    { kind: 'ran', count: 0, errors: [] },
    'an image that never loads is no error',
  );
  assert(slow.kept > 0 && slow.kept < 9000, `the check doesn't wait for it (${slow.kept} ms)`);
  assert(slow.started > 0 && slow.started < 10000, `nor does the build behind it (${slow.started} ms)`);

  const stuck = index(`<link rel="stylesheet" href="${hang}/never.css">`);
  const taken = await queuedBehind('Taken.', { 'index.html': stuck, 'src/App.tsx': app('Taken') }, async () => {
    await page.waitForTimeout(1000);
    fs.writeFileSync(path.join(repo, proto.dir, 'index.html'), index(''));
    await page.click('#pr-preview [data-pv="refresh"]');
  });
  assert.deepStrictEqual(
    checkOf('Taken.'),
    { kind: 'ran', count: 0, errors: [] },
    'a render that takes the frame is checked',
  );
  assert(
    taken.kept > 0 && taken.kept < 9000,
    `in place of the one it took, without waiting out the cap (${taken.kept} ms)`,
  );
  assert(taken.started > 0 && taken.started < 10000, `and the build behind it starts then (${taken.started} ms)`);

  const never = await queuedBehind('Never.', { 'index.html': stuck, 'src/App.tsx': app('Never') });
  assert.deepStrictEqual(
    checkOf('Never.'),
    { kind: 'ran', count: 1, errors: ['The preview didn’t finish loading.'] },
    'a frame whose scripts never run is an error',
  );
  assert(never.kept >= 14000, `once the cap is out (${never.kept} ms)`);
  assert.deepStrictEqual(l.errors, [], 'no errors');
  console.log('BUILD CHECK WAIT OK');
} finally {
  for (const s of sockets) s.destroy();
  server.close();
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
  fs.rmSync(data, { recursive: true, force: true });
}
