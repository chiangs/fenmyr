// The selection bar's colour dropdowns, told apart and undone: on an icon, a title and a box, every colour trigger
// shows a glyph that says what it colours (the same glyph for the same job on every card) beside the dot of its
// colour; Stroke's No stroke takes the stroke off; and Default puts an icon's and a title's colour back to the one a
// new card of its kind has.
import assert from 'node:assert';
import { launch } from './support/launch.ts';
import { still } from './support/settled.ts';

const at = (id: string, type: string, x: number, more = {}) => ({
  id,
  type,
  x,
  y: 0,
  w: 120,
  h: 120,
  r: 0,
  ...more,
});
const board = {
  id: 'cg',
  name: 'Colour glyphs',
  cards: [
    at('ic', 'icon', 0, {
      name: 'star',
      color: '#ff5a6e',
      fill: '#f6b45e',
      stroke: '#27272a',
      sw: 2,
    }),
    at('ti', 'title', 200, {
      text: 'Coloured',
      h: 56,
      w: 300,
      tc: '#4f9dff',
      stroke: '#ff5a6e',
      sw: 1,
    }),
    at('plain', 'title', 200, { y: 200, text: 'Plain', h: 56, w: 300 }),
    at('bx', 'box', 600, { fill: '#e4e4e7', stroke: '#27272a', sw: 2 }),
  ],
  links: [],
  tray: [],
  view: { x: 100, y: 200, z: 1 },
};
const l = await launch({ boards: [board], open: 'cg' });
const { page } = l;

const COLOUR_POPS = ['fill', 'tfill', 'stroke'];
const select = async (ids: string[]) => {
  await page.evaluate(i => window.__fenmyr.selectOnly(i), ids);
  await still(page);
};
const card = (id: string) =>
  page.evaluate(i => {
    const c = window.__fenmyr.curBoard()?.cards.find(k => k.id === i);
    return c
      ? {
          color: Reflect.get(c, 'color') ?? null,
          tc: Reflect.get(c, 'tc') ?? null,
          stroke: Reflect.get(c, 'stroke') ?? null,
          sw: Reflect.get(c, 'sw') ?? 0,
        }
      : null;
  }, id);
// each colour trigger on the bar: which dropdown it opens, what it is called, the glyph drawn in it (not its caret),
// and whether it still shows the dot of its colour
const triggers = () =>
  page.evaluate(
    pops =>
      pops.flatMap(p => {
        const t = document.querySelector(`#selbar [data-pop="${p}"]`);
        if (!t) return [];
        const glyph = t.querySelector('svg[data-ico]:not(.sb-caret)'),
          shown = glyph ? glyph.getBoundingClientRect().width : 0;
        return [
          {
            pop: p,
            tip: t.getAttribute('title') || t.getAttribute('data-tt') || '',
            glyph: glyph?.getAttribute('data-ico') ?? '',
            shown,
            dot: !!t.querySelector('.sb-cur'),
          },
        ];
      }),
    COLOUR_POPS,
  );
const swatch = (pop: string, label: string) => page.locator(`#selbar .sb-pop-${pop} button[title="${label}"]`);
const lit = async (pop: string, label: string) => {
  assert.strictEqual(await swatch(pop, label).count(), 1, `${pop}'s dropdown has ${label}`);
  return swatch(pop, label).evaluate(b => b.classList.contains('on'));
};
const pick = async (pop: string, label: string) => {
  await page.click(`#selbar [data-pop="${pop}"]`);
  await lit(pop, label);
  await swatch(pop, label).click();
  await still(page);
};
const titleInk = (id: string) =>
  page.evaluate(i => {
    const t = document.querySelector(`.card[data-id="${i}"] .text`);
    return t ? getComputedStyle(t).color : '';
  }, id);

const failed: string[] = [];
const check = async (name: string, run: () => Promise<void>) => {
  try {
    await run();
  } catch (e) {
    failed.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await select([]);
};

try {
  await still(page);

  // a glyph for each name a colour trigger has (Fill, Colour, Text colour, Stroke)
  const seen = new Map<string, string>();
  for (const [id, want] of [
    ['ic', ['fill', 'tfill', 'stroke']],
    ['ti', ['tfill', 'stroke']],
    ['bx', ['fill', 'stroke']],
  ] as const) {
    await check(`each colour trigger on ${id} shows its own glyph beside its dot`, async () => {
      await select([id]);
      const ts = await triggers();
      assert.deepStrictEqual(
        ts.map(t => t.pop),
        want,
        `${id} has the colour dropdowns ${want.join(', ')}`,
      );
      for (const t of ts) {
        assert.ok(t.glyph, `${id}'s ${t.pop} trigger has a glyph`);
        assert.ok(t.shown > 0, `${id}'s ${t.pop} glyph is drawn`);
        assert.ok(t.dot, `${id}'s ${t.pop} trigger still shows its colour`);
        const before = seen.get(t.tip);
        assert.ok(!before || before === t.glyph, `${t.tip} has one glyph on every card (${before} and ${t.glyph})`);
        seen.set(t.tip, t.glyph);
      }
      const glyphs = ts.map(t => t.glyph);
      assert.strictEqual(new Set(glyphs).size, glyphs.length, `${id}'s glyphs differ: ${glyphs.join(', ')}`);
    });
  }
  await check('Fill, Colour, Text colour and Stroke each have a glyph of their own', async () => {
    assert.deepStrictEqual([...seen.keys()].sort(), ['Colour', 'Fill', 'Stroke', 'Text colour']);
    assert.strictEqual(new Set(seen.values()).size, seen.size, `one glyph each: ${[...seen.values()].join(', ')}`);
  });

  for (const id of ['ic', 'ti', 'bx']) {
    await check(`No stroke takes the stroke off ${id}`, async () => {
      await select([id]);
      await page.click('#selbar [data-pop="stroke"]');
      assert.ok(!(await lit('stroke', 'No stroke')), 'No stroke is not lit while there is a stroke');
      await swatch('stroke', 'No stroke').click();
      await still(page);
      assert.ok(!((await card(id))?.sw ?? 0), `${id} has no stroke width left`);
      assert.ok(
        await page.locator(`.card[data-id="${id}"]`).evaluate(e => !e.classList.contains('has-stroke')),
        `${id} draws no stroke`,
      );
      assert.ok(await lit('stroke', 'No stroke'), 'No stroke is lit once there is none');
    });
  }

  await check("Default puts an icon's colour back to a new icon's", async () => {
    await select(['ic']);
    await page.click('#selbar [data-pop="tfill"]');
    assert.ok(!(await lit('tfill', 'Default')), 'Default is not lit on a red icon');
    await swatch('tfill', 'Default').click();
    await still(page);
    assert.strictEqual((await card('ic'))?.color, '#27272a', 'the icon is the colour a new one has');
    await select(['ic']);
    await page.click('#selbar [data-pop="tfill"]');
    assert.ok(await lit('tfill', 'Default'), 'Default is lit once it has it');
  });

  await check("Default lets a title's colour follow the theme again", async () => {
    const theme = await titleInk('plain');
    assert.notStrictEqual(await titleInk('ti'), theme, 'the blue title starts in its own colour');
    await select(['ti']);
    await pick('tfill', 'Default');
    assert.strictEqual((await card('ti'))?.tc, null, 'the title keeps no colour of its own');
    assert.strictEqual(await titleInk('ti'), theme, 'its letters are the colour of a title that never had one');
    await select(['ti']);
    await page.click('#selbar [data-pop="tfill"]');
    assert.ok(await lit('tfill', 'Default'), 'Default is lit');
  });

  for (const f of failed) console.log(`FAILED ${f}`);
  assert.deepStrictEqual(failed, [], 'every check passes');
  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('colourGlyphs: ok');
} finally {
  await l.close();
}
