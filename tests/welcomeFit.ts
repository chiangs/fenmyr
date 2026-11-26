// A new prototype opens with every card on its board in view: Myra's stamp, her three notes, the rules and design docs
// and any cards brought from another board, whole inside the board column and clear of the widgets, the tools, the mode
// card and the board's name, at the largest zoom that holds them. A column too narrow to hold them at a zoom that can
// be read folds the code column, which a new prototype has nothing in yet, to give the board its room.
import assert from 'node:assert';
import fs from 'node:fs';
import { launch } from './support/launch.ts';
import { freshRepo } from './support/prototype.ts';
import { still } from './support/settled.ts';

const { work, repo } = freshRepo('fenmyr-fit-');
const l = await launch({ claude: true });
const { page } = l;

// the smallest zoom that can be read: src/web/proto/welcome.ts
const READABLE = 0.5;

type Box = { left: number; top: number; right: number; bottom: number };
type Look = {
  stage: Box;
  side: Box;
  panels: Box[];
  z: number;
  codeFolded: boolean;
  cards: { type: string; box: Box }[];
};

const look = (): Promise<Look> =>
  page.evaluate(() => {
    const box = (e: Element | null) => {
      const r = e?.getBoundingClientRect();
      return { left: r?.left ?? 0, top: r?.top ?? 0, right: r?.right ?? 0, bottom: r?.bottom ?? 0 };
    };
    return {
      stage: box(document.getElementById('stage')),
      side: box(document.getElementById('side')),
      panels: [
        document.getElementById('tools'),
        document.getElementById('modeCard'),
        document.querySelector('#stage header.top'),
      ]
        .filter(e => e?.checkVisibility())
        .map(box),
      z: window.__fenmyr.view.z,
      codeFolded: !!document.querySelector('[data-p="code"].folded'),
      cards: [...document.querySelectorAll('#cards .card')].map(c => ({
        type: ['note', 'stamp', 'doc', 'frame'].find(t => c.classList.contains(t)) ?? '',
        box: box(c),
      })),
    };
  });

// the room each note has under its words, so a note neither cuts its words off nor leaves a gap
const room = (): Promise<number[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('#cards .card.note')].map(n => {
      const body = n.querySelector<HTMLElement>('.body'),
        text = n.querySelector<HTMLElement>('.text');
      if (!body || !text) return NaN;
      return (
        body.clientHeight - (text.offsetTop + text.offsetHeight) - parseFloat(getComputedStyle(body).paddingBottom)
      );
    }),
  );

const resize = async (width: number, height: number) => {
  await l.app.evaluate(({ BrowserWindow }, s) => BrowserWindow.getAllWindows()[0]?.setSize(s.width, s.height), {
    width,
    height,
  });
  await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [width, height]);
  await still(page);
};

// the dialog both ways of starting a prototype end at
const create = async (name: string) => {
  await page.fill('#npName', name);
  await page.click('#npOk');
  await page.waitForFunction(n => window.__fenmyr.curBoard()?.name === n, name);
  await still(page);
};
const newPrototype = async (name: string) => {
  await page.evaluate(() =>
    document.querySelector<HTMLElement>('#boards .node.folder.proto .node-head [data-a="add"]')?.click(),
  );
  await create(name);
};
// screens picked on the plain board, brought to a new prototype as Prototype this does
const prototypeFrom = async (name: string, frames: string[]) => {
  await page.evaluate(() => window.__fenmyr.openBoard('plain'));
  await page.waitForFunction(() => window.__fenmyr.curBoard()?.id === 'plain');
  await page.evaluate(ids => window.__fenmyr.selectOnly(ids), frames);
  // the bar stands aside while the wireframe pieces are out, so its button is pressed from the page
  await page.waitForSelector('[data-sb="prototype"]', { state: 'attached' });
  await page.evaluate(() => document.querySelector<HTMLElement>('[data-sb="prototype"]')?.click());
  await create(name);
};

const union = (boxes: Box[]): Box => ({
  left: Math.min(...boxes.map(b => b.left)),
  top: Math.min(...boxes.map(b => b.top)),
  right: Math.max(...boxes.map(b => b.right)),
  bottom: Math.max(...boxes.map(b => b.bottom)),
});

// Every card whole inside the column and right of the widgets, and the zoom the largest that fits: 100%, or the cards
// fill most of the free width or height.
function assertAllInView(v: Look, what: string, count: number) {
  assert.strictEqual(v.cards.length, count, `${what}: the board has ${count} cards`);
  for (const c of v.cards) {
    const { left, top, right, bottom } = c.box;
    assert(left >= v.side.right, `${what}: a ${c.type} starts right of the widgets (${left} against ${v.side.right})`);
    assert(right <= v.stage.right, `${what}: a ${c.type} ends inside the column (${right} against ${v.stage.right})`);
    assert(top >= v.stage.top, `${what}: a ${c.type} starts below the column's top (${top} against ${v.stage.top})`);
    assert(
      bottom <= v.stage.bottom,
      `${what}: a ${c.type} ends above the column's bottom (${bottom} against ${v.stage.bottom})`,
    );
    for (const p of v.panels)
      assert(
        right <= p.left || left >= p.right || bottom <= p.top || top >= p.bottom,
        `${what}: a ${c.type} is clear of the panel at ${JSON.stringify(p)}`,
      );
  }
  // the room between the panels that border the cards: a panel above them bounds it at the top, one beside them at
  // the right
  const all = union(v.cards.map(c => c.box)),
    beside = (p: Box) => p.left < all.right && p.right > all.left,
    level = (p: Box) => p.top < all.bottom && p.bottom > all.top,
    roomTop = Math.max(v.stage.top, ...v.panels.filter(p => beside(p) && p.bottom <= all.top).map(p => p.bottom)),
    roomRight = Math.min(v.stage.right, ...v.panels.filter(p => level(p) && p.left >= all.right).map(p => p.left)),
    wide = (all.right - all.left) / (roomRight - v.side.right),
    tall = (all.bottom - all.top) / (v.stage.bottom - roomTop);
  assert(v.z <= 1, `${what}: never zoomed in past 100%`);
  assert(v.z === 1 || Math.max(wide, tall) > 0.8, `${what}: no smaller than it needs to be (${wide}, ${tall})`);
}

try {
  await page.evaluate(
    async ({ repo }) => {
      await window.Fenmyr.saveFolders({
        projects: [{ id: 'p1', name: 'Acme', open: true, repo: { path: repo } }],
        folders: [
          { id: 'pf', name: 'Prototypes', project: 'p1', kind: 'prototyping', open: true },
          { id: 'fa', name: 'Planning', project: 'p1', open: true },
        ],
        order: {},
      });
      await window.Fenmyr.save({
        id: 'plain',
        name: 'Sketches',
        folder: 'fa',
        cards: ['a', 'b', 'c'].map((id, i) => ({
          id,
          type: 'frame',
          x: i * 433,
          y: 0,
          w: 393,
          h: 852,
          device: 'iPhone',
          radius: 44,
          name: `Screen ${id}`,
        })),
        links: [],
        tray: [],
      });
      await window.__fenmyr.refreshBoards();
    },
    { repo },
  );

  // the stamp, three notes and two docs
  const NEW = 6;

  // At the window every test opens in, the board's column is 342 px and the widgets cover nearly all of it, so the code
  // column folds and the cards fit the room that leaves, at a zoom that can be read.
  await newPrototype('Narrow');
  assert(
    (await room()).every(r => r >= 0 && r <= 24),
    `each of the notes holds its words with at most a line to spare (${await room()})`,
  );
  const narrow = await look();
  assert(narrow.codeFolded, 'a column with no room folds the code column');
  assertAllInView(narrow, 'a new prototype at 1440 x 900', NEW);
  assert(narrow.z >= READABLE, `at a zoom that can be read (${narrow.z})`);

  // a wide window and a short, narrower one, each with a column that has room
  for (const [width, height, screens] of [
    [2200, 900, ['a', 'b', 'c']],
    [1700, 700, ['a', 'b']],
  ] as const) {
    await resize(width, height);
    const size = `${width} x ${height}`;
    await newPrototype(`New ${size}`);
    assertAllInView(await look(), `a new prototype at ${size}`, NEW);
    // brought cards sit beside the notes, so they decide the zoom
    await prototypeFrom(`From screens ${size}`, [...screens]);
    const brought = await look();
    assertAllInView(brought, `a prototype made from ${screens.length} screens at ${size}`, NEW + screens.length);
    assert(
      brought.cards.filter(c => c.type === 'frame').length === screens.length,
      `${size}: the screens are on the board`,
    );
  }
  assert.deepStrictEqual(l.errors, []);
  console.log('WELCOME FIT OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
