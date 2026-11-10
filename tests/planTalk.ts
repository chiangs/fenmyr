// Talking to Myra while a plan waits. A message goes to her with the plan and the notes she read for it; an answer
// that changes the board replaces the plan, as a plan however small, words alone leave it waiting, and she can drop
// it, or read it as a yes and have it land as held. A plain yes or no typed answers it with no request to Claude, and
// an old button goes to her. Change the plan only puts them in her input. Just do it, clicked or typed, does Do it and
// turns on Skip plans, which lands big changes at once until it is turned off.
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
const WAITING = [':Do it', 'ghost:Change the plan', 'ghost:Cancel', 'ghost:Just do it'];
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
const ideas = () =>
  page.evaluate(
    () => window.__fenmyr.curBoard().cards.filter(c => c.type === 'note' && /^Idea /.test(c.text ?? '')).length,
  );

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
    assert.match(section, /only agrees to the plan as it stands, set "doPlan": true/, 'and how she agrees to it');
    assert.match(
      section,
      /To change the plan, .* with "say" written as if it is done/,
      'and words a changed plan as done',
    );
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

await check('her reading of their message as a yes lands the plan as held, after her words', async () => {
  const had = await ideas();
  await eleven();
  await answer({ say: 'Lovely, doing it now.', doPlan: true, add: notes(2) });
  await send('Looks good, go ahead');
  await settle(page, 800);
  assert.strictEqual(JSON.parse(await sent()).length, 1, 'only their message is asked');
  assert.deepStrictEqual(
    (await rows()).slice(-3).map(r => [r.who, r.text]),
    [
      ['me', 'Looks good, go ahead'],
      ['myra', 'Lovely, doing it now.'],
      ['myra', 'Here are eleven.'],
    ],
    'their words, hers, then the plan’s line',
  );
  assert.strictEqual((await plans()).at(-1)?.head, 'Done');
  assert.strictEqual(await ideas(), had + 11, 'the held plan landed, not anything she sent again');
});

await check(
  'an old "Yes" button while a plan waits goes to her with the plan, and does nothing by itself',
  async () => {
    await page.evaluate(() => window.__fenmyr.answerMyra({ say: 'Shall I tag them?', next: ['Yes', 'No'] }, 'tags?'));
    await settle(page, 400);
    const before = await board();
    await eleven();
    await answer({ say: 'Tags or the ideas? Tell me which.' });
    await page.locator('#mcList .m-acts button.next:text-is("Yes")').last().click();
    await settle(page, 800);
    const asked = JSON.parse(await sent());
    assert.strictEqual(asked.length, 1, 'it is asked');
    assert.deepStrictEqual(asked[0].plan?.steps, ['+ 13 cards'], 'with the plan');
    assert.deepStrictEqual((await plans()).at(-1)?.acts, WAITING, 'which still waits');
    assert.strictEqual(await board(), before, 'and nothing landed');
    await page.locator('#mcList .m-acts button:text-is("Cancel")').click();
  },
);

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

const skipping = () => page.evaluate(() => JSON.parse(localStorage.getItem('fenmyr:settings') ?? '{}').skipPlans);
const skipBox = 'input[data-set="skipPlans"]';

await check('Just do it does Do it and turns on Skip plans, so the next big change lands at once', async () => {
  await answer({ say: 'Never sent.' });
  const had = await ideas();
  await eleven();
  await page.locator('#mcList .m-acts button:text-is("Just do it")').click();
  await settle(page, 800);
  assert.strictEqual(await ideas(), had + 11, 'the plan landed');
  assert.strictEqual((await plans()).at(-1)?.head, 'Done');
  assert(
    (await rows()).some(
      r => r.text === 'From now on I’ll make big changes straight away. Settings → Myra brings plans back.',
    ),
    'she says so',
  );
  assert.strictEqual(await skipping(), true, 'Skip plans is on');
  assert.strictEqual(await page.locator(skipBox).isChecked(), true, 'and Settings shows it');
  const shown = (await plans()).length;
  await eleven();
  await settle(page, 600);
  assert.strictEqual(await ideas(), had + 22, 'the next big change lands at once');
  assert.strictEqual((await plans()).length, shown, 'with no plan');
  assert.strictEqual(JSON.parse(await sent()).length, 0, 'and nothing was asked');
});

await check('turning Skip plans off brings plans back, and a typed "just do it" turns it on again', async () => {
  await page.evaluate(sel => document.querySelector<HTMLInputElement>(sel)?.click(), skipBox);
  assert.strictEqual(await skipping(), false);
  const had = await ideas();
  await eleven();
  assert.strictEqual((await plans()).at(-1)?.head, 'If you say yes', 'a big change waits again');
  await send('Just do it');
  await settle(page, 800);
  assert.strictEqual(await ideas(), had + 11, 'the plan landed');
  assert.strictEqual(await skipping(), true, 'Skip plans is on');
  assert.strictEqual(JSON.parse(await sent()).length, 0, 'with no request to Claude');
});

await l.close();
if (failed.length) {
  console.log(`\n${failed.length} failed`);
  process.exit(1);
}
console.log('PLAN TALK OK');
