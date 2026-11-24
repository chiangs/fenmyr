// A saved model the host no longer lists, in the real app, through a stand-in Claude Code that records its arguments.
// Myra clears the choice and says so once, in her own words, naming the model; she runs on Claude Code's default and
// never picks another. An answer that says nothing about the model (none, an empty list, a provider with no models)
// clears nothing, and the check runs before a call to Claude Code goes out even when the chat was never opened.
import assert from 'node:assert';
import { replyBoard } from './fixtures/boards.ts';
import { askStandIn, flagsOf } from './support/askStandIn.ts';
import { launch } from './support/launch.ts';
import { still } from './support/settled.ts';

type Answer = 'real' | 'fails' | 'empty' | 'bare' | 'short';
declare global {
  interface Window {
    // how this test has the host answer Fenmyr.models, and how many answers it has given since it last changed
    __asked?: { how: Answer; answered: number };
  }
}

const GONE = { provider: 'claude-code', id: 'claude-gone-1', effort: 'high' };
const SONNET = { provider: 'claude-code', id: 'claude-sonnet-5-5', effort: 'high' };
const NO_FLAGS = { model: undefined, effort: undefined };
// a part left out is Default: it is neither looked for in the host's list nor sent
const MODEL_ONLY = { provider: 'claude-code', id: 'claude-sonnet-5-5' };
const EFFORT_ONLY = { provider: 'claude-code', effort: 'high' };
const lineFor = (id: string) =>
  `I couldn’t find ${id} any more, so I’m using Claude Code’s default until you pick another.`;

async function start(myraModel: unknown) {
  const l = await launch({
    boards: [replyBoard('gone', 'Gone')],
    open: 'gone',
    claude: true,
    settings: { chatKeep: 'board', myraModel },
  });
  const { page } = l;
  const { sentFor, sentAbout, send } = askStandIn(l);
  // the host's real answer, shaped as each case needs it
  await page.evaluate(() => {
    const real = window.Fenmyr.models,
      asked: NonNullable<Window['__asked']> = { how: 'real', answered: 0 };
    window.__asked = asked;
    window.Fenmyr.models = async () => {
      try {
        if (asked.how === 'fails') throw new Error('The host did not answer.');
        if (asked.how === 'empty') return [];
        const lists = await real();
        if (asked.how === 'bare') return lists.map(p => ({ ...p, models: [] }));
        if (asked.how === 'short')
          return lists.map(p => ({
            ...p,
            models: p.models.map(m => ({ ...m, efforts: m.efforts.filter(e => e === 'low' || e === 'medium') })),
          }));
        return lists;
      } finally {
        asked.answered++;
      }
    };
  });
  const answer = (how: Answer) =>
    page.evaluate(how => {
      if (window.__asked) Object.assign(window.__asked, { how, answered: 0 });
    }, how);
  // once the host has been asked, the page has had the microtasks that act on the answer, since polling comes after them
  const answered = () => page.waitForFunction(() => (window.__asked?.answered ?? 0) > 0);
  const saved = () =>
    page.evaluate(() => {
      const raw: unknown = JSON.parse(localStorage.getItem('fenmyr:settings') ?? '{}');
      return typeof raw === 'object' && raw !== null && 'myraModel' in raw ? raw.myraModel : null;
    });
  const pill = () => page.evaluate(() => document.getElementById('mcModelText')?.textContent ?? null);
  const open = async () => {
    await page.click('#mPill');
    await page.waitForFunction(() => document.getElementById('myra')?.classList.contains('chat'));
    await still(page);
  };
  const close = async () => {
    await page.click('#mcClose');
    await page.waitForFunction(() => !document.getElementById('myra')?.classList.contains('chat'));
  };
  // her lines about a model she couldn't find, among all the lines in the board's chat, shown or not
  const said = () =>
    page.evaluate(() =>
      (window.__fenmyr.curBoard().chat ?? [])
        .filter(m => m.who === 'myra' && m.text.includes('couldn’t find'))
        .map(m => m.text),
    );
  const shown = () => page.locator('#mcList .mc-msg.myra', { hasText: 'couldn’t find' }).count();
  async function ask(q: string) {
    const before = await page.locator('#mcList .mc-msg.myra').count();
    await send(q);
    const run = await sentFor(q);
    await page.waitForFunction(
      n =>
        document.querySelectorAll('#mcList .mc-msg.myra').length > n &&
        !document.querySelector('#mcList .mc-msg.typing'),
      before,
    );
    return flagsOf(run.args);
  }
  return { l, page, sentAbout, answer, answered, saved, pill, open, close, said, shown, ask };
}

async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}

{
  const t = await start(GONE);
  const { page } = t;
  assert.deepStrictEqual(await t.saved(), GONE, 'the stale choice was seeded');

  await check('an answer that says nothing about the model clears nothing, and the next open asks again', async () => {
    for (const how of ['fails', 'empty', 'bare'] as const) {
      await t.answer(how);
      await t.open();
      await t.answered();
      assert.deepStrictEqual(await t.saved(), GONE, `${how}: the choice is kept`);
      assert.strictEqual(await t.pill(), 'claude-gone-1 High', `${how}: the pill still reads the saved id`);
      assert.deepStrictEqual(await t.said(), [], `${how}: Myra says nothing`);
      await t.close();
    }
  });

  await check('when the chat first opens, a model the host no longer lists is cleared and she says so', async () => {
    await t.answer('real');
    await t.open();
    await t.answered();
    await page.locator('#mcList .mc-msg.myra', { hasText: 'couldn’t find' }).waitFor();
    assert.deepStrictEqual(await t.said(), [lineFor('claude-gone-1')], 'her line names the saved id');
    assert.strictEqual(await t.shown(), 1, 'and is in the chat');
    assert.strictEqual(await t.saved(), null, 'the choice is gone from the saved settings');
    assert.strictEqual(await t.pill(), 'Default');
  });

  await check('she runs on Claude Code’s default and says it once, however many messages follow', async () => {
    assert.deepStrictEqual(await t.ask('first'), NO_FLAGS, 'no --model and no --effort');
    assert.deepStrictEqual(await t.ask('second'), NO_FLAGS);
    assert.strictEqual(await t.pill(), 'Default', 'she picked no other model');
    assert.strictEqual(await t.shown(), 1, 'the line was not said again');
    await t.close();
    await t.open();
    assert.strictEqual(await t.shown(), 1, 'nor when the chat is opened again');
    assert.strictEqual((await t.said()).length, 1, 'in the chat or behind it');
  });

  await check('after a reload the choice is still gone and nothing is said again', async () => {
    const settings = await page.evaluate(() => localStorage.getItem('fenmyr:settings'));
    assert(settings, 'the settings were saved');
    // the launch's own script resets the settings at every load, so a later one puts the saved ones back
    await t.l.app.context().addInitScript(s => {
      try {
        localStorage.setItem('fenmyr:settings', s);
      } catch {}
    }, settings);
    await page.reload();
    await page.waitForFunction(() => window.__fenmyr?.curBoard() && document.querySelector('#cards .card'));
    await t.open();
    assert.strictEqual(await t.pill(), 'Default');
    assert.strictEqual(await t.saved(), null);
    assert.strictEqual((await t.said()).length, 1, 'still the one line');
    assert.deepStrictEqual(await t.ask('third'), NO_FLAGS);
  });
  assert.deepStrictEqual(t.l.errors, [], 'no page errors');
  await t.l.close();
}

{
  const t = await start(SONNET);
  const { page } = t;
  await check('a model and effort the host still lists are left alone, and the next message carries them', async () => {
    await t.open();
    await t.answered();
    assert.deepStrictEqual(await t.saved(), SONNET);
    assert.strictEqual(await t.pill(), 'Sonnet 5.5 High');
    assert.deepStrictEqual(await t.said(), []);
    assert.deepStrictEqual(await t.ask('hello'), { model: 'claude-sonnet-5-5', effort: 'high' });
    assert.strictEqual(await page.locator('#mcList .mc-msg.myra', { hasText: 'couldn’t find' }).count(), 0);
  });
  assert.deepStrictEqual(t.l.errors, [], 'no page errors');
  await t.l.close();
}

{
  const t = await start(SONNET);
  const { page } = t;
  await check(
    'before a call goes out with the chat closed, an effort the model no longer lists is cleared',
    async () => {
      // the host's own list still has High, so a call that left with the choice would carry it
      await t.answer('short');
      await page.evaluate(
        () => void window.Fenmyr.rewrite('Hello there, rewrite me', 'shorter', 'T', 'around').catch(() => undefined),
      );
      assert.deepStrictEqual(
        flagsOf((await t.sentAbout('Hello there, rewrite me')).args),
        NO_FLAGS,
        'the rewrite left without the model',
      );
      assert.strictEqual(await t.saved(), null);
      assert.deepStrictEqual(await t.said(), [lineFor('claude-sonnet-5-5')], 'she said so, in the chat she keeps');
      assert.strictEqual(
        await page.evaluate(() => document.getElementById('myra')?.classList.contains('chat')),
        false,
        'with the chat still closed',
      );
      await t.open();
      assert.strictEqual(await t.shown(), 1, 'and it is there when the chat opens, once');
      assert.strictEqual(await t.pill(), 'Default');
    },
  );
  assert.deepStrictEqual(t.l.errors, [], 'no page errors');
  await t.l.close();
}

{
  const t = await start(EFFORT_ONLY);
  await check('an effort alone has no model to be gone, so it is kept and sent on its own', async () => {
    await t.open();
    await t.answered();
    assert.deepStrictEqual(await t.saved(), EFFORT_ONLY);
    assert.strictEqual(await t.pill(), 'Default High');
    assert.deepStrictEqual(await t.said(), []);
    assert.deepStrictEqual(await t.ask('hello'), { model: undefined, effort: 'high' });
  });
  assert.deepStrictEqual(t.l.errors, [], 'no page errors');
  await t.l.close();
}

{
  const t = await start(MODEL_ONLY);
  const { page } = t;
  await check('a model alone is not cleared when the model stops listing an effort it never had', async () => {
    await t.answer('short');
    await page.evaluate(
      () => void window.Fenmyr.rewrite('Hello there, rewrite me', 'shorter', 'T', 'around').catch(() => undefined),
    );
    assert.deepStrictEqual(
      flagsOf((await t.sentAbout('Hello there, rewrite me')).args),
      { model: 'claude-sonnet-5-5', effort: undefined },
      'the rewrite left on the model alone',
    );
    assert.deepStrictEqual(await t.saved(), MODEL_ONLY);
    assert.deepStrictEqual(await t.said(), []);
  });
  assert.deepStrictEqual(t.l.errors, [], 'no page errors');
  await t.l.close();
}

{
  const t = await start({ ...MODEL_ONLY, id: 'claude-gone-1' });
  await check('a model alone that the host no longer lists is cleared and she says so', async () => {
    await t.open();
    await t.answered();
    await t.l.page.locator('#mcList .mc-msg.myra', { hasText: 'couldn’t find' }).waitFor();
    assert.deepStrictEqual(await t.said(), [lineFor('claude-gone-1')]);
    assert.strictEqual(await t.saved(), null);
    assert.strictEqual(await t.pill(), 'Default');
    assert.deepStrictEqual(await t.ask('hello'), NO_FLAGS);
  });
  assert.deepStrictEqual(t.l.errors, [], 'no page errors');
  await t.l.close();
}

console.log('MODEL GONE OK');
