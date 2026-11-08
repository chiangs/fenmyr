// Under a reply that changed the board, in the real app: "Changed on the board" lists what it did, Show on board
// selects and frames it, and Undo takes the whole reply back as one Ctrl+Z step, leaving cards the person changed
// since and naming them. All of it comes back when the chat reopens; Undo goes once the board is opened again while
// Show on board stays; her bubble shows the same with the chat closed.
import assert from 'node:assert';
import type { Page } from 'playwright';
import { replyBoard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';

const BOARDS = ['acts', 'away', 'bubble', 'back', 'drawn', 'twice', 'out'];
const l = await launch({ boards: BOARDS.map(id => replyBoard(id, id)), open: 'acts', claude: true });
const { page } = l;

const REPLY = {
  collections: [{ name: 'Phases', kanban: true, columns: ['To do', 'Doing', 'Done'] }],
  edit: [
    { id: 't1', in: 'Phases' },
    { id: 'd1', in: 'Phases' },
    { id: 'n3', in: 'Phases' },
    { id: 'n1', text: 'First, reworded' },
    { id: 'n2', text: 'Second, reworded' },
  ],
  remove: ['n4'],
  next: ['Name the columns'],
};
const LINES = ['+ 1 kanban, Phases, with 3 columns and 3 cards', '✎ 2 notes reworded', '− 1 note removed'];

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

const boardJSON = (p: Page) =>
  p.evaluate(() => {
    const b = window.__fenmyr.curBoard();
    return JSON.stringify({ cards: b.cards, links: b.links, tray: b.tray, trayLinks: b.trayLinks ?? [] });
  });
const under = (text: string) =>
  page.evaluate(text => {
    const d = [...document.querySelectorAll('#mcList .mc-msg')].find(m => m.firstChild?.textContent === text);
    return {
      heading: d?.querySelector('.m-summary b')?.textContent ?? null,
      lines: [...(d?.querySelectorAll('.m-summary li') ?? [])].map(li => li.textContent),
      buttons: [...(d?.querySelectorAll('.m-acts button') ?? [])].map(b => b.textContent),
    };
  }, text);
const tap = (text: string, label: string) =>
  page.locator('#mcList .mc-msg', { hasText: text }).locator('.m-acts button', { hasText: label }).click();
const chat = async (open: boolean) => {
  await page.evaluate(open => document.getElementById(open ? 'mPill' : 'mcClose')?.click(), open);
  await settle(page, 300);
};
const replyWith = (r: Record<string, unknown>) => page.evaluate(r => window.__fenmyr.applyMyra(r, 'q'), r);
const reply = (say: string) => replyWith({ ...REPLY, say });
const changesAct = (text: string) =>
  page.evaluate(
    text =>
      window.__fenmyr
        .curBoard()
        .chat?.find(m => m.text === text)
        ?.acts?.find(a => a.kind === 'changes'),
    text,
  );
const lastSaid = () =>
  page.evaluate(() => document.querySelector('#mcList .mc-msg.myra:last-child')?.firstChild?.textContent);
async function ctrlZ() {
  await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
  await page.keyboard.press('Control+z');
  await settle(page, 300);
}
async function open(id: string) {
  await page.waitForTimeout(500);
  await page.evaluate(id => window.__fenmyr.openBoard(id), id);
  await settle(page, 300);
}

await chat(true);
const before = await boardJSON(page);
await reply('Sorted into phases.');
await settle(page, 900);

await check('the chat shows Changed on the board with what the reply did, then Show on board and Undo', async () => {
  assert.deepStrictEqual(await under('Sorted into phases.'), {
    heading: 'Changed on the board',
    lines: LINES,
    buttons: ['Show on board', 'Undo', 'Name the columns'],
  });
});

await check(
  'Show on board selects what the reply added, moved and edited, and frames it clear of the chat',
  async () => {
    await tap('Sorted into phases.', 'Show on board');
    await settle(page, 900);
    const act = await changesAct('Sorted into phases.');
    assert(act?.kind === 'changes');
    const ids = [...(act.set.added ?? []), ...(act.set.moved ?? []), ...(act.set.edited ?? [])];
    assert.deepStrictEqual(
      (await page.evaluate(() => window.__fenmyr.sel)).sort(),
      [...ids].sort(),
      'exactly those cards are selected',
    );
    const hidden = await page.evaluate(ids => {
      const chatBox = document.getElementById('mChat')?.getBoundingClientRect(),
        stage = document.getElementById('stage')?.getBoundingClientRect();
      if (!chatBox || !stage) return ['no chat or stage'];
      return ids.filter(id => {
        const r = document.querySelector(`#cards [data-id="${id}"]`)?.getBoundingClientRect();
        const under = r && r.right > chatBox.left && r.left < chatBox.right && r.bottom > chatBox.top;
        return (
          !r || r.left < stage.left || r.top < stage.top || r.right > stage.right || r.bottom > stage.bottom || under
        );
      });
    }, ids);
    assert.deepStrictEqual(hidden, [], 'every one is in view and none is under the chat');
    assert.deepStrictEqual((await under('Sorted into phases.')).buttons, ['Show on board', 'Undo', 'Name the columns']);
  },
);

await check('close and reopen the chat: the summary, Show on board and Undo are all still there', async () => {
  const kept = await changesAct('Sorted into phases.');
  await chat(false);
  await chat(true);
  assert.deepStrictEqual(await under('Sorted into phases.'), {
    heading: 'Changed on the board',
    lines: LINES,
    buttons: ['Show on board', 'Undo', 'Name the columns'],
  });
  assert.deepStrictEqual(await changesAct('Sorted into phases.'), kept, 'and what is stored is unchanged');
});

await check(
  'Undo puts back the whole reply except a card changed since, names it, and is one Ctrl+Z step',
  async () => {
    await page.evaluate(() => {
      const c = window.__fenmyr.curBoard().cards.find(x => x.id === 'n1');
      if (c?.type !== 'note') throw new Error('no n1');
      c.text = 'Mine';
      window.__fenmyr.renderCard(c);
    });
    const mine = await boardJSON(page);
    await tap('Sorted into phases.', 'Undo');
    await settle(page, 500);
    const expected = JSON.parse(before);
    for (const c of expected.cards) if (c.id === 'n1') c.text = 'Mine';
    assert.deepStrictEqual(JSON.parse(await boardJSON(page)), expected, 'everything else is as it was');
    assert.strictEqual(
      await lastSaid(),
      'I’ve put back what that reply changed, apart from “Mine”, which has changed since. I’ve left it as it is.',
    );
    assert.deepStrictEqual((await under('Sorted into phases.')).buttons, ['Show on board', 'Name the columns']);
    await ctrlZ();
    assert.strictEqual(await boardJSON(page), mine, 'one Ctrl+Z brings the reply back');
    await chat(false);
    await chat(true);
    assert.deepStrictEqual(
      (await under('Sorted into phases.')).buttons,
      ['Show on board', 'Undo', 'Name the columns'],
      'and Undo with it',
    );
  },
);

await check('opening the board again takes Undo away, and Show on board still works', async () => {
  await open('away');
  await open('acts');
  assert.deepStrictEqual((await under('Sorted into phases.')).buttons, ['Show on board', 'Name the columns']);
  await page.evaluate(() => window.__fenmyr.selectOnly([]));
  await tap('Sorted into phases.', 'Show on board');
  await settle(page, 300);
  assert.ok((await page.evaluate(() => window.__fenmyr.sel)).includes('n2'), 'it still selects what changed');
});

await check('Ctrl+Z on the reply itself hides its Undo', async () => {
  await open('back');
  const was = await boardJSON(page);
  await reply('Back again.');
  await settle(page, 600);
  await ctrlZ();
  assert.strictEqual(await boardJSON(page), was);
  await chat(false);
  await chat(true);
  assert.deepStrictEqual((await under('Back again.')).buttons, ['Show on board', 'Name the columns']);
});

await check('with the chat closed her bubble shows the same; Show keeps it open and Undo answers in it', async () => {
  await open('bubble');
  await chat(false);
  const was = await boardJSON(page);
  await reply('In the bubble.');
  await settle(page, 600);
  const bubble = () =>
    page.evaluate(() => ({
      on: document.getElementById('mBubble')?.classList.contains('on'),
      said: document.getElementById('mSay')?.textContent,
      lines: [...document.querySelectorAll('#mActs .m-summary li')].map(li => li.textContent),
      buttons: [...document.querySelectorAll('#mActs button')].map(b => b.textContent),
    }));
  assert.deepStrictEqual(await bubble(), {
    on: true,
    said: 'In the bubble.',
    lines: LINES,
    buttons: ['Show on board', 'Undo', 'Name the columns'],
  });
  await page.locator('#mActs button', { hasText: 'Show on board' }).click();
  await settle(page, 300);
  assert.strictEqual((await bubble()).on, true, 'Show on board keeps the bubble open');
  await page.locator('#mActs button', { hasText: 'Undo' }).click();
  await settle(page, 300);
  assert.deepStrictEqual(await bubble(), {
    on: true,
    said: 'I’ve put the board back as it was before that reply.',
    lines: [],
    buttons: [],
  });
  assert.strictEqual(await boardJSON(page), was, 'and the board is as it was');
});

await check(
  'Undo leaves a card she added that the person has since drawn a connector to, with it, and names it',
  async () => {
    await open('drawn');
    await chat(true);
    await replyWith({
      say: 'Added one.',
      add: [{ type: 'note', text: 'Fresh idea' }],
      edit: [{ id: 'n2', text: 'Two' }],
    });
    await settle(page, 600);
    const was = JSON.parse(await boardJSON(page));
    await page.evaluate(() => {
      const b = window.__fenmyr.curBoard(),
        fresh = b.cards.find(c => c.type === 'note' && c.text === 'Fresh idea');
      if (!fresh) throw new Error('no new note');
      b.links.push({ id: 'mine', a: fresh.id, b: 'n1' });
      window.__fenmyr.renderAll();
    });
    await tap('Added one.', 'Undo');
    await settle(page, 300);
    const now = JSON.parse(await boardJSON(page));
    assert.ok(
      now.links.some((l: { id: string }) => l.id === 'mine'),
      'the connector the person drew is still there',
    );
    assert.deepStrictEqual(
      now.cards.map((c: { id: string }) => c.id),
      was.cards.map((c: { id: string }) => c.id),
      'and so is the card',
    );
    assert.strictEqual(now.cards.find((c: { id: string }) => c.id === 'n2')?.text, 'Second note', 'the rest goes back');
    assert.strictEqual(
      await lastSaid(),
      'I’ve put back what that reply changed, apart from “Fresh idea”, which has changed since. I’ve left it as it is.',
    );
  },
);

await check('Undo of a reply whose card a later reply changed does not say the person changed it', async () => {
  await open('twice');
  await replyWith({
    say: 'First go.',
    edit: [
      { id: 'n1', text: 'One' },
      { id: 'n2', text: 'Two' },
    ],
  });
  await settle(page, 600);
  await replyWith({ say: 'Second go.', edit: [{ id: 'n1', text: 'One again' }] });
  await settle(page, 600);
  await tap('First go.', 'Undo');
  await settle(page, 300);
  assert.strictEqual(
    await lastSaid(),
    'I’ve put back what that reply changed, apart from “One again”, which has changed since. I’ve left it as it is.',
  );
});

await check('a card taken out of a collection shows in the summary', async () => {
  await open('out');
  await replyWith({ say: 'Taken out.', edit: [{ id: 'k1', in: null }] });
  await settle(page, 600);
  assert.deepStrictEqual(await under('Taken out.'), {
    heading: 'Changed on the board',
    lines: ['→ 1 note moved out'],
    buttons: ['Show on board', 'Undo'],
  });
});

assert.deepStrictEqual(l.errors, []);
await l.close();
if (failed.length) {
  console.error(`REPLY ACTS FAILED: ${failed.join('; ')}`);
  process.exit(1);
}
console.log('REPLY ACTS OK');
