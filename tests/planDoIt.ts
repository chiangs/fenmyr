// Do it on a plan the person worked around while it waited: a collection they dragged still takes the cards she files
// into it, words they just typed into the open doc stay theirs, a card they changed or connected since stays as they
// have it and she says so, and her count and glow cover only what landed. A part of her reply that fails once the board
// has changed costs only itself, a failure after that keeps the board, Done and Undo, and one that fails while the
// board takes it leaves the board as it was, with the plan waiting again.
import assert from 'node:assert';
import { replyBoard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';

const BOARDS = ['dragged', 'doc', 'count', 'linked', 'effect', 'after', 'throws'];
const l = await launch({ boards: BOARDS.map(id => replyBoard(id, id)), open: 'dragged', claude: true });
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
async function open(id: string) {
  await page.waitForTimeout(500);
  await page.evaluate(id => window.__fenmyr.openBoard(id), id);
  await settle(page, 300);
}
// her reply, held as a plan: asked the real way, with Claude's answer counted
async function planned(reply: object) {
  await page.evaluate(async r => {
    Reflect.set(window, 'asked', 0);
    window.Fenmyr.ask = async () => {
      Reflect.set(window, 'asked', Number(Reflect.get(window, 'asked')) + 1);
      return JSON.stringify(r);
    };
    await window.__fenmyr.ask('q');
  }, reply);
  await settle(page, 400);
  assert.strictEqual(await page.locator('#mcList .m-summary.plan.waiting').count(), 1, 'it waits as a plan');
}
const chat = () => page.evaluate(() => document.getElementById('mPill')?.click());
const DO_IT = '#mcList .m-acts button:text-is("Do it")';
async function doIt() {
  await page.click(DO_IT);
  await settle(page, 800);
  assert.strictEqual(await page.evaluate(() => Number(Reflect.get(window, 'asked'))), 1, 'Do it asks Claude nothing');
}
const said = () =>
  page.evaluate(() => [...document.querySelectorAll('#mcList .mc-msg.myra')].at(-1)?.firstChild?.textContent);
const card = (id: string) =>
  page.evaluate(id => {
    const c = window.__fenmyr.curBoard().cards.find(x => x.id === id);
    return c && { x: c.x, y: c.y, text: 'text' in c ? c.text : undefined, kids: c.type === 'coll' ? c.kids : [] };
  }, id);
const notes = (n: number, more: object = {}) =>
  Array.from({ length: n }, (_, i) => ({ type: 'note', text: `Idea ${i + 1}`, ...more }));

await check(
  'a collection they dragged since the plan takes the cards she files into it, where they put it',
  async () => {
    await chat();
    await planned({ say: 'Filed eleven ideas.', add: notes(11, { in: 'ideas' }) });
    await page.keyboard.press('Escape');
    const box = await page.locator('#cards .card[data-id="ideas"]').boundingBox();
    assert(box, 'Ideas is on screen');
    await page.mouse.move(box.x + 30, box.y + 12);
    await page.mouse.down();
    await page.mouse.move(box.x + 130, box.y + 212, { steps: 8 });
    await page.mouse.up();
    await settle(page, 400);
    const dropped = await card('ideas');
    assert.notDeepStrictEqual([dropped?.x, dropped?.y], [900, 0], 'they moved it');
    await chat();
    await doIt();
    const after = await card('ideas');
    assert.deepStrictEqual([after?.x, after?.y], [dropped?.x, dropped?.y], 'it stays where they put it');
    assert.strictEqual(after?.kids.length, 12, 'and holds her eleven as well as its own');
    assert.strictEqual(await said(), 'Filed eleven ideas.', 'with nothing left out');
  },
);

await check('Do it with the doc they are writing in open keeps the words they just typed', async () => {
  await open('doc');
  await chat();
  await planned({ say: 'Rewrote the plan.', edit: [{ id: 'd1', body: 'Her new draft' }], remove: ['n4'] });
  await page.locator('#cards [data-id="d1"]').dblclick();
  await page.waitForSelector('.dv-prose');
  // typed, then Do it at once, before the editor has written to its card
  await page.evaluate(() => {
    window.__fenmyr.docEditor().chain().insertContent(' and their line').run();
    document.querySelector<HTMLElement>('#mcList .m-acts button:not(.ghost)')?.click();
  });
  await settle(page, 1000);
  const words = await page.evaluate(() => ({
    editor: window.__fenmyr.docEditor().getText(),
    card: window.__fenmyr.curBoard().cards.find(c => c.id === 'd1'),
  }));
  assert.match(words.editor, /and their line/, 'the editor keeps their words');
  assert(words.card?.type === 'doc' && /and their line/.test(words.card.body ?? ''), 'and so does the card');
  assert(words.card?.type === 'doc' && !/Her new draft/.test(words.card.body ?? ''), 'her draft is not put over them');
  assert.strictEqual(await card('n4'), undefined, 'the rest of the plan lands');
  assert.match((await said()) ?? '', /I left “Plan” as you have it, since it changed after my plan\.$/);
});

await check('after Do it her count and glow cover only the cards that landed', async () => {
  await open('count');
  await chat();
  const named = ['n1', 'n2', 'n3', 'n4', 'k1', 'k2', 'i1', 't1', 'd1', 'kb', 'ideas'];
  await planned({
    edit: named.map(id => ({ id, text: `New words for ${id}` })),
    move: [{ id: 's1', x: 1200, y: 900 }],
  });
  await page.locator('#cards .card[data-id="n1"]').dblclick();
  await page.keyboard.press('End');
  await page.keyboard.type(' and theirs');
  await page.keyboard.press('Escape');
  await settle(page, 300);
  await page.click(DO_IT);
  await page.waitForSelector('#cards .card.just-made');
  const glow = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('#cards .card.just-made')].map(e => e.dataset.id ?? '').sort(),
  );
  assert.deepStrictEqual(glow, [...named.filter(id => id !== 'n1'), 's1'].sort(), 'the glow skips the card left');
  await settle(page, 600);
  assert.strictEqual(
    await said(),
    'Done! I touched 11 cards. I left “First note and theirs” as you have it, since it changed after my plan.',
  );
  assert.strictEqual((await card('n1'))?.text, 'First note and theirs', 'their words stay');
});

await check(
  'a card the plan removes but they connected since stays with both connectors, and she says so',
  async () => {
    await open('linked');
    await chat();
    await planned({ say: 'Removed the third note.', remove: ['n3'] });
    await page.evaluate(() => {
      window.__fenmyr.curBoard().links.push({ id: 'L9', a: 'n1', b: 'n3' });
      window.__fenmyr.renderAll();
    });
    await doIt();
    assert.deepStrictEqual(await card('n3'), { x: 520, y: 500, text: 'Third note', kids: [] }, 'the card stays');
    const links = await page.evaluate(() => window.__fenmyr.curBoard().links.map(x => x.id));
    assert.deepStrictEqual(links.filter(id => id === 'L2' || id === 'L9').sort(), ['L2', 'L9'], 'with both connectors');
    assert.strictEqual(
      await said(),
      'Removed the third note. I left “Third note” as you have it, since it changed after my plan.',
    );
  },
);

await check(
  'a template save that fails after Do it keeps the board changes and Undo, and she says what failed',
  async () => {
    await open('effect');
    await chat();
    await planned({ say: 'Here they are.', add: notes(11), saveTemplate: { name: 'Week', fromNew: true } });
    await page.evaluate(() => {
      window.Fenmyr.saveTemplate = async () => {
        throw new Error('the disk is full');
      };
    });
    await doIt();
    assert.strictEqual(await said(), 'Here they are. I couldn’t save the template “Week”: the disk is full.');
    const under = await page.evaluate(() => {
      const m = [...document.querySelectorAll('#mcList .mc-msg.myra')].at(-1);
      return [
        m?.querySelector('.m-summary b')?.textContent,
        [...(m?.querySelectorAll('.m-acts button:not(.next)') ?? [])].map(b => b.textContent),
      ];
    });
    assert.deepStrictEqual(under, ['Changed on the board', ['Show on board', 'Undo']], 'with what changed and Undo');
    assert.strictEqual(
      await page.evaluate(
        () => window.__fenmyr.curBoard().cards.filter(c => c.type === 'note' && /^Idea /.test(c.text ?? '')).length,
      ),
      11,
      'the cards stay',
    );
    assert.strictEqual(await page.locator('#mcList .m-summary.plan.done').count(), 1, 'and the plan reads Done');
  },
);

await check('a failure after the board took the plan keeps it, with Done and Undo, and she says so', async () => {
  await open('after');
  await chat();
  await planned({ say: 'Here are eleven.', add: notes(11) });
  // her line's "Changed on the board" box fails to draw once, after the board has taken the plan
  await page.evaluate(() => {
    const real = Node.prototype.appendChild;
    let armed = true;
    Node.prototype.appendChild = function <T extends Node>(this: Node, child: T): T {
      if (armed && child instanceof HTMLElement && child.matches('.m-summary:not(.plan)')) {
        armed = false;
        throw new Error('drawing failed');
      }
      return Reflect.apply(real, this, [child]);
    };
  });
  await doIt();
  assert.strictEqual(
    await page.evaluate(
      () => window.__fenmyr.curBoard().cards.filter(c => c.type === 'note' && /^Idea /.test(c.text ?? '')).length,
    ),
    11,
    'the board keeps the plan',
  );
  assert.strictEqual(await page.locator('#mcList .m-summary.plan.done').count(), 1, 'which reads Done');
  assert.strictEqual(
    await page.locator('#mcList .m-acts button:text-is("Undo")').count(),
    1,
    'with Undo under her line',
  );
  assert.strictEqual(
    await said(),
    'I’ve made the changes on the board, and Undo puts them back, but something after that went wrong.',
  );
});

await check('Do it that fails part way puts the board back, and the plan waits to be tried again', async () => {
  await open('throws');
  await chat();
  await planned({ say: 'Removed the third note.', remove: ['n3'] });
  const lists = () =>
    page.evaluate(() => {
      const b = window.__fenmyr.curBoard();
      return JSON.stringify({ cards: b.cards, links: b.links, tray: b.tray, trayLinks: b.trayLinks });
    });
  const before = await lists();
  // drawing fails once the board has taken the plan
  await page.evaluate(() => {
    const real = Element.prototype.remove;
    Reflect.set(window, 'realRemove', real);
    Element.prototype.remove = function () {
      if (this instanceof HTMLElement && this.classList.contains('card')) throw new Error('drawing failed');
      real.call(this);
    };
  });
  await doIt();
  await page.evaluate(() => {
    const real = Reflect.get(window, 'realRemove');
    if (typeof real === 'function') Element.prototype.remove = real;
  });
  assert.strictEqual(await lists(), before, 'the board is as it was');
  assert.strictEqual(
    await said(),
    'Something went wrong part way, so I’ve put the board back as it was. The plan is still here if you want to try again.',
  );
  assert.strictEqual(await page.locator('#mcList .m-summary.plan.waiting').count(), 1, 'the plan waits again');
  await doIt();
  assert.strictEqual(await card('n3'), undefined, 'and Do it lands it');
});

await l.close();
if (failed.length) {
  console.log(`\n${failed.length} failed`);
  process.exit(1);
}
console.log('PLAN DO IT OK');
