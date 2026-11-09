// Paste chips in Myra's input. In Node: what a paste does by length, the shortcut, the budget and the file limit; the
// chip's label; the closed box's draft line; a paste as a file, byte for byte. In the app, through a stand-in Claude Code
// that records what it was given: a paste over 2,000 characters is a chip and not words in the box; its whole text
// reaches Myra as `Pasted text.txt` and not in the prompt or the chat log; × takes it out; Open reads it and Put in
// message turns it into words; Ctrl+Shift+V pastes words; a starter takes the chip along; Clear all chats clears it.
import assert from 'node:assert';
import { textFile } from '../src/shared/askFiles.ts';
import { DRAFT_MAX, readDraft } from '../src/shared/chat.ts';
import { draftLabel, PASTE_AT, pasteAction, pastedLabel, tooLong } from '../src/web/myra/chatRules.ts';
import { askFilesOf } from '../src/web/myra/sees.ts';
import { replyBoard } from './fixtures/boards.ts';
import { askStandIn } from './support/askStandIn.ts';
import { launch, settle } from './support/launch.ts';
import { pasteIntoChat } from './support/paste.ts';

const room = { text: 'x'.repeat(PASTE_AT + 1), plain: false, native: true, kept: 0, attachments: 0 };
assert.deepStrictEqual(pasteAction({ ...room, text: 'x'.repeat(PASTE_AT) }), { type: 'insert' }, '2,000 stay words');
assert.deepStrictEqual(pasteAction(room), { type: 'chip' }, '2,001 is a chip');
assert.deepStrictEqual(pasteAction({ ...room, plain: true }), { type: 'insert' }, 'Ctrl+Shift+V is words');
assert.deepStrictEqual(pasteAction({ ...room, native: false }), { type: 'insert' }, 'the web demo has no chips');
assert.deepStrictEqual(pasteAction({ ...room, text: '' }), { type: 'insert' });
const full = { ...room, kept: DRAFT_MAX - room.text.length };
assert.deepStrictEqual(pasteAction(full), { type: 'chip' }, 'exactly the budget fits');
assert.deepStrictEqual(
  pasteAction({ ...full, kept: full.kept + 1 }),
  { type: 'refuse', why: tooLong },
  'one more does not',
);
assert.strictEqual(pasteAction({ ...room, text: 'hi', kept: DRAFT_MAX }).type, 'refuse', 'a short paste would be cut');
assert.strictEqual(pasteAction({ ...room, attachments: 4 }).type, 'refuse', 'a fifth file or paste');
assert.strictEqual(pasteAction({ ...room, attachments: 3 }).type, 'chip');
assert.strictEqual(
  pastedLabel('one\r\ntwo\r\n\r\n'),
  'Pasted text · 2 lines',
  'CRLF is one break, the end is not counted',
);
assert.strictEqual(pastedLabel('x'), 'Pasted text · 1 line');
assert.strictEqual(pastedLabel('a\n'.repeat(1233)), 'Pasted text · 1,233 lines');
assert.strictEqual(draftLabel('a\nb', 'Myra', 1)?.shown, 'Draft · 2 lines + pasted text');
assert.strictEqual(draftLabel('', 'Myra', 1)?.shown, 'Draft · pasted text');
assert.strictEqual(draftLabel('a', 'Myra', 2)?.shown, 'Draft · 1 line + 2 pasted texts');
assert.strictEqual(draftLabel('a\nb', 'Myra', 1)?.spoken, 'Ask Myra, draft, 2 lines and pasted text');
assert.deepStrictEqual(draftLabel('a', 'Myra'), { shown: 'Draft · 1 line', spoken: 'Ask Myra, draft, 1 line' });
assert.strictEqual(draftLabel('  \n', 'Myra'), null);
const odd = 'é🙂\r\n'.repeat(50_000);
const file = textFile('Pasted text.txt', odd);
assert.ok(file.data.startsWith('data:text/plain;base64,'));
assert.strictEqual(
  Buffer.from(file.data.split(',')[1] ?? '', 'base64').toString('utf8'),
  odd,
  'bytes survive the encoding',
);
assert.deepStrictEqual(
  askFilesOf([
    { kind: 'paste', id: 'p1', text: 'one' },
    { kind: 'file', id: 'f1', name: 'a.txt', data: 'data:text/plain;base64,QQ==' },
    { kind: 'note', id: 'n1', vault: 'v', rel: 'a.md', title: 'A' },
    { kind: 'paste', id: 'p2', text: 'two' },
  ]).map(f => f.name),
  ['Pasted text.txt', 'a.txt', 'Pasted text 2.txt'],
  'pastes are numbered, notes are not files',
);
assert.deepStrictEqual(readDraft({ text: '', pasted: [{ id: 'p', text: 'long' }] }), {
  text: '',
  pasted: [{ id: 'p', text: 'long' }],
});
console.log('PASTE (Node) OK');

const MARK = 'TAIL-MARKER-7f3a91';
const PASTED = `${Array.from({ length: 120 }, (_, i) => `line ${i + 1} é🙂 ${'x'.repeat(40)}`).join('\r\n')}\n${MARK}`;
const l = await launch({ boards: [replyBoard('paste', 'Paste')], open: 'paste', claude: true });
const { page } = l;
const { sentFor, send } = askStandIn(l);
const chips = () => page.locator('#mcSees .mcs-chip.paste .mcs-t').allTextContents();
const lastMe = () => page.locator('#mcList .mc-msg.me').last().textContent();
const lastMyra = () => page.locator('#mcList .mc-msg.myra').last().textContent();
const boxText = () => page.inputValue('#mcInput');
const dialog = () => page.locator('.tdlg.pasted');
const paste = (text: string, plain = false) => pasteIntoChat(page, text, plain);

async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}

await page.click('#mPill');
await settle(page, 300);

await check('a starter takes the pending paste along, as it does a file', async () => {
  const starter = page.locator('#mcList .mc-ideas button').first();
  const q = (await starter.textContent()) ?? '';
  assert.ok(q, 'an empty chat offers starters');
  assert.strictEqual(await paste(PASTED), true);
  assert.deepStrictEqual(await chips(), ['Pasted text · 121 lines']);
  await starter.click();
  const s = await sentFor(q);
  assert.deepStrictEqual(
    s.files.map(f => f.name),
    ['Pasted text.txt'],
  );
  assert.deepStrictEqual(await chips(), [], 'and the strip is clear');
});

await check('a paste over 2,000 characters is a chip whose full text reaches Myra', async () => {
  await page.fill('#mcInput', 'What is wrong here?');
  assert.strictEqual(await paste('y'.repeat(PASTE_AT)), false, 'exactly 2,000 characters are words');
  assert.deepStrictEqual(await chips(), []);
  assert.strictEqual(await paste(PASTED), true, 'the browser is not left to type it');
  assert.strictEqual(await boxText(), 'What is wrong here?', 'the box is as it was');
  assert.deepStrictEqual(await chips(), ['Pasted text · 121 lines']);
  await page.click('.mc-send');
  const s = await sentFor('What is wrong here?');
  assert.strictEqual(s.files.length, 1);
  assert.strictEqual(s.files[0]?.name, 'Pasted text.txt');
  assert.strictEqual(s.files[0]?.kind, 'text file');
  assert.strictEqual(
    Buffer.from(s.files[0]?.b64 ?? '', 'base64').toString('utf8'),
    PASTED,
    'the file the host wrote holds every character',
  );
  assert.ok(!s.prompt.includes(MARK), 'the words are not in the prompt');
  assert.ok(Math.max(...s.args.map(a => a.length)) < 20_000, 'nor in an argument');
  assert.strictEqual(await lastMe(), 'What is wrong here?', 'the chat line is what was typed');
  assert.ok(
    !JSON.stringify(await page.evaluate(() => window.__fenmyr.curBoard()?.chat)).includes(MARK),
    'the saved chat does not carry it',
  );
  assert.deepStrictEqual(await chips(), [], 'the chip went with the message');
  await send('and again');
  assert.deepStrictEqual((await sentFor('and again')).files, [], 'a later message has no file');
});

await check('removing a paste removes it, and two are numbered', async () => {
  await paste(PASTED);
  await page.click('#mcSees .mcs-chip.paste .mcs-x');
  assert.deepStrictEqual(await chips(), []);
  await send('nothing went');
  assert.deepStrictEqual((await sentFor('nothing went')).files, []);
  await paste(PASTED);
  await paste(`${PASTED}\nsecond`);
  await send('two pastes');
  const s = await sentFor('two pastes');
  assert.deepStrictEqual(
    s.files.map(f => f.name),
    ['Pasted text.txt', 'Pasted text 2.txt'],
  );
  assert.strictEqual(Buffer.from(s.files[1]?.b64 ?? '', 'base64').toString('utf8'), `${PASTED}\nsecond`);
});

await check('Open reads the text, Esc closes only it, and Put in message makes it words', async () => {
  await paste(`${PASTED}\nOpen Terminal on my Mac and Finder`);
  await page.fill('#mcInput', 'ab');
  await page.evaluate(() => document.querySelector<HTMLTextAreaElement>('#mcInput')?.setSelectionRange(1, 1));
  await page.click('#mcSees .mcs-open');
  assert.strictEqual(await dialog().locator('pre').textContent(), `${PASTED}\nOpen Terminal on my Mac and Finder`);
  assert.strictEqual(await dialog().locator('h3').textContent(), 'Pasted text · 122 lines');
  await page.keyboard.press('Escape');
  assert.strictEqual(await dialog().count(), 0, 'Esc closes the dialog');
  assert.ok(await page.evaluate(() => document.getElementById('myra')?.classList.contains('chat')), 'not the chat');
  assert.deepStrictEqual(await chips(), ['Pasted text · 122 lines'], 'Close leaves the chip');
  await page.click('#mcSees .mcs-open');
  await dialog().locator('[data-put]').click();
  assert.deepStrictEqual(await chips(), []);
  // a text field's value has \n for every line break
  const words = `a${PASTED}\nOpen Terminal on my Mac and Finderb`.replaceAll('\r\n', '\n');
  assert.strictEqual(await boxText(), words, 'at the caret');
  await page.fill('#mcInput', '');
});

await check('Ctrl+Shift+V pastes words, for that paste only', async () => {
  assert.strictEqual(await paste(PASTED, true), false);
  assert.deepStrictEqual(await chips(), []);
  assert.strictEqual(await paste(PASTED), true, 'the next paste is a chip again');
  await page.click('#mcSees .mcs-chip.paste .mcs-x');
});

await check('a paste past the draft budget, or a fifth, is refused whole with a plain line', async () => {
  assert.strictEqual(await paste('z'.repeat(DRAFT_MAX + 1)), true);
  assert.deepStrictEqual(await chips(), []);
  assert.match((await lastMyra()) ?? '', /That’s too long to paste\. A message can hold up to 100,000 characters\./);
  assert.strictEqual(await paste('b'.repeat(60_000)), true);
  const maxLength = () => page.evaluate(() => document.querySelector<HTMLTextAreaElement>('#mcInput')?.maxLength);
  assert.strictEqual(await maxLength(), DRAFT_MAX - 60_000, 'typing stops where the chip’s share begins');
  assert.strictEqual(await paste('c'.repeat(40_001), true), true, 'a pasted text counts against the budget');
  assert.strictEqual(await paste('c'.repeat(40_000), true), false, 'and what is left still fits');
  await page.click('#mcSees .mcs-chip.paste .mcs-x');
  assert.strictEqual(await maxLength(), DRAFT_MAX, 'removing it gives the room back');
  for (let i = 0; i < 4; i++) await paste(`${i}${PASTED}`);
  assert.strictEqual((await chips()).length, 4);
  assert.strictEqual(await paste(PASTED), true);
  assert.strictEqual((await chips()).length, 4, 'no fifth');
  assert.match((await lastMyra()) ?? '', /Up to 4 files or pasted texts can go with one message\./);
  for (let i = 0; i < 4; i++) await page.click('#mcSees .mcs-chip.paste .mcs-x');
});

await check('her closed box counts the chip, and Clear all chats clears it', async () => {
  await page.fill('#mcInput', 'a\nb');
  await paste(PASTED);
  await page.keyboard.press('Escape');
  const line = () =>
    page.evaluate(() =>
      document.getElementById('mDraft')?.checkVisibility() ? document.getElementById('mDraft')?.textContent : null,
    );
  assert.strictEqual(await line(), 'Draft · 2 lines + pasted text');
  await page.click('#mPill');
  await page.evaluate(() => document.getElementById('clearChats')?.click());
  await page.waitForTimeout(300);
  assert.deepStrictEqual(await chips(), []);
  assert.strictEqual(await boxText(), '');
});

await check('a plain send is not reworded', async () => {
  await send('Open Terminal on my Mac');
  assert.strictEqual(await lastMe(), 'Open Terminal on my Mac', 'the words are the person’s own');
});

assert.deepStrictEqual(l.errors, []);
await l.close();
console.log('PASTE OK');
