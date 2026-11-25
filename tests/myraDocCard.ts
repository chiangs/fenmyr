// Writing meant to be kept goes on the board as a doc card. What Myra is told (the doc card for specs, decisions, plans,
// findings and comparisons, her own line saying so, ordinary conversation staying in the chat), and what the app does
// with a reply that holds a doc: the card lands with its title and Markdown body, her line shows Show on board and
// Undo, and Undo takes the card away. The reply is a stand-in; her real answers are tried by hand.
import assert from 'node:assert';
import { ask } from '../src/host/prompts.ts';
import { replyBoard } from './fixtures/boards.ts';
import { launch } from './support/launch.ts';

const prompt = ask({
  request: 'write a spec for the onboarding flow',
  boardJSON: '{}',
  style: { name: 'Myra', chat: 'normal', emoji: true },
  commands: undefined,
  confirmed: false,
  mobbin: false,
  higgs: false,
  web: false,
  vaultNotes: [],
  vaultTasks: undefined,
  canVault: false,
  prototype: false,
  files: [],
  plan: undefined,
});

const start = prompt.indexOf('KEEPING WRITING:');
assert.ok(start >= 0, 'she is given a section on writing meant to be kept');
const keeping = prompt.slice(start, prompt.indexOf('DUE DATES:', start));
for (const says of [
  'writing meant to be kept (a spec, a decision record, a plan, research findings, a comparison, a write-up)',
  'put it on the board as one "doc" card, not only in the chat',
  'its title in "text" and its full text in "body"',
  '"body" is Markdown',
  'In "say", tell them in a sentence or two that it is on the board as a doc',
  "don't repeat its text there",
  'ordinary conversation stay in "say" with no new card',
])
  assert.ok(keeping.includes(says), `she is told: ${says}`);
assert.ok(
  prompt.includes('"body": "for a doc: its full text, in Markdown"'),
  'her reply format says a doc’s body is Markdown',
);

const SAY = 'I’ve put the onboarding spec on the board as a doc.';
const TITLE = 'Onboarding spec';
const BODY = '# Onboarding spec\n\n- Welcome screen\n- Pick a name';

const l = await launch({ boards: [replyBoard('one', 'One')], open: 'one', claude: true });
const { page } = l;

await page.evaluate(
  ([say, title, body]) => {
    window.Fenmyr.ask = async (q: string) =>
      JSON.stringify(
        q.startsWith('Write') ? { say, add: [{ type: 'doc', text: title, body }] } : { say: 'A calm blue works well.' },
      );
  },
  [SAY, TITLE, BODY],
);

const send = async (words: string) => {
  await page.locator('#mcInput').fill(words);
  await page.locator('.mc-send').click();
};
const docs = () =>
  page.evaluate(
    title =>
      window.__fenmyr
        .curBoard()
        .cards.flatMap(c => (c.type === 'doc' && c.text === title ? [{ text: c.text, body: c.body }] : [])),
    TITLE,
  );
const cardCount = () => page.evaluate(() => window.__fenmyr.curBoard().cards.length);
const buttonsUnder = (say: string) =>
  page
    .locator('#mcList .mc-msg', { hasText: say })
    .locator('.m-acts button')
    .evaluateAll(bs => bs.map(b => b.textContent ?? ''));

await page.locator('#mPill').click();
const before = await cardCount();

await send('Write a spec for the onboarding flow');
await page.locator('#mcList .mc-msg', { hasText: SAY }).locator('.m-acts button', { hasText: 'Undo' }).waitFor();
assert.deepStrictEqual(await docs(), [{ text: TITLE, body: BODY }], 'her doc is on the board with its title and body');
assert.strictEqual(await cardCount(), before + 1, 'as the one card she added');
assert.deepStrictEqual(await buttonsUnder(SAY), ['Show on board', 'Undo'], 'her line shows Show on board and Undo');

await page.locator('#mcList .mc-msg', { hasText: SAY }).locator('.m-acts button', { hasText: 'Undo' }).click();
await page.waitForFunction(
  title => !window.__fenmyr.curBoard().cards.some(c => c.type === 'doc' && c.text === title),
  TITLE,
);
assert.strictEqual(await cardCount(), before, 'Undo takes the doc card away');

await send('What’s a good colour for a calm app?');
await page.locator('#mcList .mc-msg', { hasText: 'A calm blue works well.' }).waitFor();
assert.strictEqual(await cardCount(), before, 'an ordinary answer adds no card');
assert.deepStrictEqual(await buttonsUnder('A calm blue works well.'), [], 'and has nothing to show or undo');

assert.deepStrictEqual(l.errors, []);
await l.close();
console.log('MYRA DOC CARD OK');
