// A build's block for someone who changes how Fenmyr moves, sounds or looks. With "How lively she is" set to Calm, the
// block's bar stands still while it builds. When the build ends on its own board, a screen reader hears it from the
// status line's live region, in the words the note uses on another board, while the line still reads as it did. And
// following Caelestia colours her lines, but leaves the block its own tint rather than painting it like a bubble.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { replyBoard } from './fixtures/boards.ts';
import { buildStandIn } from './support/buildStandIn.ts';
import { launch } from './support/launch.ts';
import { freshRepo } from './support/prototype.ts';
import { still } from './support/settled.ts';

const { work, repo } = freshRepo('fenmyr-build-access-');
fs.mkdirSync(path.join(repo, 'prototypes'));
fs.writeFileSync(path.join(repo, 'prototypes', 'design.md'), 'x\n');
const l = await launch({
  boards: [replyBoard('one', 'One')],
  open: 'one',
  claude: true,
  // motion on, since the tests turn it off and that alone stops the bar
  settings: { myraCalm: 'calm', motion: true },
});
const { page } = l;
const standIn = buildStandIn(l);

const until = (check: () => unknown, what: string) =>
  page
    .waitForFunction(check, undefined, { timeout: 20000 })
    .catch(e => assert.fail(`${what}: ${e instanceof Error ? e.message : e}`));
// what the status line shows, and what its live region holds besides
const status = () =>
  page.evaluate(() => {
    const say = document.getElementById('mcStatusSay'),
      heard = say?.querySelector('.mc-heard');
    return {
      shows: say?.firstChild?.nodeType === Node.TEXT_NODE ? say.firstChild.textContent : '',
      heard: heard?.textContent ?? '',
      clipped: heard ? getComputedStyle(heard).clipPath : '',
    };
  });

try {
  await page.evaluate(async repo => {
    await window.Fenmyr.saveFolders({
      projects: [{ id: 'p1', name: 'Acme', open: true, repo: { path: repo } }],
      folders: [{ id: 'pf', name: 'Prototypes', project: 'p1', kind: 'prototyping', open: true }],
      order: {},
    });
    const proto = await window.Fenmyr.protoCreate({ root: repo, name: 'Checkout', stack: 'react' });
    await window.Fenmyr.save({
      id: 'pb',
      name: 'Checkout',
      folder: 'pf',
      kind: 'prototype',
      proto,
      cards: [],
      links: [],
      tray: [],
    });
    await window.__fenmyr.refreshBoards();
    await window.__fenmyr.openBoard('pb');
  }, repo);
  await still(page);

  standIn.next({ files: { 'src/a.tsx': 'a\n', 'src/b.tsx': 'b\n' }, pause: true, reply: 'Two files.' });
  await page.evaluate(() => window.__fenmyr.applyMyra({ say: 'Writing it now.', build: { request: 'Two.' } }, 'Two.'));
  await until(() => !!document.querySelector('#mcList .m-bar'), 'the block shows its bar');
  const moving = await page.evaluate(() => {
    const bar = document.querySelector('#mcList .m-bar');
    return bar ? getComputedStyle(bar, '::after').animationName : '';
  });
  assert.equal(moving, 'none', 'the bar stands still while she is calm');

  standIn.release();
  await until(
    () => [...document.querySelectorAll('#mcList .mc-msg')].some(m => m.firstChild?.textContent === 'Two files.'),
    'the build lands',
  );
  // the block is drawn inside changeBoard, but the line is said once the board is written, which can come later
  await until(
    () => document.querySelector('#mcStatusSay .mc-heard')?.textContent === 'Checkout is built',
    'a screen reader hears that the build ended',
  );
  const heard = await status();
  assert.equal(heard.shows, 'Ready', 'and the status line still reads as it did');
  assert.equal(heard.clipped, 'inset(50%)', 'with the words for the screen reader out of sight');

  const backgrounds = async () => {
    await still(page);
    return page.evaluate(() => {
      const bg = (el: Element | null | undefined) => (el ? getComputedStyle(el).backgroundColor : '');
      const hers = [...document.querySelectorAll('#mcList .mc-msg.myra')].find(
        m => m.firstChild?.textContent === 'Two files.',
      );
      return { block: bg(document.querySelector('#mcList .mc-msg.bare')), line: bg(hers) };
    });
  };
  const plain = await backgrounds();
  await page.evaluate(() => {
    // the scheme's colours, as the app sets them when it follows Caelestia
    document.documentElement.style.setProperty('--butter-deep', '#c9a227');
    document.body.classList.add('following-caelestia');
  });
  const following = await backgrounds();
  assert.notEqual(following.line, plain.line, 'following Caelestia colours her line');
  assert.equal(following.block, plain.block, 'but the block keeps its own tint');
  assert.deepStrictEqual(l.errors, [], 'no errors');
  console.log('BUILD ACCESS OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
