// Each check types Q after the change, so the stored text also shows where the caret was left.
import assert from 'node:assert';
import { launch } from './support/launch.ts';

const TAGGED = {
  id: 'keep',
  type: 'note',
  x: 1100,
  y: 620,
  w: 200,
  h: 100,
  r: 0,
  color: 'mint',
  text: 'x',
  tags: ['urgent'],
};
const board = { id: 'typing', name: 'Typing', cards: [TAGGED], links: [], tray: [], tags: ['urgent'] };
const l = await launch({ boards: [board], open: 'typing' });
const { page } = l;

type Note = { text: string; rich?: false; name?: string; bold?: true };
type Caret = 'end' | { after: string } | { before: string } | { select: string };
type Step = string | { type: string };
const typed = (type: string): Step => ({ type });
const after = (word: string): Caret => ({ after: word });
const before = (word: string): Caret => ({ before: word });
const select = (word: string): Caret => ({ select: word });

async function fresh(n: Note) {
  await page.keyboard.press('Escape');
  const id = await page.evaluate(n => {
    const f = window.__fenmyr,
      cards = f.board.cards,
      id = `n${Date.now()}`,
      { rich, ...rest } = n;
    for (let i = cards.length - 1; i >= 0; i--) if (cards[i]?.id !== 'keep') cards.splice(i, 1);
    cards.push({ id, type: 'note', x: 120, y: 60, w: 260, h: 160, r: 0, color: 'white', name: '', ...rest });
    if (rich !== false) Object.assign(cards.at(-1) ?? {}, { rich: true });
    f.renderAll();
    Object.assign(f.view, { x: 160, y: 140, z: 1 });
    f.applyView();
    return id;
  }, n);
  await page.waitForTimeout(60);
  return id;
}

async function selectNote(id: string) {
  await page.locator(`#cards [data-id="${id}"] .text`).click();
  await page.waitForTimeout(450);
}

async function edit(id: string) {
  await selectNote(id);
  await page.locator(`#cards [data-id="${id}"] .text`).dblclick();
  await page.waitForFunction(id => window.__fenmyr.editing === id && document.activeElement?.matches('.text'), id);
}

const place = (id: string, caret: Caret) =>
  caret === 'end'
    ? page.keyboard.press('Control+End')
    : page.evaluate(
        ([id, caret]) => {
          const t = document.querySelector(`#cards [data-id="${id}"] .text`),
            word = 'after' in caret ? caret.after : 'before' in caret ? caret.before : caret.select,
            walk = t && document.createTreeWalker(t, NodeFilter.SHOW_TEXT);
          for (let n = walk?.nextNode(); n; n = walk?.nextNode()) {
            const at = n.textContent?.indexOf(word) ?? -1;
            if (at < 0) continue;
            const r = document.createRange();
            r.setStart(n, 'after' in caret ? at + word.length : at);
            if ('select' in caret) r.setEnd(n, at + word.length);
            getSelection()?.removeAllRanges();
            getSelection()?.addRange(r);
            return;
          }
          throw new Error(`no ${word} in the note`);
        },
        [id, caret] as const,
      );

async function act(steps: readonly Step[]) {
  for (const s of steps) {
    if (typeof s === 'string') await page.keyboard.press(s);
    else await page.keyboard.type(s.type, { delay: 20 });
    await page.waitForTimeout(40);
  }
}

const stored = (id: string) =>
  page.evaluate(id => {
    const c = window.__fenmyr.board.cards.find(c => c.id === id),
      note = c?.type === 'note' ? c : undefined;
    return { text: note?.text ?? '', rich: note?.rich, name: note?.name, bold: c?.bold, tags: c?.tags ?? [] };
  }, id);

async function blur() {
  await page.mouse.click(1380, 860);
  await page.waitForTimeout(120);
}

async function start(n: Note, caret: Caret) {
  const id = await fresh(n);
  await edit(id);
  await place(id, caret);
  return id;
}

async function check(what: string, n: Note, caret: Caret, steps: readonly Step[], want: string) {
  const id = await start(n, caret);
  await act([...steps, typed('Q')]);
  await blur();
  assert.strictEqual((await stored(id)).text, want, what);
  return id;
}

const S3 = 'one two three four five';
const LINE = { text: 'first line' };
const L1 = { text: '- alpha\n- beta' };
const ROWS = { text: 'one\ntwo\nthree' };
const NUMBERED = { text: '1. a\n2. b\n3. c' };
const CHECKS: [string, Note, Caret, Step[], string][] = [
  [
    'S3: Ctrl+B bolds only the selected words',
    { text: S3 },
    select('two three four'),
    ['Control+b', 'End'],
    'one **two three four** fiveQ',
  ],
  ['Ctrl+I', { text: S3 }, select('two'), ['Control+i', 'End'], 'one *two* three four fiveQ'],
  ['Ctrl+U', { text: S3 }, select('two'), ['Control+u', 'End'], 'one <u>two</u> three four fiveQ'],
  ['Ctrl+Shift+X strikes', { text: S3 }, select('two'), ['Control+Shift+X', 'End'], 'one ~~two~~ three four fiveQ'],
  [
    'Ctrl+B at the caret bolds what comes next',
    { text: 'one two' },
    'end',
    ['Control+b', typed('xy')],
    'one two**xyQ**',
  ],
  ['Ctrl+\\ clears', { text: 'one **two** three' }, select('two'), ['Control+Backslash', 'End'], 'one two threeQ'],
  ['S4: "- " starts a list', LINE, 'end', ['Enter', typed('- ')], 'first line\n- Q'],
  ['"* " starts a list', LINE, 'end', ['Enter', typed('* ')], 'first line\n- Q'],
  ['"• " starts a list', LINE, 'end', ['Enter', typed('• ')], 'first line\n- Q'],
  ['"1. " starts a numbered list', LINE, 'end', ['Enter', typed('1. ')], 'first line\n1. Q'],
  ['the words after the caret join the item', { text: 'rest of it' }, before('rest'), [typed('- ')], '- Qrest of it'],
  [
    'Backspace straight after gives back the characters',
    LINE,
    'end',
    ['Enter', typed('- '), 'Backspace'],
    'first line\n\\- Q',
  ],
  [
    'S4: Enter adds an item; on an empty one it leaves',
    LINE,
    'end',
    ['Enter', typed('- a'), 'Enter', typed('b'), 'Enter', 'Enter'],
    'first line\n- a\n- b\nQ',
  ],
  ['Shift+Enter breaks the line inside an item', L1, after('beta'), ['Shift+Enter'], '- alpha\n- beta\n  Q'],
  ['Ctrl+Shift+8 makes a line a bullet', ROWS, after('tw'), ['Control+Shift+Digit8'], 'one\n- twQo\nthree'],
  ['Ctrl+Shift+7 makes it numbered', ROWS, after('two'), ['Control+Shift+Digit7'], 'one\n1. twoQ\nthree'],
  ['and the same keys take it out', { text: '- one\n- two' }, after('two'), ['Control+Shift+Digit8'], '- one\ntwoQ'],
  ['a new item renumbers the rest', NUMBERED, after('b'), ['Enter'], '1. a\n2. b\n3. Q\n4. c'],
  ['a plain line restarts the numbers', NUMBERED, before('b'), ['Backspace'], '1. a\nQb\n1. c'],
  ['S5: Tab nests an item', L1, after('beta'), ['Tab'], '- alpha\n  - betaQ'],
  [
    'Tab stops three deep',
    { text: '- a\n  - b\n    - c\n    - d' },
    after('d'),
    ['Tab'],
    '- a\n  - b\n    - c\n    - dQ',
  ],
  ['Tab leaves a first item where it is', L1, after('alpha'), ['Tab'], '- alphaQ\n- beta'],
  ['S5: Shift+Tab brings it back', { text: '- alpha\n  - beta' }, after('beta'), ['Shift+Tab'], '- alpha\n- betaQ'],
  [
    'Backspace moves a third-level item out',
    { text: '- a\n  - b\n    - c' },
    before('c'),
    ['Backspace'],
    '- a\n  - b\n  - Qc',
  ],
  ['and a second-level one', { text: '- a\n  - b' }, before('b'), ['Backspace'], '- a\n- Qb'],
  ['and takes the marker off a first-level one', { text: '- a\n- b' }, before('b'), ['Backspace'], '- a\nQb'],
];
for (const [what, n, caret, steps, want] of CHECKS) await check(what, n, caret, steps, want);
assert.strictEqual(await page.evaluate(() => document.body.classList.contains('clean')), false, 'Ctrl+\\ in a note');

const plain = await check(
  'a plain note',
  { text: 'one two 3', rich: false },
  select('two'),
  ['Control+b', 'End'],
  'one **two** 3Q',
);
assert.strictEqual((await stored(plain)).rich, true, 'becomes rich when its words gain formatting');
const kept = await check(
  'a bold card',
  { text: 'a', rich: false, bold: true },
  'end',
  ['Enter', typed('b'), 'Home', 'Backspace'],
  'aQb',
);
assert.strictEqual((await stored(kept)).rich, undefined, 'stays plain while it is only typed in');
const hop = await check(
  'Shift+Tab outside a list',
  { text: '- a\nwords', name: 'Title' },
  after('words'),
  ['Shift+Tab'],
  '- a\nwords',
);
assert.strictEqual((await stored(hop)).name, 'Q', 'goes to the name');

for (const key of ['Enter', 'Tab']) {
  const id = await start({ text: '- alpha\n- **beta**' }, after('beta'));
  await act([typed(' #urg')]);
  assert.ok(await page.evaluate(() => !!document.querySelector('#tagPop.on')), 'typing # offers the board tags');
  await act([key, typed('Q')]);
  await blur();
  const n = await stored(id);
  assert.deepStrictEqual([n.text, n.tags], ['- alpha\n- **beta Q**', ['urgent']], `${key} picks the tag in a list`);
}
assert.deepStrictEqual(l.errors, []);

type Undo = { undone: string; caretUndone: string; caretRedone: string };
const UNDOS: [string, Note, Caret, Step[], Undo][] = [
  [
    'bold',
    { text: S3 },
    select('two'),
    ['Control+b'],
    { undone: S3, caretUndone: 'one Q three four five', caretRedone: 'one **Q** three four five' },
  ],
  [
    'a typed list',
    { text: 'a\n-' },
    'end',
    [typed(' ')],
    { undone: 'a\n\\- ', caretUndone: 'a\n\\- Q', caretRedone: 'a\n- Q' },
  ],
  [
    'Ctrl+Shift+8',
    { text: 'one\ntwo' },
    after('tw'),
    ['Control+Shift+Digit8'],
    { undone: 'one\ntwo', caretUndone: 'one\ntwQo', caretRedone: 'one\n- twQo' },
  ],
  [
    'Tab',
    L1,
    after('beta'),
    ['Tab'],
    { undone: L1.text, caretUndone: '- alpha\n- betaQ', caretRedone: '- alpha\n  - betaQ' },
  ],
];
for (const [what, n, caret, steps, u] of UNDOS)
  for (const redo of [false, true]) {
    const id = await start(n, caret);
    await act(steps);
    const changed = (await stored(id)).text;
    await act(['Control+z']);
    assert.strictEqual((await stored(id)).text, u.undone, `S6: Ctrl+Z after ${what}`);
    if (redo) await act(['Control+Shift+z']);
    if (redo) assert.strictEqual((await stored(id)).text, changed, `S6: Ctrl+Shift+Z after ${what}`);
    await act([typed('Q')]);
    assert.strictEqual((await stored(id)).text, redo ? u.caretRedone : u.caretUndone, `the caret after ${what}`);
    await blur();
  }
assert.deepStrictEqual(l.errors, []);

const bar = (sel: string) => page.locator(`#selbar ${sel}`);
const listButtons = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('#selbar.on [data-fmt]')]
      .filter(b => b.checkVisibility())
      .map(b => b.getAttribute('data-fmt')),
  );
const pressed = (sel: string) => page.evaluate(sel => !!document.querySelector(`#selbar ${sel}.on`), sel);
const id = await fresh({ text: 'one **two** three\n- item' });
await selectNote(id);
assert.deepStrictEqual(await listButtons(), [], 'U2: with the note only selected, the bar has no list buttons');
await edit(id);
await page.waitForTimeout(100);
assert.deepStrictEqual(await listButtons(), ['bullets', 'numbered', 'clear'], 'U2: while it is typed in, it has them');
await place(id, after('tw'));
await page.waitForTimeout(100);
assert.ok(await pressed('[data-ts="bold"]'), 'U4: B is pressed inside bold words');
await place(id, after('ite'));
await page.waitForTimeout(100);
assert.ok((await pressed('[data-fmt="bullets"]')) && !(await pressed('[data-ts="bold"]')), 'U4: bullets in a list');
await place(id, select('three'));
await bar('[data-ts="italic"]').click();
await bar('[data-ts="under"]').click();
assert.strictEqual(
  await page.evaluate(() => window.__fenmyr.editing),
  id,
  'U3: pressing the bar keeps the note typed in',
);
assert.strictEqual(await page.evaluate(() => getSelection()?.toString()), 'three', 'and its words selected');
await place(id, after('item'));
await bar('[data-ts="strike"]').click();
await act([typed('xy')]);
await place(id, after('one'));
await bar('[data-fmt="numbered"]').click();
await act([typed('Q')]);
let n = await stored(id);
assert.deepStrictEqual(
  [n.text, n.bold],
  ['1. oneQ **two** *<u>three</u>*\n- item~~xy~~', undefined],
  'U1: the bar formats the selection, the caret and the line, never the whole card',
);
await place(id, select('two'));
await bar('[data-fmt="clear"]').click();
await blur();
assert.strictEqual((await stored(id)).text, '1. oneQ two *<u>three</u>*\n- item~~xy~~', 'and clears the selection');
await page.locator(`#cards [data-id="${id}"] .text`).click();
await page.waitForTimeout(200);
assert.deepStrictEqual(await listButtons(), [], 'U2: once typing stops, the list buttons go');
await bar('[data-ts="bold"]').click();
n = await stored(id);
assert.deepStrictEqual(
  [n.bold, n.text.startsWith('1. oneQ two')],
  [true, true],
  'U1: with the card only selected, B bolds it',
);
await page.keyboard.press('Control+Backslash');
await page.waitForTimeout(300);
assert.ok(
  await page.evaluate(() => document.body.classList.contains('clean')),
  'Ctrl+\\ outside a note body hides panels',
);
await page.keyboard.press('Control+Backslash');
await page.waitForTimeout(300);

const ime = await start({ text: 'one **two**' }, 'end');
const cdp = await page.context().newCDPSession(page);
await cdp.send('Input.imeSetComposition', { text: 'にほ', selectionStart: 2, selectionEnd: 2 });
await page.waitForTimeout(80);
assert.strictEqual((await stored(ime)).text, 'one **two**', 'T8: nothing is stored while words are composed');
await cdp.send('Input.insertText', { text: '日本' });
await page.waitForTimeout(80);
assert.strictEqual((await stored(ime)).text, 'one **two日本**', 'T8: the chosen words are stored once they are');
await blur();

const tall = await start({ text: '- a' }, 'end');
await act([
  'Enter',
  typed('b'),
  'Tab',
  'Enter',
  typed('a much longer line that has to wrap in the note'),
  'Enter',
  typed('c'),
]);
const fits = await page.evaluate(id => {
  const el = document.querySelector(`#cards [data-id="${id}"]`),
    bottom = (sel: string) => el?.querySelector(sel)?.getBoundingClientRect().bottom ?? 0;
  return bottom('.text') <= bottom('.body') + 0.5;
}, tall);
assert.ok(fits, 'the note grows to fit the list while it is typed');
await blur();
assert.deepStrictEqual(l.errors, []);
await l.close();
console.log('RICH TYPING OK');
