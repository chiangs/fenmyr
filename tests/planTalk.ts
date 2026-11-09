// Talking to Myra while a plan waits. A message goes to her with the plan and the notes she read for it; an answer
// that changes the board replaces the plan, as a plan however small, words alone leave it waiting, and she can drop
// it. A plain yes or no answers it with no request to Claude. Change the plan only puts them in her input.
import assert from 'node:assert';
import { replyBoard } from './fixtures/boards.ts';
import { askStandIn } from './support/askStandIn.ts';
import { launch, settle } from './support/launch.ts';

const l = await launch({ boards: [replyBoard('talk', 'Talk')], open: 'talk', claude: true });
const { page } = l;
const { sentFor, send } = askStandIn(l);

const LEAD = 'Here’s my plan. Nothing changes until you say so.';
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
const rows = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('#mcList .mc-msg')].map(d => ({
      who: d.classList.contains('me') ? 'me' : 'myra',
      text: d.firstChild?.textContent ?? '',
      head: d.querySelector('.m-summary b')?.textContent ?? '',
      lines: [...d.querySelectorAll('.m-summary li')].map(li => li.textContent ?? ''),
      acts: [...d.querySelectorAll('.m-acts button')].map(b => `${b.className}:${b.textContent}`),
    })),
  );
const plans = async () => (await rows()).filter(r => r.text === LEAD);
const WAITING = [':Do it', 'ghost:Change the plan', 'ghost:Cancel'];
const notes = (n: number) => Array.from({ length: n }, (_, i) => ({ type: 'note', text: `Idea ${i + 1}` }));
const note = (rel: string, title: string) => ({
  vault: 'Notes',
  vaultId: 'v1',
  rel,
  title,
  tags: [],
  props: undefined,
  excerpt: title,
  text: title,
});
const READ = { asked: true, used: [note('Roadmap.md', 'Roadmap'), note('Retro.md', 'Retro notes')] };
// a plan of eleven notes and the two vault notes she read for it
const ELEVEN = {
  say: 'Here are eleven.',
  add: notes(11),
  vaultNotes: [
    { vault: 'Notes', path: 'Roadmap.md' },
    { vault: 'Notes', path: 'Retro.md' },
  ],
};
const eleven = () =>
  page.evaluate(({ r, ctx }) => window.__fenmyr.answerMyra(r, 'Eleven ideas', ctx), { r: ELEVEN, ctx: READ });
// her answer to what they write next, as Claude would send it, with what each request carried
const answer = (reply: object) =>
  page.evaluate(r => {
    const sent: unknown[] = [];
    Reflect.set(window, 'sent', sent);
    window.Fenmyr.ask = async (_prompt, _board, _confirmed, opts) => {
      sent.push(opts);
      return JSON.stringify(r);
    };
  }, reply);
const sent = () => page.evaluate(() => JSON.stringify(Reflect.get(window, 'sent') ?? []));
const board = () => page.evaluate(() => JSON.stringify(window.__fenmyr.curBoard().cards));

await page.evaluate(() => document.getElementById('mPill')?.click());
await settle(page, 300);

await check(
  'a message while a plan waits goes to her with the plan and its notes, and words alone keep it',
  async () => {
    await eleven();
    await send('why eleven?');
    const { prompt } = await sentFor('why eleven?');
    const [, section = ''] = prompt.split('A PLAN IS WAITING: ');
    assert.match(
      section,
      /^for "Eleven ideas" you proposed the reply below, which the app is showing them as a plan \(\+ 13 cards\)/,
    );
    const held = JSON.parse(section.split('\n')[1] ?? '');
    assert.strictEqual(held.add?.length, 11, 'with her reply');
    assert.strictEqual(held.say, undefined, 'without her words');
    assert.match(prompt, /Roadmap[\s\S]*Retro notes/, 'and the notes she read for it go again');
    await settle(page, 800);
    assert.deepStrictEqual((await rows()).at(-1)?.text, 'ok', 'her words show');
    assert.deepStrictEqual((await plans()).at(-1)?.acts, WAITING, 'and the plan still waits');
  },
);

await check('her changed plan replaces the waiting one, as a plan though it is small', async () => {
  await answer({ say: 'Two then.', add: notes(2) });
  await send('just two please');
  await settle(page, 800);
  const [opts] = JSON.parse(await sent());
  assert.deepStrictEqual(opts.plan.steps, ['+ 13 cards']);
  assert.strictEqual(opts.plan.request, 'Eleven ideas');
  assert.deepStrictEqual(
    opts.vaultNotes.map((n: { path: string }) => n.path),
    ['Roadmap.md', 'Retro.md'],
  );
  const [old, now] = (await plans()).slice(-2);
  assert.deepStrictEqual([old?.head, old?.acts], ['Replaced by the plan below', []]);
  assert.deepStrictEqual([now?.head, now?.lines, now?.acts], ['If you say yes', ['+ 2 notes'], WAITING]);
});

await check('she can drop the plan when they no longer want it', async () => {
  const before = await board();
  await answer({ say: 'I’ve dropped it.', dropPlan: true });
  await send('forget about it');
  await settle(page, 800);
  assert.deepStrictEqual((await plans()).at(-1)?.head, 'Cancelled · nothing changed');
  assert.strictEqual((await rows()).at(-1)?.text, 'I’ve dropped it.');
  assert.strictEqual(await board(), before, 'the board is as it was');
});

await check('a typed yes is Do it, and a typed no is Cancel, with no request to Claude', async () => {
  await answer({ say: 'Never sent.' });
  await eleven();
  await send('Yes!');
  await settle(page, 800);
  assert.strictEqual(JSON.parse(await sent()).length, 0, 'nothing is asked');
  assert.deepStrictEqual(
    (await rows()).slice(-3).map(r => [r.who, r.text]),
    [
      ['myra', LEAD],
      ['me', 'Yes!'],
      ['myra', 'Here are eleven.'],
    ],
    'their yes, then her line',
  );
  assert.strictEqual((await plans()).at(-1)?.head, 'Done');
  assert.match(await board(), /Idea 11/, 'the plan landed');
  await eleven();
  const before = await board();
  await send('never mind');
  await settle(page, 600);
  assert.strictEqual((await plans()).at(-1)?.head, 'Cancelled · nothing changed');
  assert.strictEqual(await board(), before);
  assert.strictEqual(JSON.parse(await sent()).length, 0, 'still nothing is asked');
});

await check('Change the plan puts them in her input, which says what writing there does', async () => {
  const hint = () => page.evaluate(() => document.querySelector<HTMLTextAreaElement>('#mcInput')?.placeholder);
  await eleven();
  await page.evaluate(() => document.querySelector<HTMLElement>('#mcInput')?.blur());
  await page.locator('#mcList .m-acts button:text-is("Change the plan")').click();
  assert.strictEqual(await page.evaluate(() => document.activeElement?.id), 'mcInput');
  assert.strictEqual(await hint(), 'Tell Myra what to change…');
  assert.deepStrictEqual((await plans()).at(-1)?.acts, WAITING, 'nothing is sent');
  await page.locator('#mcList .m-acts button:text-is("Cancel")').click();
  assert.notStrictEqual(await hint(), 'Tell Myra what to change…', 'and the input reads as before once it ends');
});

await l.close();
if (failed.length) {
  console.log(`\n${failed.length} failed`);
  process.exit(1);
}
console.log('PLAN TALK OK');
