// A prototype board's own rules and design, as the person meets them. A new prototype starts with the two doc cards below
// Myra's notes, empty, clear of every other card, cards brought in included. Opening one shows a band between its title
// and its words: a hint that follows the Ignore switch, the switch (saved on the card, and the card's pill says "Repo
// ignored" while it is on) and Show in folder, which reveals the repo's file. A project with no repo says so and has
// neither. A doc with no role has no band.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import type { Card } from '../src/shared/model.ts';
import { overlaps, roleDocs } from './support/guides.ts';
import { launch } from './support/launch.ts';
import { freshRepo } from './support/prototype.ts';
import { still } from './support/settled.ts';
import { tipKit } from './support/tipSeen.ts';

const { work, repo } = freshRepo('fenmyr-guides-');
const l = await launch({ claude: true });
const { page } = l;
const { seen } = tipKit(page);

const boardFile = (id: string): { cards: Record<string, unknown>[] } =>
  JSON.parse(fs.readFileSync(path.join(l.data, 'fenmyr', 'boards', `${id}.json`), 'utf8'));
const cardsOf = (): Promise<Card[]> => page.evaluate(() => window.__fenmyr.curBoard()?.cards ?? []);
// the board is written once Fenmyr says so, so a file is read only after this
const saved = () =>
  page.waitForFunction(() => document.getElementById('saved')?.textContent === 'saved', undefined, { polling: 50 });
// the selection bar's Open, so the card needn't be in view
const open = async (id: string) => {
  await page.evaluate(id => window.__fenmyr.selectOnly([id]), id);
  await page.locator('#selbar [data-sb="open"]').click();
  await page.waitForSelector('#docview.on');
  await still(page);
};
const close = async () => {
  await page.click('#dvBack');
  await page.waitForFunction(() => !document.getElementById('docview')?.classList.contains('on'));
};
type Band = {
  shown: boolean;
  hint: string;
  label: string;
  on: boolean | null;
  button: { text: string; tip: string; aria: string } | null;
  between: boolean;
};
const band = (): Promise<Band> =>
  page.evaluate(() => {
    const el = document.getElementById('dvGuide'),
      box = el?.querySelector<HTMLInputElement>('#dvIgnore'),
      btn = el?.querySelector<HTMLElement>('#dvReveal'),
      title = document.getElementById('dvTitle')?.getBoundingClientRect(),
      body = document.getElementById('dvBody')?.getBoundingClientRect(),
      at = el?.getBoundingClientRect();
    return {
      shown: !!el && !el.hidden && el.checkVisibility(),
      hint: el?.querySelector('.dv-guide-hint')?.textContent ?? '',
      label: el?.querySelector('.vg-sw span')?.textContent ?? '',
      on: box ? box.checked : null,
      button: btn
        ? { text: btn.textContent ?? '', tip: btn.dataset.tip ?? '', aria: btn.getAttribute('aria-label') ?? '' }
        : null,
      between: !!title && !!body && !!at && title.bottom <= at.top && at.bottom <= body.top,
    };
  });
const pillTag = (id: string) =>
  page.evaluate(id => document.querySelector(`#cards [data-id="${id}"] .pill .guide-tag`)?.textContent ?? null, id);

const ADDS = (what: string, file: string) =>
  `Only what’s different for this prototype. It adds to the repo’s ${what} in ${file}, and where the two differ, this wins.`;
const IGNORES = (what: string, file: string, verb: string) =>
  `Only this goes to the builder for this prototype. The repo’s ${what} in ${file} ${verb} ignored.`;
const NO_REPO = (what: string) => `This prototype’s project has no repo, so there are no repo ${what} to add to.`;

try {
  await page.evaluate(
    async ({ repo }) => {
      await window.Fenmyr.saveFolders({
        projects: [
          { id: 'p1', name: 'Acme', open: true, repo: { path: repo } },
          { id: 'p2', name: 'Personal', open: true },
        ],
        folders: [
          { id: 'pf', name: 'Prototypes', project: 'p1', kind: 'prototyping', open: true },
          { id: 'fa', name: 'Planning', project: 'p1', open: true },
          { id: 'pn', name: 'Loose prototypes', project: 'p2', kind: 'prototyping', open: true },
        ],
        order: {},
      });
      // a plain board with a screen, and a prototype in a project with no repo
      await window.Fenmyr.save({
        id: 'plain',
        name: 'Sketches',
        folder: 'fa',
        cards: [{ id: 'fr', type: 'frame', x: 0, y: 0, w: 393, h: 852, device: 'iPhone', radius: 44, name: 'Pay' }],
        links: [],
        tray: [],
      });
      const guide = (id: string, role: 'rules' | 'design', y: number): Card => ({
        id,
        type: 'doc',
        x: 0,
        y,
        w: 240,
        h: 52,
        text: `Our ${role}`,
        role,
      });
      await window.Fenmyr.save({
        id: 'loose',
        name: 'Loose',
        folder: 'pn',
        kind: 'prototype',
        proto: { dir: 'prototypes/loose', stack: 'react' },
        cards: [guide('lr', 'rules', 0), guide('ld', 'design', 100)],
        links: [],
        tray: [],
      });
      await window.__fenmyr.refreshBoards();
    },
    { repo },
  );
  // a new prototype starts with the two cards, below Myra's notes, empty
  await page.evaluate(() =>
    document.querySelector<HTMLElement>('#boards .node.folder.proto .node-head [data-a="add"]')?.click(),
  );
  await page.fill('#npName', 'Checkout');
  await page.click('#npOk');
  await page.waitForFunction(() => window.__fenmyr.curBoard()?.name === 'Checkout');
  const fresh = await cardsOf();
  const notes = fresh.filter(c => c.type === 'note'),
    guides = roleDocs(fresh);
  assert.deepStrictEqual(
    guides.map(c => [c.role, c.text, c.body ?? '', c.ignoreRepo ?? false]),
    [
      ['rules', 'This prototype’s rules', '', false],
      ['design', 'This prototype’s design', '', false],
    ],
    'a new prototype has a Rules and a Design doc, titled for it, with nothing written and the switch off',
  );
  assert.strictEqual(notes.length, 3, 'Myra’s three notes are still there');
  const lowest = Math.max(...notes.map(c => c.y + c.h));
  assert(
    guides.every(c => c.y >= lowest) && guides[0] && guides[1] && guides[0].y + guides[0].h <= guides[1].y,
    'the two sit below the notes, one under the other',
  );
  assert(
    guides.every(c => c.x === notes[0]?.x && c.w === notes[0]?.w),
    'in the notes’ column',
  );
  assert.deepStrictEqual(overlaps(fresh), [], 'and no card on the board overlaps another');
  const rules = guides[0]?.id ?? '',
    design = guides[1]?.id ?? '',
    checkout = await page.evaluate(() => window.__fenmyr.curBoard()?.id ?? '');

  // opening Rules: the band sits between its title and its words
  await open(rules);
  const adding = await band();
  assert.deepStrictEqual(
    adding,
    {
      shown: true,
      hint: ADDS('rules', 'prototypes/myra.md'),
      label: 'Ignore the repo rules',
      on: false,
      button: {
        text: 'Show in folder',
        tip: `Show ${repo}/prototypes/myra.md in its folder`,
        aria: `Show ${repo}/prototypes/myra.md in its folder`,
      },
      between: true,
    },
    'Rules shows what it is for, the switch off, and a button that names the repo’s file',
  );
  assert.strictEqual(await pillTag(rules), null, 'its pill has no tag while the repo’s rules are kept');
  // a run with every transition started late (--lag) sets the tooltip's delay itself
  const lag = Number(process.env.FENMYR_MOTION_DELAY ?? 0);
  await seen('Show in folder’s tooltip', '#dvReveal', {
    at: 'below',
    surface: 'chat',
    delay: lag ? `${lag / 1000}s` : '0.25s',
  });

  // the button reveals the repo's file
  // the stand-in answers for the file manager, and gives up after a while so a button that does nothing fails
  const revealed = l.app.evaluate(
    ({ shell }) =>
      new Promise<string>(done => {
        shell.showItemInFolder = done;
        setTimeout(() => done('nothing was revealed'), 10000);
      }),
  );
  await page.click('#dvReveal');
  assert.strictEqual(
    await revealed,
    `${repo}/prototypes/myra.md`,
    'Show in folder reveals prototypes/myra.md in the repo',
  );

  // the switch: on writes ignoreRepo to the card and the file, changes the hint, and tags the pill
  await page.click('#dvIgnore');
  await saved();
  assert.deepStrictEqual(
    [(await band()).hint, (await band()).on],
    [IGNORES('rules', 'prototypes/myra.md', 'are'), true],
    'turning the switch on says only this goes to the builder',
  );
  assert.strictEqual(
    boardFile(checkout).cards.find(c => c.id === rules)?.ignoreRepo,
    true,
    'and the card in the board file has ignoreRepo on',
  );
  assert.strictEqual(await pillTag(rules), 'Repo ignored', 'its pill says the repo is ignored');
  assert.strictEqual(await pillTag(design), null, 'while Design, with a switch of its own, says nothing');
  await page.click('#dvIgnore');
  await saved();
  assert.strictEqual(
    (await band()).hint,
    ADDS('rules', 'prototypes/myra.md'),
    'turning it off brings the first hint back',
  );
  assert(
    !('ignoreRepo' in (boardFile(checkout).cards.find(c => c.id === rules) ?? { ignoreRepo: 1 })),
    'and removes the field from the file instead of saving false',
  );
  assert.strictEqual(await pillTag(rules), null, 'and the tag');
  await page.click('#dvIgnore');
  await saved();
  await close();
  assert.strictEqual(await pillTag(rules), 'Repo ignored', 'the tag stays on the pill once the doc is closed');
  await open(rules);
  assert.deepStrictEqual(
    [(await band()).on, (await band()).hint],
    [true, IGNORES('rules', 'prototypes/myra.md', 'are')],
    'and the doc opens again with the switch on',
  );
  await close();

  // Design says the same about design.md, and keeps its own switch
  await open(design);
  assert.deepStrictEqual(
    [(await band()).hint, (await band()).label, (await band()).on, (await band()).button?.tip],
    [
      ADDS('design', 'prototypes/design.md'),
      'Ignore the repo design',
      false,
      `Show ${repo}/prototypes/design.md in its folder`,
    ],
    'Design names design.md, and its switch is off though Rules’ is on',
  );
  await page.click('#dvIgnore');
  await saved();
  assert.strictEqual((await band()).hint, IGNORES('design', 'prototypes/design.md', 'is'), 'and turned on it says so');
  await close();
  assert.deepStrictEqual(
    boardFile(checkout)
      .cards.filter(c => c.role)
      .map(c => [c.role, c.ignoreRepo]),
    [
      ['rules', true],
      ['design', true],
    ],
    'both are saved on, each its own',
  );

  // a doc with no role has no band, and the band comes back for one that has a role
  await page.evaluate(() => {
    const H = window.__fenmyr;
    H.board.cards.push({ id: 'plaindoc', type: 'doc', x: 0, y: 3000, w: 240, h: 52, text: 'Meeting notes' });
    H.renderAll();
  });
  await open('plaindoc');
  assert.strictEqual((await band()).shown, false, 'an ordinary doc has no band');
  await close();
  await open(rules);
  assert.strictEqual((await band()).shown, true, 'and Rules has it again');
  await close();

  // a project with no repo has nothing to add to, so no switch and no button
  await page.evaluate(() => window.__fenmyr.openBoard('loose'));
  await page.waitForFunction(() => window.__fenmyr.curBoard()?.id === 'loose');
  for (const [id, what] of [
    ['lr', 'rules'],
    ['ld', 'design'],
  ] as const) {
    await open(id);
    assert.deepStrictEqual(
      await band(),
      { shown: true, hint: NO_REPO(what), label: '', on: null, button: null, between: true },
      `a prototype with no repo says so about its ${what}, with no switch and no button`,
    );
    await close();
  }

  // a screen brought into a new prototype lands clear of Myra's notes and the two cards
  await page.evaluate(() => window.__fenmyr.openBoard('plain'));
  await page.evaluate(() => window.__fenmyr.selectOnly(['fr']));
  // the bar stands aside while the wireframe pieces are out, so its button is pressed from the page
  await page.waitForSelector('[data-sb="prototype"]', { state: 'attached' });
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-sb="prototype"]')?.click());
  await page.fill('#npName', 'From sketches');
  await page.click('#npOk');
  await page.waitForFunction(() => window.__fenmyr.curBoard()?.name === 'From sketches');
  const brought = await cardsOf();
  assert.strictEqual(roleDocs(brought).length, 2, 'a prototype made from a screen has the two cards too');
  assert(
    brought.some(c => c.type === 'frame'),
    'with the screen beside them',
  );
  assert.deepStrictEqual(overlaps(brought), [], 'and none overlaps another');
  assert.deepStrictEqual(l.errors, []);
  console.log('BOARD GUIDES OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
