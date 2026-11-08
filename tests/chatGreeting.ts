// An empty Myra chat in the real app: her hello uses the name she was given and follows a rename while the chat is
// open, the starters come from the board, and a click on one asks it as your question.
import assert from 'node:assert';
import { launch, settle } from './support/launch.ts';

const card = (id: string, type: string, i: number, more = {}) => ({
  id,
  type,
  x: (i % 4) * 260,
  y: Math.floor(i / 4) * 200,
  w: 220,
  h: 140,
  r: 0,
  color: 'white',
  ...more,
});
const notes = Array.from({ length: 6 }, (_, i) => card(`n${i}`, 'note', i, { name: '', text: `Idea ${i}` }));
const board = {
  id: 'greet',
  name: 'Greet',
  cards: [...notes, card('doc', 'doc', 6, { name: 'Plan', body: 'A plan' })],
  links: [],
  tray: [card('u1', 'note', 0, { text: 'Later' }), card('u2', 'note', 1, { text: 'Also later' })],
  view: { x: 0, y: 0, z: 1 },
};

const l = await launch({ boards: [board], open: 'greet', claude: true, settings: { myraName: 'Pip' } });
const { page } = l;

const failed: string[] = [];
async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
    console.log(`ok    ${name}`);
  } catch (e) {
    failed.push(name);
    console.log(`FAIL  ${name}: ${e instanceof Error ? e.message : e}`);
  }
}

const hello = () => page.evaluate(() => document.querySelector('#mcList .mc-empty b')?.textContent ?? null);
const ideas = () =>
  page.evaluate(() => [...document.querySelectorAll('#mcList .mc-ideas button')].map(b => b.textContent ?? ''));
async function openChat() {
  if (!(await page.evaluate(() => !!document.getElementById('myra')?.classList.contains('chat'))))
    await page.click('#mPill');
  await page.waitForTimeout(400);
}
async function closeChat() {
  await page.click('#mcClose');
  await page.waitForTimeout(400);
}

await page.evaluate(() => {
  const sent: string[] = [];
  Reflect.set(window, 'sent', sent);
  window.Fenmyr.ask = async (prompt: string) => {
    sent.push(prompt);
    return JSON.stringify({ say: 'Sure.' });
  };
});

await check('her hello uses the name she was given', async () => {
  await openChat();
  assert.strictEqual(await hello(), 'Hi! I’m Pip ✦');
});

await check('a rename while the chat is open shows in her hello', async () => {
  await page.evaluate(() => {
    const field = document.getElementById('myraNameIn');
    if (!(field instanceof HTMLInputElement)) throw new Error('no name field');
    field.value = 'Juniper';
    field.dispatchEvent(new Event('input'));
  });
  await page.waitForTimeout(100);
  assert.strictEqual(await hello(), 'Hi! I’m Juniper ✦');
});

await check('the starters count what is on the board and in Unsorted', async () => {
  assert.deepStrictEqual(await ideas(), [
    'Group my 6 notes by theme',
    'Find places for the 2 ideas in Unsorted',
    'Sum up my doc',
    'What am I missing?',
  ]);
});

await check('with one card selected the starters offer to add to it', async () => {
  await closeChat();
  await page.evaluate(() => window.__fenmyr.selectOnly(['n0']));
  await openChat();
  assert.strictEqual((await ideas())[0], 'What could I add to this?');
});

await check('a click on a starter asks it as your question', async () => {
  await page.locator('#mcList .mc-ideas button', { hasText: 'Sum up my doc' }).click();
  await settle(page, 300);
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('#mcList .mc-msg.me')].map(d => d.firstChild?.textContent ?? ''),
  );
  assert.deepStrictEqual(rows, ['Sum up my doc'], 'it shows as your line');
  const sent = await page.evaluate(() => [...(Reflect.get(window, 'sent') ?? [])].map(String));
  assert.ok(
    sent.some(s => s.includes('Sum up my doc')),
    'and is asked',
  );
});

assert.deepStrictEqual(l.errors, [], 'no page errors');
await l.close();
if (failed.length) {
  console.error(`${failed.length} failed`);
  process.exit(1);
}
console.log('CHAT GREETING OK');
