// What Settings, General says about where boards are kept: boards stay on this computer, asking Myra sends the board to
// Claude, and a project linked to a repo holds its prototypes' code in that repo, so only then does the line mention it.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { boardsSaved } from '../src/web/settings/boardsSaved.ts';
import { launch, ROOT } from './support/launch.ts';
import { freshRepo, openPrototype } from './support/prototype.ts';

const mentionsRepo = (s: string) => /repo/i.test(s);

// the sentence itself, with and without a linked project
for (const linked of [0, 1, 3]) {
  const s = (boards: number) => boardsSaved(boards, linked);
  assert.ok(s(0).startsWith('0 boards, kept on this computer.'), `no boards, ${linked} linked: ${s(0)}`);
  assert.ok(s(1).startsWith('1 board, kept on this computer.'), `one board is singular, ${linked} linked: ${s(1)}`);
  assert.ok(s(3).startsWith('3 boards, kept on this computer.'), `many boards are plural, ${linked} linked: ${s(3)}`);
  for (const n of [0, 1, 3]) {
    assert.ok(
      /Myra/.test(s(n)) && /Claude/.test(s(n)),
      `it says asking Myra reaches Claude (${n}, ${linked}): ${s(n)}`,
    );
    assert.ok(
      !/never leave/i.test(s(n)),
      `it no longer says boards never leave the computer (${n}, ${linked}): ${s(n)}`,
    );
    assert.strictEqual(
      mentionsRepo(s(n)),
      linked > 0,
      `only a linked project brings in the repo (${n}, ${linked}): ${s(n)}`,
    );
  }
}
assert.strictEqual(boardsSaved(2, 1), boardsSaved(2, 4), 'one linked project or four, the repo is said once');

// the words in the page before the gear is pressed are the no-repo sentence for one board, so they can't drift from it
const html = fs.readFileSync(path.join(ROOT, 'web/index.html'), 'utf8');
assert.strictEqual(
  html.match(/<small id="boardCount">([^<]*)<\/small>/)?.[1],
  boardsSaved(1, 0),
  'the default text in index.html is the sentence for one board and no repo',
);

const note = { id: 'n', type: 'note', x: 0, y: 0, w: 220, h: 120, r: 0, color: 'butter', text: 'A note' },
  board = { id: 'b', name: 'B', cards: [note], links: [], tray: [], view: { x: 300, y: 200, z: 1 } };

// the line the panel shows on General after the gear is pressed
const shown = async (page: Page) => {
  await page.click('#gearBtn');
  await page.click('#setTabs [data-tab="general"]');
  assert.ok(await page.locator('#boardCount').isVisible(), 'the line is on the General tab');
  return page.evaluate(() => document.getElementById('boardCount')?.textContent ?? '');
};

// no project is linked to a repo
const plain = await launch({ boards: [board], open: 'b' });
try {
  const line = await shown(plain.page);
  assert.strictEqual(line, boardsSaved(1, 0), `with no linked project, Settings says: ${line}`);
  assert.ok(!mentionsRepo(line), `and does not mention a repo: ${line}`);
} finally {
  await plain.close();
}

// a project linked to a repo, with a prototype in it
const { work, repo } = freshRepo('fenmyr-boards-saved-');
const linked = await launch({ boards: [board], open: 'b' });
try {
  await openPrototype(linked.page, repo);
  const line = await shown(linked.page);
  assert.strictEqual(line, boardsSaved(2, 1), `with a project linked to a repo, Settings says: ${line}`);
  assert.ok(mentionsRepo(line), `and mentions the repo: ${line}`);
  assert.deepStrictEqual(linked.errors, [], 'no page errors');
} finally {
  await linked.close();
  fs.rmSync(work, { recursive: true, force: true });
}
console.log('boardsSaved: ok');
