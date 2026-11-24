// Skip plans, the button on Myra's plan, lasts until Fenmyr closes: it does the plan and lands later big changes at once,
// through a new chat and another board, without turning on the saved Skip plans setting. Bring plans back, on her line
// that says so, brings plans back once, and leaves the setting as it is. A reload, which is as close as a test comes to
// closing Fenmyr, brings plans back too.
import assert from 'node:assert';
import { replyBoard } from './fixtures/boards.ts';
import { launch } from './support/launch.ts';
import { still } from './support/settled.ts';

const l = await launch({
  boards: [replyBoard('main', 'Main'), replyBoard('other', 'Other')],
  open: 'main',
  claude: true,
  settings: { skipPlans: false },
});
const { page } = l;

const LEAD = 'Here’s my plan. Nothing changes until you say so.';
const SKIPPING =
  'I’ll make big changes straight away until you close Fenmyr. Skip plans in Settings → Myra keeps it that way.';
const TIP = 'Do this, and make big changes straight away until Fenmyr closes';
const BACK = 'Plans are back. I’ll show you big changes first.';
const BACK_BUT = 'Skip plans is still on in Settings → Myra, so I’ll still make big changes straight away.';
const WAITING = [':Do it', 'ghost:Change the plan', 'ghost:Cancel', 'ghost:Skip plans'];
const skipBox = 'input[data-set="skipPlans"]';

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

const notes = Array.from({ length: 11 }, (_, i) => ({ type: 'note', text: `Idea ${i + 1}` }));
// Claude's eleven ideas, as the check that holds a big reply as a plan sees them
const eleven = () => page.evaluate(r => window.__fenmyr.answerMyra(r, 'Eleven ideas'), { say: 'Eleven.', add: notes });
const ideas = () =>
  page.evaluate(
    () => window.__fenmyr.curBoard().cards.filter(c => c.type === 'note' && /^Idea /.test(c.text ?? '')).length,
  );
const rows = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('#mcList .mc-msg')].map(d => ({
      text: d.firstChild?.textContent ?? '',
      head: d.querySelector('.m-summary b')?.textContent ?? '',
      acts: [...d.querySelectorAll('.m-acts button')].map(b => `${b.className}:${b.textContent}`),
    })),
  );
const count = async (text: string) => (await rows()).filter(r => r.text === text).length;
const plans = async () => (await rows()).filter(r => r.text === LEAD);
const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('fenmyr:settings') ?? '{}').skipPlans);
const settingOn = () => page.locator(skipBox).isChecked();
const toggleSetting = () => page.evaluate(sel => document.querySelector<HTMLInputElement>(sel)?.click(), skipBox);

async function openChat() {
  if (!(await page.locator('#mcInput').isVisible())) await page.click('#mPill');
  await page.locator('#mcInput').waitFor();
  await still(page);
}
// waits until the chat shows more lines of these words than it did
const moreOf = async (text: string, before: number) => {
  await page.waitForFunction(
    ([t, n]) =>
      [...document.querySelectorAll('#mcList .mc-msg')].filter(d => d.firstChild?.textContent === t).length > Number(n),
    [text, before],
  );
  await still(page);
};
// Presses a button on the open chat and waits for the line it is to make
async function press(label: string, line?: string) {
  const before = line === undefined ? 0 : await count(line);
  await page.locator(`#mcList .m-acts button:text-is("${label}")`).last().click();
  if (line === undefined) await still(page);
  else await moreOf(line, before);
}
// the plan Skip plans is on, waiting
async function planWaits() {
  await eleven();
  assert.strictEqual((await plans()).at(-1)?.head, 'If you say yes', 'a big change waits as a plan');
}
// a big change that lands at once adds its cards and shows no plan
async function lands(why: string) {
  const had = await ideas(),
    shown = (await plans()).length;
  await eleven();
  assert.strictEqual(await ideas(), had + 11, `${why}: it lands at once`);
  assert.strictEqual((await plans()).length, shown, `${why}: with no plan`);
}
async function waits(why: string) {
  const had = await ideas();
  await planWaits();
  assert.strictEqual(await ideas(), had, `${why}: the board is as it was`);
}

await openChat();

await check('the plan offers Skip plans, not Just do it, and its tooltip says how long it lasts', async () => {
  await planWaits();
  assert.deepStrictEqual((await plans()).at(-1)?.acts, WAITING);
  const tip = await page.locator('#mcList .m-acts button:text-is("Skip plans")').getAttribute('title');
  assert.strictEqual(tip, TIP);
});

await check('Skip plans does the plan, says how long it lasts, and offers Bring plans back', async () => {
  const had = await ideas();
  await press('Skip plans', SKIPPING);
  assert.strictEqual(await ideas(), had + 11, 'the plan landed');
  assert.strictEqual((await plans()).at(-1)?.head, 'Done');
  assert.deepStrictEqual(
    (await rows()).at(-1)?.acts,
    ['ghost:Bring plans back'],
    'her line is the last, with its button',
  );
  assert.strictEqual((await rows()).at(-1)?.text, SKIPPING);
});

await check('the next big change lands with no plan, and the saved setting stays off', async () => {
  await lands('after Skip plans');
  assert.strictEqual(await saved(), false, 'skipPlans is false in the saved settings');
  assert.strictEqual(await settingOn(), false, 'and the toggle in Settings is off');
});

await check('Bring plans back brings plans back, once, for the big change after it', async () => {
  await press('Bring plans back', BACK);
  assert.strictEqual((await rows()).at(-1)?.text, BACK);
  assert.strictEqual(
    await page.locator('#mcList .m-acts button:text-is("Bring plans back")').count(),
    0,
    'it is spent',
  );
  assert.strictEqual(await saved(), false, 'the saved setting is still off');
  await waits('after it');
  await press('Cancel');
});

await check('Skip plans lasts through a new chat and a change of board', async () => {
  await planWaits();
  await press('Skip plans', SKIPPING);
  await page.click('#mcNew');
  await still(page);
  await lands('after a new chat');
  await page.evaluate(() => window.__fenmyr.openBoard('other'));
  await page.waitForFunction(() => window.__fenmyr.curBoard().id === 'other');
  await still(page);
  await lands('on another board');
  await page.evaluate(() => window.__fenmyr.openBoard('main'));
  await page.waitForFunction(() => window.__fenmyr.curBoard().id === 'main');
  await openChat();
});

await check('a reload brings plans back too', async () => {
  await lands('before the reload');
  await page.reload();
  await page.waitForFunction(() => window.__fenmyr?.curBoard() && document.querySelector('#cards .card'));
  await still(page);
  await openChat();
  await waits('after the reload');
  await press('Cancel');
});

await check('with Skip plans on in Settings too, Bring plans back leaves the setting on, and says so', async () => {
  await planWaits();
  await toggleSetting();
  assert.strictEqual(await saved(), true, 'Skip plans is turned on in Settings while the plan waits');
  await press('Skip plans', SKIPPING);
  await press('Bring plans back', BACK_BUT);
  assert.strictEqual((await rows()).at(-1)?.text, BACK_BUT);
  assert.strictEqual(await saved(), true, 'the saved setting is untouched');
  assert.strictEqual(await settingOn(), true, 'and the toggle is still on');
  await lands('on the setting alone');
  await toggleSetting();
  assert.strictEqual(await saved(), false);
  await waits('with the setting off again');
  await press('Cancel');
});

await check('Bring plans back acts once, however many copies of it a line has', async () => {
  await page.click('#mcClose');
  await page.waitForFunction(() => !document.getElementById('myra')?.classList.contains('chat'));
  await planWaits();
  await page.locator('#mActs button:text-is("Skip plans")').click();
  await page.waitForFunction(t => document.querySelector('#mActs button')?.textContent === t, 'Bring plans back');
  // the copy of her line that waits in the chat, which stays as drawn until the chat is next drawn from its log
  const stale = await page.evaluateHandle(() =>
    [...document.querySelectorAll<HTMLElement>('#mcList .m-acts button')].find(
      b => b.textContent === 'Bring plans back',
    ),
  );
  assert.strictEqual(await stale.evaluate(b => b?.textContent), 'Bring plans back', 'the chat holds a copy');
  const lines = await count(BACK);
  await page.locator('#mActs button:text-is("Bring plans back")').click();
  await moreOf(BACK, lines);
  assert.strictEqual(await count(BACK), lines + 1, 'pressed once, she says so once');
  // plans are skipped again, so the old copy would now bring them back a second time
  await planWaits();
  await page.locator('#mActs button:text-is("Skip plans")').click();
  await page.waitForFunction(t => document.querySelector('#mActs button')?.textContent === t, 'Bring plans back');
  await stale.evaluate(b => b?.click());
  await still(page);
  assert.strictEqual(await count(BACK), lines + 1, 'the old copy says nothing more');
  await lands('after the old copy was pressed');
});

await l.close();
if (failed.length) {
  console.log(`\n${failed.length} failed`);
  process.exit(1);
}
console.log('SKIP PLANS OK');
