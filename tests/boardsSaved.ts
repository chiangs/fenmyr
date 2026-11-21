// What Settings, General says about the boards: a bold line with the count and either "Locally saved" or, once a project
// is linked to a remote repo, "Local files linked to a remote repo"; a blank line; a fixed note about what is sent along;
// and the Show folder button level with the top of the text.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import { boardsSaved } from '../src/web/settings/boardsSaved.ts';
import { launch, ROOT } from './support/launch.ts';
import { freshRepo, openPrototype } from './support/prototype.ts';

const LOCAL = 'Locally saved';
const LINKED = 'Local files linked to a remote repo';
const NOTE =
  'Note: Using Myra when powered by Claude or non locally run AI or when linking prototyping boards to a remote repo requires information about your boards, projects, folders to be sent along.';

// the line itself, with and without a linked project
for (const linked of [0, 1, 3]) {
  const status = linked > 0 ? LINKED : LOCAL;
  assert.strictEqual(boardsSaved(0, linked), `0 boards, ${status}`, `no boards, ${linked} linked`);
  assert.strictEqual(boardsSaved(1, linked), `1 board, ${status}`, `one board is singular, ${linked} linked`);
  assert.strictEqual(boardsSaved(3, linked), `3 boards, ${status}`, `many boards are plural, ${linked} linked`);
}
assert.strictEqual(boardsSaved(2, 1), boardsSaved(2, 4), 'one linked project or four, the line is the same');

// the words in the page before the gear is pressed are the line for one board and no repo, so they can't drift from it
const html = fs.readFileSync(path.join(ROOT, 'web/index.html'), 'utf8');
assert.strictEqual(
  html.match(/<b id="boardCount">([^<]*)<\/b>/)?.[1],
  boardsSaved(1, 0),
  'the default text in index.html is the line for one board and no repo',
);

const note = { id: 'n', type: 'note', x: 0, y: 0, w: 220, h: 120, r: 0, color: 'butter', text: 'A note' },
  board = { id: 'b', name: 'B', cards: [note], links: [], tray: [], view: { x: 300, y: 200, z: 1 } };

// what the panel shows on General after the gear is pressed, and where it is
const shown = async (page: Page) => {
  await page.click('#gearBtn');
  await page.click('#setTabs [data-tab="general"]');
  await page.locator('#boardCount').waitFor({ state: 'visible' });
  // the panel eases in by a scale, which would shrink the gaps read below
  await page.waitForFunction(() => {
    const panel = document.querySelector('#settings.on .set-panel');
    return !!panel && panel.getAnimations().length === 0;
  });
  return page.evaluate(() => {
    const line = document.getElementById('boardCount');
    const small = line?.parentElement?.querySelector('small');
    const button = document.getElementById('revealBoards');
    if (!line || !small || !button) throw new Error('the boards row is missing a part');
    const l = line.getBoundingClientRect(),
      s = small.getBoundingClientRect(),
      b = button.getBoundingClientRect();
    return {
      line: line.textContent ?? '',
      note: small.textContent ?? '',
      weight: Number(getComputedStyle(line).fontWeight),
      gap: s.top - l.bottom,
      noteLine: parseFloat(getComputedStyle(small).lineHeight),
      buttonDrop: b.top - l.top,
    };
  });
};

const check = (got: Awaited<ReturnType<typeof shown>>, line: string, why: string) => {
  assert.strictEqual(got.line, line, `${why}: the bold line is ${got.line}`);
  assert.ok(got.weight >= 600, `${why}: the line is bold, weight ${got.weight}`);
  assert.strictEqual(got.note, NOTE, `${why}: the note under it is ${got.note}`);
  assert.ok(
    got.gap >= got.noteLine - 0.5,
    `${why}: a blank line sits between the bold line and the note: gap ${got.gap}px, a line is ${got.noteLine}px`,
  );
  assert.ok(
    Math.abs(got.buttonDrop) <= 1,
    `${why}: Show folder is top-aligned with the text, ${got.buttonDrop}px lower`,
  );
};

// no project is linked to a repo
const plain = await launch({ boards: [board], open: 'b' });
try {
  check(await shown(plain.page), boardsSaved(1, 0), 'no linked project');
} finally {
  await plain.close();
}

// a project linked to a repo, with a prototype in it
const { work, repo } = freshRepo('fenmyr-boards-saved-');
const linked = await launch({ boards: [board], open: 'b' });
try {
  await openPrototype(linked.page, repo);
  check(await shown(linked.page), boardsSaved(2, 1), 'a project linked to a repo');
  assert.deepStrictEqual(linked.errors, [], 'no page errors');
} finally {
  await linked.close();
  fs.rmSync(work, { recursive: true, force: true });
}
console.log('boardsSaved: ok');
