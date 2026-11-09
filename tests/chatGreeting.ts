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

await check('selecting cards with the chat open updates the starters', async () => {
  const box = await page.locator('.card[data-id="n0"]').boundingBox();
  if (!box) throw new Error('no card on screen');
  await page.mouse.click(box.x + 20, box.y + 10);
  await page.waitForTimeout(200);
  assert.strictEqual((await ideas())[0], 'What could I add to this?', 'one card');
  const other = await page.locator('.card[data-id="n1"]').boundingBox();
  if (!other) throw new Error('no second card on screen');
  await page.keyboard.down('Shift');
  await page.mouse.click(other.x + 20, other.y + 10);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(200);
  assert.strictEqual((await ideas())[0], 'Compare these 2 cards', 'two cards');
});

await check('a selection left out of the next message offers the board starters', async () => {
  await page.click('#mcSees [data-chip="sel"] .mcs-x');
  await page.waitForTimeout(200);
  assert.strictEqual((await ideas())[0], 'Group my 6 notes by theme', 'left out');
  await page.click('#mcSees [data-chip="sel"]');
  await page.waitForTimeout(200);
  assert.strictEqual((await ideas())[0], 'Compare these 2 cards', 'put back');
});

await check('clearing the selection with the chat open brings back the board starters', async () => {
  for (const id of ['n1', 'n0']) {
    const box = await page.locator(`.card[data-id="${id}"]`).boundingBox();
    if (!box) throw new Error(`no ${id} on screen`);
    await page.keyboard.down('Shift');
    await page.mouse.click(box.x + 20, box.y + 10);
    await page.keyboard.up('Shift');
  }
  await page.waitForTimeout(200);
  assert.strictEqual(await page.evaluate(() => document.querySelectorAll('#mcSees [data-chip="sel"]').length), 0);
  assert.strictEqual((await ideas())[0], 'Group my 6 notes by theme');
});

await check('a long name with no spaces wraps in a 280 px chat', async () => {
  await page.evaluate(() => {
    const chat = document.getElementById('mChat'),
      field = document.getElementById('myraNameIn');
    if (!chat || !(field instanceof HTMLInputElement)) throw new Error('no chat or name field');
    chat.style.width = '280px';
    field.value = 'WWWWWWWWWWWWWWWWWW';
    field.dispatchEvent(new Event('input'));
  });
  await page.waitForTimeout(100);
  const fit = await page.evaluate(() => {
    const list = document.getElementById('mcList');
    return { scroll: list?.scrollWidth ?? 0, client: list?.clientWidth ?? 0 };
  });
  await page.evaluate(() => document.getElementById('mChat')?.style.removeProperty('width'));
  assert.ok(fit.client > 0 && fit.scroll <= fit.client, `list scrolls sideways: ${fit.scroll} > ${fit.client}`);
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
