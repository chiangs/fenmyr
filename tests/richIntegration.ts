// Rich notes meet the rest of the app, in the real app: Myra writes and edits them (with a stand-in Claude Code),
// copying puts their formatting on the clipboard, a tag typed inside bold keeps the bold, lists fit in a collection and
// a Kanban column, and the Workshop planning starter's list is a rich note.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parse, serialise } from '../src/web/richtext/dialect.ts';
import { launch } from './support/launch.ts';

const PACKING = 'Packing:\n- **tent** and pegs\n- stove\nAsk *Sam* about the car';
const PACKED = 'Packing:\n- **tent** and pegs\n- stove\n- sleeping bag\nAsk *Sam* about the car';
const SPACED = 'Plan **Friday **for *the trip* ';
const LIST = 'Trip list\n- **passport**\n  - visa\n1. book the train';
const SUMS = '5 * 3 = 15, and 2*3*4 is next';
const TALL =
  'Tasks:\n- a first item long enough to wrap across the card\n  - nested\n  - a nested item that wraps onto a second line\n1. **numbered**';

const note = (id: string, text: string, more: Record<string, unknown> = {}) => ({
  id,
  type: 'note',
  x: 0,
  y: 0,
  w: 220,
  h: 140,
  r: 0,
  color: 'white',
  text,
  ...more,
});
const lane = (id: string, kids: string[], more: Record<string, unknown>) => ({
  id,
  type: 'coll',
  y: 400,
  w: 288,
  h: 200,
  r: 0,
  color: 'mint',
  kids,
  cols: 1,
  ...more,
});
const board = {
  id: 'together',
  name: 'Together',
  tags: ['urgent'],
  view: { x: 160, y: 140, z: 1 },
  cards: [
    note('packing', PACKING, { rich: true, x: 0 }),
    note('spaced', SPACED, { rich: true, x: 260 }),
    note('sale', '**Sale**', { rich: true, x: 520 }),
    note('plain', 'Call the plumber', { x: 780, tags: ['urgent'] }),
    note('big', '**Big** plan', { rich: true, x: 0, y: 200 }),
    note('pick', '**Bold** words', { rich: true, x: 260, y: 200 }),
    note('empty', '', { rich: true, x: 520, y: 200 }),
    lane('coll', ['inColl', 'collNext'], { x: 0, text: 'Collection' }),
    note('inColl', TALL, { rich: true }),
    note('collNext', 'after it'),
    lane('kb', ['inLane', 'laneNext'], {
      x: 360,
      text: 'Board',
      kanban: true,
      cols: 2,
      colNames: ['To do', 'Done'],
      colLimit: [0, 0],
      colOf: { inLane: 0, laneNext: 0 },
    }),
    note('inLane', TALL, { rich: true }),
    note('laneNext', 'after it'),
  ],
  links: [],
  tray: [],
};

// Myra's stand-in answers each request with the reply a model might give, and keeps the prompt it was sent.
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-richmyra-')),
  bin = path.join(work, 'bin'),
  sent = path.join(work, 'prompt.txt');
fs.mkdirSync(bin);
const REPLIES: Record<string, unknown> = {
  'write a trip list': { say: 'Here it is.', add: [{ type: 'note', text: LIST }] },
  'add a sleeping bag': { say: 'Added.', edit: [{ id: 'packing', text: PACKED }] },
  'say the plan back': { say: 'Kept.', edit: [{ id: 'spaced', text: '__SHOWN__' }] },
  'work out the sums': { say: 'Sums.', add: [{ type: 'note', text: SUMS }] },
  'mention the discount': { say: 'Done.', edit: [{ id: 'sale', text: 'Price: *50% off' }] },
};
fs.writeFileSync(
  path.join(bin, 'claude'),
  `#!${process.execPath}
const fs = require('node:fs');
const prompt = process.argv[3] ?? '';
if (process.argv[2] !== '-p') process.exit(0);
fs.writeFileSync(${JSON.stringify(sent)}, prompt);
const replies = ${JSON.stringify(REPLIES)};
const key = Object.keys(replies).find(k => prompt.includes('The person asked you: ' + k));
const shown = /"id":\\s*"spaced"[^}]*?"text":\\s*("(?:[^"\\\\]|\\\\.)*")/.exec(prompt);
const reply = JSON.stringify(replies[key] ?? { say: 'Hm?' }).replace('"__SHOWN__"', shown ? shown[1] : '""');
console.log(JSON.stringify({ type: 'result', is_error: false, result: reply }));
`,
  { mode: 0o755 },
);

const other = { id: 'other', name: 'Other', cards: [note('here', 'here')], links: [], tray: [] };
const l = await launch({
  boards: [board, other],
  open: 'together',
  env: { PATH: `${bin}:${process.env.PATH ?? ''}` },
});
const { page } = l;

const stored = (id: string) =>
  page.evaluate(id => {
    const c = window.__fenmyr.board.cards.find(c => c.id === id);
    return c?.type === 'note' ? { text: c.text, rich: c.rich, tags: c.tags ?? [] } : null;
  }, id);
const drawn = (id: string) =>
  page.evaluate(id => {
    const t = document.querySelector(`#cards [data-id="${id}"] .text`);
    return {
      words: t?.textContent ?? '',
      items: t?.querySelectorAll('li').length ?? 0,
      nested: t?.querySelectorAll(':is(ul, ol) :is(ul, ol) li').length ?? 0,
      bold: [...(t?.querySelectorAll('strong') ?? [])].map(b => b.textContent?.trim()).join('|'),
    };
  }, id);
const ask = (q: string) => page.evaluate(q => window.__fenmyr.ask(q), q);
const newest = () => page.evaluate(() => window.__fenmyr.board.cards.at(-1)?.id ?? '');

await ask('write a trip list');
const made = await newest();
assert.deepStrictEqual(
  [await stored(made), await drawn(made)],
  [
    { text: LIST, rich: true, tags: [] },
    { words: 'Trip listpassportvisabook the train', items: 3, nested: 1, bold: 'passport' },
  ],
  'S8: a note Myra writes with a list is a rich note, drawn as a list',
);
const prompt = fs.readFileSync(sent, 'utf8');
assert.ok(
  prompt
    .split('\n')
    .some(line => ['"- "', '"1. "', '**', '*italic*', '~~', '<u>', 'keep'].every(m => line.includes(m))),
  'I-3: her prompt says how a note is formatted, and that she keeps the markers she was not asked to change',
);
assert.ok(
  prompt.includes(JSON.stringify(PACKING)) && !/<(strong|em|li|ul|ol)>/.test(prompt),
  'I-3: she is given a rich note in its markers, never as HTML',
);

await ask('add a sleeping bag');
assert.deepStrictEqual(
  await stored('packing'),
  { text: PACKED, rich: true, tags: [] },
  'S8: when she edits a formatted note, its other markers and the line after its list stay as they were',
);
await ask('say the plan back');
assert.deepStrictEqual(
  [(await stored('spaced'))?.rich, (await drawn('spaced')).bold, (await drawn('spaced')).words.trim()],
  [true, 'Friday', 'Plan Friday for the trip'],
  'S8: bold that ends in a space reaches her in a form she can hand back without it turning into stars',
);
await ask('work out the sums');
const sums = await newest();
assert.deepStrictEqual(
  [await stored(sums), (await drawn(sums)).words],
  [{ text: SUMS, rich: undefined, tags: [] }, SUMS],
  'S8: words of hers with a stray * stay a plain note, every star kept',
);
await ask('mention the discount');
assert.deepStrictEqual(
  [await stored('sale'), (await drawn('sale')).words],
  [{ text: 'Price: \\*50% off', rich: true, tags: [] }, 'Price: *50% off'],
  'S8: in a rich note, her words with no formatting are kept as words',
);
assert.deepStrictEqual(l.errors, []);

const clipboard = () =>
  page.evaluate(async () => {
    const out: Record<string, string> = {};
    for (const item of await navigator.clipboard.read())
      for (const type of item.types) out[type] = await (await item.getType(type)).text();
    return out;
  });
const copy = async (ids: string[]) => {
  await page.keyboard.press('Escape');
  await page.evaluate(ids => window.__fenmyr.selectOnly(ids), ids);
  await page.keyboard.press('Control+c');
  await page.waitForTimeout(300);
  return clipboard();
};
let clip = await copy(['packing', 'plain']);
const html = await page.evaluate(html => {
  const b = new DOMParser().parseFromString(html, 'text/html').body;
  return {
    lines: [...b.children].map(e => `${e.nodeName}:${e.textContent}`),
    bold: [...b.querySelectorAll('strong')].map(e => e.textContent).join('|'),
    italic: [...b.querySelectorAll('em')].map(e => e.textContent).join('|'),
  };
}, clip['text/html'] ?? '');
assert.strictEqual(
  clip['text/plain'],
  'Packing:\n• tent and pegs\n• stove\n• sleeping bag\nAsk Sam about the car\nCall the plumber',
  'I-2: copied cards put their words on the clipboard',
);
assert.deepStrictEqual(
  html,
  {
    lines: ['DIV:Packing:', 'UL:tent and pegsstovesleeping bag', 'DIV:Ask Sam about the car', 'DIV:Call the plumber'],
    bold: 'tent',
    italic: 'Sam',
  },
  'I-2: and, for other apps, HTML with the list and emphasis drawn from the markers',
);
const pasted = await page.evaluate(() => window.__fenmyr.newNote(0, 300));
await page.waitForTimeout(150);
await page.keyboard.press('Control+v');
await page.waitForTimeout(200);
assert.deepStrictEqual(
  (await stored(pasted))?.text,
  `${PACKED}\nCall the plumber`,
  'I-2: that HTML pasted into a note gives back the same note',
);
clip = await copy(['plain']);
assert.deepStrictEqual(
  clip,
  { 'text/plain': 'Call the plumber' },
  'G4: copying plain notes puts only words, as before',
);

const open = async (id: string) => {
  await page.evaluate(id => window.__fenmyr.openBoard(id), id);
  await page.waitForFunction(id => window.__fenmyr.curBoard()?.id === id, id);
};
const richTexts = () =>
  page.evaluate(() => window.__fenmyr.board.cards.flatMap(c => (c.type === 'note' && c.rich ? [c.text] : [])));
await copy(['packing']);
await open('other');
await page.keyboard.press('Control+v');
await page.waitForTimeout(300);
assert.deepStrictEqual(await richTexts(), [PACKED], 'C3: a rich note copied onto another board stays rich');
await page.evaluate(async () => {
  const H = window.__fenmyr;
  await H.saveAsTemplate('Packing kit', H.sel);
  const saved = (await window.Fenmyr.templates()).find(t => t.name === 'Packing kit');
  if (saved) await H.useTemplate(saved, 'add');
});
assert.deepStrictEqual(await richTexts(), [PACKED, PACKED], 'C3: and through a saved template');
await open('together');
assert.deepStrictEqual(l.errors, []);

const editBody = async (id: string) => {
  await page.keyboard.press('Escape');
  await page.locator(`#cards [data-id="${id}"] .text`).click();
  await page.waitForTimeout(450);
  await page.locator(`#cards [data-id="${id}"] .text`).dblclick();
  await page.waitForFunction(id => window.__fenmyr.editing === id && document.activeElement?.matches('.text'), id);
};
const caretAfter = (id: string, word: string) =>
  page.evaluate(
    ([id, word]) => {
      const t = document.querySelector(`#cards [data-id="${id}"] .text`),
        walk = t && document.createTreeWalker(t, NodeFilter.SHOW_TEXT);
      for (let n = walk?.nextNode(); n; n = walk?.nextNode()) {
        const at = n.textContent?.indexOf(word) ?? -1;
        if (at < 0) continue;
        getSelection()?.collapse(n, at + word.length);
        return;
      }
      throw new Error(`no ${word} in the note`);
    },
    [id, word] as const,
  );
const blur = async () => {
  await page.mouse.click(1380, 860);
  await page.waitForTimeout(150);
  await page.evaluate(() => window.__fenmyr.renderAll());
};

await editBody('big');
await caretAfter('big', 'Big');
await page.keyboard.type(' #fresh ', { delay: 20 });
await blur();
let tagged = await drawn('big');
assert.deepStrictEqual(
  [tagged.bold, tagged.words.includes('#'), (await stored('big'))?.tags],
  ['Big', false, ['fresh']],
  'I-6: a #tag typed inside bold and ended with a space becomes a tag, and the bold stays',
);
await editBody('pick');
await caretAfter('pick', 'Bold');
await page.keyboard.type(' #urg', { delay: 20 });
await page.locator('#tagPop.on [data-i="0"]').click();
await blur();
tagged = await drawn('pick');
assert.deepStrictEqual(
  [tagged.bold, tagged.words.includes('#'), (await stored('pick'))?.tags],
  ['Bold', false, ['urgent']],
  'I-6: and one picked from the list with the mouse keeps it too',
);

const fit = (id: string, next: string, holder: string) =>
  page.evaluate(
    ([id, next, holder]) => {
      const box = (sel: string) => document.querySelector(sel)?.getBoundingClientRect(),
        card = box(`#cards [data-id="${id}"]`),
        words = box(`#cards [data-id="${id}"] .text`),
        after = box(`#cards [data-id="${next}"]`),
        around = box(`#cards [data-id="${holder}"]`);
      return {
        fits: !!card && !!words && words.bottom <= card.bottom,
        clear: !!card && !!after && after.top >= card.bottom,
        held: !!after && !!around && around.bottom >= after.bottom,
      };
    },
    [id, next, holder] as const,
  );
const allFit = { fits: true, clear: true, held: true };
assert.deepStrictEqual(await fit('inColl', 'collNext', 'coll'), allFit, 'D4: a list fits its note in a collection');
assert.deepStrictEqual(await fit('inLane', 'laneNext', 'kb'), allFit, 'D4: and in a Kanban column');
assert.match(
  await page.evaluate(() => {
    const t = document.querySelector('#cards [data-id="empty"] .text');
    return t ? getComputedStyle(t, '::before').content : '';
  }),
  /Type something/,
  'D5: an empty rich note shows its placeholder',
);
assert.deepStrictEqual(l.errors, []);

await page.keyboard.press('Escape');
await page.click('#tools [data-add="tpl"]');
await page.waitForTimeout(300);
await page.click('[data-starter="Workshop planning"]');
await page.waitForFunction(() => window.__fenmyr.curBoard()?.name === 'Workshop planning');
await page.waitForTimeout(800);
const starter = await page.evaluate(() =>
  window.__fenmyr.board.cards.flatMap(c => {
    if (c.type !== 'note' || !c.rich) return [];
    const el = document.querySelector(`#cards [data-id="${c.id}"]`),
      words = el?.querySelector('.text')?.getBoundingClientRect(),
      body = el?.querySelector('.body')?.getBoundingClientRect();
    return [
      {
        name: c.name,
        text: c.text ?? '',
        numbered: el?.querySelectorAll('ol > li').length,
        fits: !!words && !!body && words.bottom <= body.bottom,
      },
    ];
  }),
);
assert.deepStrictEqual(
  starter.map(n => [n.name, n.numbered, n.fits, serialise(parse(n.text)) === n.text]),
  [['Suggested exit questions', 4, true, true]],
  'I13: the Workshop starter’s exit questions are a rich numbered list, in valid markers, that fits its note',
);
assert.deepStrictEqual(l.errors, []);
await l.close();
fs.rmSync(work, { recursive: true, force: true });
console.log('RICH INTEGRATION OK');
