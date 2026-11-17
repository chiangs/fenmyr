// A reply that arrives while the person drags a card or types a name lands as it would once they let go: a dragged card
// takes her words where they drop it, a dragged collection or one whose name they are typing takes the cards she files
// into it, and a reply for a board no longer open is left, with her saying why, even one that could not be applied.
import assert from 'node:assert';
import { replyBoard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';

const BOARDS = ['drag', 'dragColl', 'name', 'column', 'gone', 'asked', 'other'];
// with plans skipped her removals land at once too, as these checks time
const l = await launch({
  boards: BOARDS.map(id => replyBoard(id, id)),
  open: 'drag',
  claude: true,
  settings: { skipPlans: true },
});
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
// asked the real way, with Claude's answer arriving `ms` later; settles once it has landed
const answered = (reply: object, ms: number) =>
  page.evaluate(
    async ([r, ms]) => {
      window.Fenmyr.ask = async () => {
        await new Promise(res => setTimeout(res, ms));
        return JSON.stringify(r);
      };
      await window.__fenmyr.ask('q');
    },
    [reply, ms] as const,
  );
// grabs it near its left end, holds it mid-move while her answer arrives, then moves it on and drops it
async function dragThrough(selector: string) {
  await page.waitForTimeout(200);
  const box = await page.locator(selector).boundingBox();
  assert(box, `${selector} is on screen`);
  const x = box.x + 16,
    y = box.y + Math.min(box.height / 2, 14);
  assert(
    await page.evaluate(([s, x, y]) => !!document.elementFromPoint(x, y)?.closest(s), [selector, x, y] as const),
    `nothing covers ${selector}`,
  );
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 30, y + 30, { steps: 6 });
  await page.waitForTimeout(1200);
  await page.mouse.move(x + 150, y + 200, { steps: 8 });
  await page.mouse.up();
}
const kidsOf = (id: string) =>
  page.evaluate(id => {
    const b = window.__fenmyr.curBoard(),
      coll = b.cards.find(c => c.id === id);
    return (coll?.type === 'coll' ? coll.kids : []).map(k => {
      const c = b.cards.find(x => x.id === k);
      return c?.type === 'note' ? c.text : k;
    });
  }, id);
async function typeInto(selector: string, words: string) {
  await page.locator(selector).dblclick();
  await page.keyboard.press('End');
  await page.keyboard.type(words);
}

await check('a card dragged while her reply arrives takes her words and colour, where they drop it', async () => {
  const asked = answered({ say: 'ok', edit: [{ id: 'n2', text: 'Reworded second', color: 'pink' }] }, 800);
  await dragThrough('#cards .card[data-id="n2"]');
  await asked;
  const n2 = await page.evaluate(() => {
    const c = window.__fenmyr.curBoard().cards.find(x => x.id === 'n2');
    return c?.type === 'note' ? { text: c.text, color: c.color, x: c.x } : null;
  });
  assert.deepStrictEqual([n2?.text, n2?.color], ['Reworded second', 'pink'], 'her words and colour');
  assert(n2 && n2.x > 400, 'where they dropped it');
});

await check('a collection dragged while her reply arrives takes the note she files into it', async () => {
  await open('dragColl');
  const asked = answered({ say: 'ok', add: [{ text: 'Into ideas', in: 'ideas' }] }, 800);
  await dragThrough('#cards .card[data-id="ideas"] .coll-head');
  await asked;
  const at = await page.evaluate(() => window.__fenmyr.curBoard().cards.find(c => c.id === 'ideas')?.x);
  assert(at !== undefined && at > 900, 'the collection is where they dropped it');
  assert.deepStrictEqual(await kidsOf('ideas'), ['A picnic', 'Into ideas'], 'with her note in it');
});

await check(
  "typing a collection's name while she files cards into it: they land in it, and the name is theirs",
  async () => {
    await open('name');
    const asked = answered(
      { say: 'ok', add: [{ text: 'Filed into ideas', in: 'ideas' }], edit: [{ id: 'n1', in: 'ideas' }] },
      1200,
    );
    await typeInto('#cards .card[data-id="ideas"] .coll-head .text', ' too');
    await asked;
    assert.deepStrictEqual(await kidsOf('ideas'), ['A picnic', 'Filed into ideas', 'First note'], 'both are in it');
    const seen = await page.evaluate(() => ({
      editing: window.__fenmyr.editing,
      name: window.__fenmyr.curBoard().cards.find(c => c.id === 'ideas')?.text,
    }));
    assert.deepStrictEqual(seen, { editing: 'ideas', name: 'Ideas too' }, 'and they are still typing its name');
    await page.keyboard.press('Escape');
  },
);

await check("typing a kanban column's name while she adds a card to it: the card lands in that column", async () => {
  await open('column');
  const asked = answered({ say: 'ok', add: [{ text: 'New task', in: 'kb', column: 1 }] }, 1200);
  await page.locator('#cards .card[data-id="kb"] .kb-h .text').nth(1).dblclick();
  await page.keyboard.type('Doing now');
  await asked;
  const seen = await page.evaluate(() => {
    const b = window.__fenmyr.curBoard(),
      kb = b.cards.find(c => c.id === 'kb'),
      made = b.cards.find(c => c.type === 'note' && c.text === 'New task');
    return { editing: window.__fenmyr.editing, column: made && kb?.type === 'coll' ? kb.colOf?.[made.id] : null };
  });
  assert.deepStrictEqual(seen, { editing: 'kb', column: 1 }, 'in the column, with its name still being typed');
  await page.keyboard.press('Escape');
});

await check('typing in a card whose collection she removes: the collection goes, and the card stays', async () => {
  await open('gone');
  const asked = answered({ say: 'ok', remove: ['kb'] }, 1200);
  await typeInto('#cards .card[data-id="k1"] .text', ' today');
  await asked;
  const seen = await page.evaluate(() => {
    const b = window.__fenmyr.curBoard();
    return {
      kb: b.cards.some(c => c.id === 'kb'),
      k1: b.cards.some(c => c.id === 'k1'),
      editing: window.__fenmyr.editing,
    };
  });
  assert.deepStrictEqual(seen, { kb: false, k1: true, editing: 'k1' });
  await page.keyboard.press('Escape');
});

await check(
  'a reply for a board no longer open is left as it was, with her saying so, even one that fails',
  async () => {
    await open('asked');
    await page.evaluate(() => {
      const c = document.createElement('canvas');
      window.Fenmyr.fetchImage = () => new Promise<string>(res => setTimeout(() => res(c.toDataURL()), 1500));
    });
    const lost = page.evaluate(() =>
      window.__fenmyr
        // @ts-expect-error a connection the reply check would never let through, so planning it throws
        .applyMyra({ say: 'boom', add: [{ text: 'Lost' }], images: [{ url: 'a' }], connect: [null] }, 'q')
        .then(
          r => r,
          e => String(e),
        ),
    );
    await page.waitForTimeout(300);
    await open('other');
    assert.strictEqual(await lost, null, 'nothing is applied');
    const said = await page.evaluate(() =>
      [...document.querySelectorAll('#mcList .mc-msg:not(.me)')].map(m => m.textContent ?? '').at(-1),
    );
    assert.match(said ?? '', /another board/i, 'she says why');
  },
);

const errors = [...l.errors];
await l.close();
assert.deepStrictEqual(errors, [], 'no page errors');
assert.deepStrictEqual(failed, [], 'checks that failed');
console.log('REPLY WHILE BUSY OK');
