// Myra answers what just happened with a face, each through the path the person takes: ticking off the last item of a
// checklist (confetti for a long one), deleting five cards at once (not four, and not a cut), Do it and Cancel on a
// plan, a question that fails, a build that is built or stops, and a long quiet spell, where she dozes until someone
// comes back. Calm mode, the system's reduce motion and an animation already playing keep her still, and a repeated
// action doesn't replay its reaction.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { replyBoard } from './fixtures/boards.ts';
import { buildStandIn } from './support/buildStandIn.ts';
import { launch } from './support/launch.ts';
import { freshRepo } from './support/prototype.ts';
import { still } from './support/settled.ts';

const { repo } = freshRepo('fenmyr-reactions-');
fs.mkdirSync(path.join(repo, 'prototypes'));
fs.writeFileSync(path.join(repo, 'prototypes', 'design.md'), 'x\n');

const base = { x: 0, y: 0, w: 220, h: 140, r: 0, color: 'white' };
const todo = (id: string, x: number, n: number) => ({
  ...base,
  id,
  type: 'todo',
  x,
  y: 400,
  h: 60 + n * 28,
  items: Array.from({ length: n }, (_, i) => ({ t: `Step ${i + 1}`, done: i < n - 1 })),
});
const notes = (prefix: string, n: number, y: number) =>
  Array.from({ length: n }, (_, i) => ({ ...base, id: `${prefix}${i}`, type: 'note', x: i * 60, y, text: prefix }));
const board = {
  id: 'b',
  name: 'Reactions',
  cards: [
    todo('short', 0, 3),
    todo('long', 260, 10),
    todo('again', 520, 2),
    ...notes('del', 5, -600),
    ...notes('few', 4, -800),
    ...notes('cut', 5, -1000),
    ...notes('calm', 5, -1200),
  ],
  links: [],
  tray: [],
  view: { x: 400, y: 200, z: 1 },
};
const l = await launch({ boards: [board, replyBoard('plan', 'Plan')], open: 'b', claude: true });
const { page } = l;
const standIn = buildStandIn(l);

const failed: string[] = [];
async function check(name: string, run: () => Promise<void>) {
  try {
    await page.evaluate(() => {
      window.__fenmyr.stopAnim();
      window.__fenmyr.forgetReactions();
    });
    await run();
    console.log(`ok    ${name}`);
  } catch (e) {
    failed.push(name);
    console.log(`FAIL  ${name}: ${e instanceof Error ? e.message : e}`);
  }
}
const reaction = () => page.evaluate(() => window.__fenmyr.lastReaction());
const pose = () => page.evaluate(() => window.__fenmyr.currentPose());
// the reaction the last step brought, once it has come
const reacted = async (name: string) => {
  await page.waitForFunction(n => window.__fenmyr.lastReaction().name === n, name, { timeout: 15000 }).catch(() => {});
  assert.strictEqual((await reaction()).name, name, `she reacts with ${name}`);
};
// a step that should bring nothing: its handler runs before the next frame
const none = async () => {
  await still(page);
  assert.strictEqual((await reaction()).name, '', 'she lets it pass');
};
const tick = (id: string) => page.click(`#cards .card[data-id="${id}"] li:last-child input`);
async function remove(ids: string[], key: string) {
  // off the checkbox a check before may have left focused, where the keys type rather than delete
  await page.evaluate(ids => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.__fenmyr.selectOnly(ids);
  }, ids);
  await page.keyboard.press(key);
  await page.waitForFunction(ids => !document.querySelector(`#cards .card[data-id="${ids[0]}"]`), ids);
}
const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
const DO_IT = '#mcList .m-acts button:text-is("Do it")';
const CANCEL = '#mcList .m-acts button:text-is("Cancel")';
async function planned() {
  await page.evaluate(async () => {
    window.Fenmyr.ask = async () =>
      JSON.stringify({
        say: 'Filed eleven ideas.',
        add: Array.from({ length: 11 }, (_, i) => ({ type: 'note', text: `Idea ${i + 1}` })),
      });
    await window.__fenmyr.ask('q');
  });
  await page.locator('#mcList .m-summary.plan.waiting').waitFor();
}

try {
  await check('ticking off the last item of a checklist makes her happy', async () => {
    await tick('short');
    await reacted('happy');
    assert.strictEqual(await pose(), 'happy', 'her face is happy');
  });

  await check('unticking and ticking it off again soon after brings nothing more', async () => {
    // the list is finished from the check before: untick, tick, and again
    await tick('short');
    await tick('short');
    await reacted('happy');
    const first = await reaction();
    await page.evaluate(() => window.__fenmyr.stopAnim());
    await tick('short');
    await tick('short');
    await still(page);
    assert.deepStrictEqual(await reaction(), first, 'the same reaction, not a new one');
  });

  await check('a long checklist finished brings confetti', async () => {
    await tick('long');
    await reacted('party');
  });

  await check('deleting five cards at once startles her', async () => {
    await remove(ids('del', 5), 'Delete');
    await reacted('shook');
    assert.strictEqual(await pose(), 'shook', 'her face is shook');
  });

  await check('four cards, or a cut of five, bring nothing', async () => {
    await remove(ids('few', 4), 'Delete');
    await remove(ids('cut', 5), 'Control+x');
    await none();
  });

  await check('calm mode keeps her still', async () => {
    await page.evaluate(() => {
      window.myraCalm = true;
    });
    try {
      await tick('again');
      await none();
    } finally {
      await page.evaluate(() => {
        window.myraCalm = false;
      });
    }
  });

  await check('the system’s reduce motion keeps her still', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    try {
      await remove(ids('calm', 5), 'Delete');
      await none();
    } finally {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
    }
  });

  await check('an animation already playing isn’t cut short by one', async () => {
    await page.evaluate(() => window.__fenmyr.playAnim('dizzy', false));
    await tick('again');
    await tick('again');
    await none();
    assert.strictEqual(await pose(), 'dizzy', 'she is still dizzy');
  });

  await check('a long quiet spell sends her to sleep until someone comes back', async () => {
    await page.evaluate(() => window.__fenmyr.bdActive(16 * 60000));
    assert.strictEqual(await page.evaluate(() => window.__fenmyr.dozeCheck()), 'sleepy', 'she dozes off');
    // sleeps on purpose: past the 4.5 s her sleepy animation lasts when asked for, so a doze that ended by itself shows
    await page.waitForTimeout(5000);
    assert.strictEqual(await pose(), 'sleepy', 'she stays asleep while no one is there');
    await page.mouse.move(300, 300);
    await page.mouse.move(320, 320);
    await page.waitForFunction(() => window.__fenmyr.currentPose() === null);
  });

  await check('Do it on a plan makes her happy, and Cancel makes her sigh', async () => {
    await page.evaluate(() => window.__fenmyr.openBoard('plan'));
    await page.evaluate(() => document.getElementById('mPill')?.click());
    await planned();
    await page.click(DO_IT);
    await reacted('happy');
    await page.evaluate(() => {
      window.__fenmyr.stopAnim();
      window.__fenmyr.forgetReactions();
    });
    await planned();
    await page.click(CANCEL);
    await reacted('sigh');
  });

  await check('a question that fails startles her', async () => {
    await page.evaluate(async () => {
      window.Fenmyr.ask = async () => {
        throw new Error('the line went quiet');
      };
      await window.__fenmyr.ask('anything');
    });
    await reacted('shook');
  });

  await check('a build that is built makes her happy, and one that stops startles her', async () => {
    await page.evaluate(async repo => {
      await window.Fenmyr.saveFolders({
        projects: [{ id: 'p1', name: 'Acme', open: true, repo: { path: repo } }],
        folders: [{ id: 'pf', name: 'Prototypes', project: 'p1', kind: 'prototyping', open: true }],
        order: {},
      });
      const proto = await window.Fenmyr.protoCreate({ root: repo, name: 'Checkout', stack: 'react' });
      await window.Fenmyr.save({
        id: 'pb',
        name: 'Checkout',
        folder: 'pf',
        kind: 'prototype',
        proto,
        cards: [],
        links: [],
        tray: [],
      });
      await window.__fenmyr.refreshBoards();
      await window.__fenmyr.openBoard('pb');
    }, repo);
    const build = () =>
      page.evaluate(() =>
        window.__fenmyr.applyMyra({ say: 'Writing it now.', build: { request: 'Make it' } }, 'build it'),
      );
    standIn.next({ files: { 'src/App.tsx': 'export const App = () => null;\n' }, reply: 'Built.' });
    await build();
    await reacted('happy');
    await page.evaluate(() => {
      window.__fenmyr.stopAnim();
      window.__fenmyr.forgetReactions();
    });
    standIn.next({ files: {}, fail: 'It broke.' });
    await build();
    await reacted('shook');
  });
} finally {
  await l.close();
}
assert.deepStrictEqual(failed, [], 'every check passes');
console.log('MYRA REACTIONS OK');
