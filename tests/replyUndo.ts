// One reply of Myra's is one undo step however slow its pictures are, edits the person makes while she works stay
// their own, replies wait their turn instead of landing inside each other, a preview changes nothing, a reply for a
// board that is no longer open is not applied, a queued question keeps the board and vault chip it was asked with,
// and a reply that fails part way leaves the board as it was.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Page } from 'playwright';
import { replyBoard } from './fixtures/boards.ts';
import { launch, settle } from './support/launch.ts';

const BOARDS = [
  'slow',
  'edit',
  'queue',
  'preview',
  'changes',
  'switch',
  'other',
  'asks',
  'asked',
  'elsewhere',
  'chip',
  'throws',
  'order',
];
// a stand-in Claude Code where the real one usually lives, so asking takes the same path on a machine without it;
// the checks that ask replace the bridge's ask themselves
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-reply-undo-'));
fs.mkdirSync(path.join(data, '.local/bin'), { recursive: true });
fs.writeFileSync(path.join(data, '.local/bin/claude'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
const l = await launch({ boards: BOARDS.map(id => replyBoard(id, id)), open: 'slow', data });
const { page } = l;

const boardJSON = (p: Page) =>
  p.evaluate(() => {
    const b = window.__fenmyr.curBoard();
    return JSON.stringify({ cards: b.cards, links: b.links, tray: b.tray, trayLinks: b.trayLinks });
  });
const onBoard = (p: Page, words: string[]) =>
  p.evaluate(
    words => words.filter(w => window.__fenmyr.curBoard().cards.some(c => c.type === 'note' && c.text === w)),
    words,
  );
const cardAt = (p: Page, id: string) =>
  p.evaluate(id => {
    const c = window.__fenmyr.curBoard().cards.find(x => x.id === id);
    return c ? { x: c.x, y: c.y } : null;
  }, id);
// after the last save lands: opening a board with a save still waiting leaves "saving…" up
async function open(id: string) {
  await page.waitForTimeout(500);
  await page.evaluate(id => window.__fenmyr.openBoard(id), id);
  await settle(page, 300);
}
// pictures that take longer to arrive than the 350 ms after which a change on the board becomes an undo step
const slowPictures = (ms: number) =>
  page.evaluate(ms => {
    const c = document.createElement('canvas');
    c.width = 40;
    c.height = 30;
    const png = c.toDataURL('image/png');
    window.Fenmyr.fetchImage = () => new Promise<string>(res => setTimeout(() => res(png), ms));
  }, ms);
async function undo() {
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
}

// Each check runs even when an earlier one fails, so a run on an older build lists everything it lacks.
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

await check('a slow picture: nothing shows until all of it is ready, and one Ctrl+Z takes it all back', async () => {
  await slowPictures(1200);
  const before = await boardJSON(page);
  const slow = page.evaluate(() =>
    window.__fenmyr.applyMyra({ say: 'ok', add: [{ text: 'A' }], images: [{ url: 'a' }, { url: 'b' }] }, 'q'),
  );
  await page.waitForTimeout(600);
  assert.strictEqual(await boardJSON(page), before, 'nothing on the board changes while her pictures load');
  const slowDone = await slow;
  assert.strictEqual(slowDone?.changes.added.length, 3, 'the note and both pictures are added');
  await page.waitForTimeout(400);
  await undo();
  assert.strictEqual(await boardJSON(page), before, 'one Ctrl+Z takes the whole reply back');
});

await check('the person moves a card while she works: her reply and their move are separate undo steps', async () => {
  await open('edit');
  const start = await boardJSON(page),
    from = await cardAt(page, 'n2');
  await slowPictures(1500);
  const edit = page.evaluate(() =>
    window.__fenmyr.applyMyra({ say: 'ok', add: [{ text: 'B' }], images: [{ url: 'a' }] }, 'q'),
  );
  await page.waitForTimeout(200);
  const box = await page.locator('#cards .card[data-id="n2"]').boundingBox();
  assert(box, 'n2 is on screen');
  await page.mouse.move(box.x + box.width - 40, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + 40, box.y + 30, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  const moved = await cardAt(page, 'n2');
  assert(moved && from && moved.x > from.x, 'the person moved n2');
  await edit;
  await page.waitForTimeout(400);
  await undo();
  assert.deepStrictEqual(await onBoard(page, ['B']), [], 'Ctrl+Z takes back her reply');
  assert.deepStrictEqual(await cardAt(page, 'n2'), moved, 'and leaves the move made while she worked');
  await undo();
  assert.strictEqual(await boardJSON(page), start, 'a second Ctrl+Z takes back the move');
});

await check('two replies at once: the second waits for the first, and each is its own undo step', async () => {
  await open('queue');
  await slowPictures(1200);
  const first = page.evaluate(() =>
    window.__fenmyr.applyMyra({ say: 'A', add: [{ text: 'From A' }], images: [{ url: 'a' }] }, 'a'),
  );
  const second = page.evaluate(() => window.__fenmyr.applyMyra({ say: 'B', add: [{ text: 'From B' }] }, 'b'));
  await page.waitForTimeout(600);
  assert.deepStrictEqual(await onBoard(page, ['From A', 'From B']), [], 'neither lands while the first one gathers');
  await Promise.all([first, second]);
  await page.waitForTimeout(400);
  await undo();
  assert.deepStrictEqual(
    await onBoard(page, ['From A', 'From B']),
    ['From A'],
    'Ctrl+Z takes back only the later reply',
  );
});

await check(
  'a preview plans the reply on a copy: the board, the saved file and the save indicator stay as they are',
  async () => {
    await open('preview');
    const reply = {
      say: 'ok',
      add: [{ text: 'P' }],
      move: [{ id: 'n1', x: 40, y: 1000 }],
      edit: [{ id: 't1', text: 'Renamed' }],
      remove: ['n3'],
    };
    const seen = await page.evaluate(async r => {
      let saves = 0;
      const real = window.Fenmyr.save;
      window.Fenmyr.save = b => {
        saves++;
        return real(b);
      };
      const b = window.__fenmyr.curBoard(),
        json = () => JSON.stringify({ cards: b.cards, links: b.links, tray: b.tray, trayLinks: b.trayLinks }),
        drawn = () => document.querySelectorAll('#cards .card').length,
        was = { json: json(), saved: document.getElementById('saved')?.textContent, drawn: drawn() };
      const preview = await window.__fenmyr.previewMyra(r);
      await new Promise(res => setTimeout(res, 600));
      return {
        same: json() === was.json && document.getElementById('saved')?.textContent === was.saved,
        drawn: drawn() === was.drawn,
        saves,
        changes: preview?.changes,
      };
    }, reply);
    assert(seen.same, 'the board and the save indicator are unchanged');
    assert(seen.drawn, 'nothing new is drawn');
    assert.strictEqual(seen.saves, 0, 'nothing is saved');
    const applied = await page.evaluate(r => window.__fenmyr.applyMyra(r, 'q'), reply);
    const lists = (c: typeof seen.changes) => c && [c.added.length, c.moved, c.edited, c.removed];
    assert.deepStrictEqual(lists(seen.changes), [1, ['n1'], ['t1'], ['n3']], 'the preview lists what the reply does');
    assert.deepStrictEqual(lists(applied?.changes), lists(seen.changes), 'and applying it does the same');
  },
);

await check(
  "the change set says what the reply did, card by card, with what a collection's layout shifted grouped under it",
  async () => {
    await open('changes');
    const done = await page.evaluate(() =>
      window.__fenmyr.applyMyra(
        {
          say: 'ok',
          add: [{ text: 'Filed', in: 'kb' }],
          move: [{ id: 'n1', x: 40, y: 1000 }],
          edit: [
            { id: 't1', text: 'Errands today' },
            {
              id: 'k1',
              text: 'Write the brief and send it round to the whole team before Friday, so they can read it',
            },
          ],
          remove: ['i1', 'u3'],
          connect: [['n1', 'n4']],
        },
        'q',
      ),
    );
    const set = done?.changes;
    assert(set, 'the reply was applied');
    assert.strictEqual(set.added.length, 1, 'one card added');
    assert.deepStrictEqual(set.moved, ['n1']);
    assert.deepStrictEqual([...set.edited].sort(), ['k1', 't1']);
    assert.deepStrictEqual([...set.removed].sort(), ['i1', 'u3'], 'removed from the board and from Unsorted');
    assert.deepStrictEqual(
      set.relaid,
      { kb: ['kb', 'k2'], ideas: ['ideas'] },
      'what the layout shifted, by collection',
    );
    assert.strictEqual(set.links.added.length, 1);
    assert.deepStrictEqual(set.skipped, []);
  },
);

await check('a card the person is typing in is left alone, and the change set says so', async () => {
  const typing = await page.evaluate(async () => {
    const id = window.__fenmyr.newNote(0, 0);
    await new Promise(res => setTimeout(res, 400));
    const r = await window.__fenmyr.applyMyra({ say: 'ok', edit: [{ id, text: 'Hers' }] }, 'q'),
      c = window.__fenmyr.curBoard().cards.find(x => x.id === id);
    return { id, editing: window.__fenmyr.editing, skipped: r?.changes.skipped, text: c?.type === 'note' && c.text };
  });
  assert.strictEqual(typing.editing, typing.id, 'still typing');
  assert.deepStrictEqual(typing.skipped, [typing.id], 'the change set names the card she left alone');
  assert.notStrictEqual(typing.text, 'Hers', 'her words did not replace theirs');
  await page.keyboard.press('Escape');
});

await check('another board opened while she gathers: nothing lands on either board, and she says why', async () => {
  await open('switch');
  await slowPictures(1200);
  const lost = page.evaluate(() =>
    window.__fenmyr.applyMyra({ say: 'ok', add: [{ text: 'Lost' }], images: [{ url: 'a' }] }, 'q'),
  );
  await page.waitForTimeout(300);
  await open('other');
  const otherBefore = await boardJSON(page);
  assert.strictEqual(await lost, null, 'the reply is not applied');
  assert.strictEqual(await boardJSON(page), otherBefore, 'the open board is untouched');
  const left = await page.evaluate(async () => (await window.Fenmyr.load('switch'))?.cards?.length);
  assert.strictEqual(left, replyBoard().cards.length, 'the board she was asked on is untouched');
  assert.match(
    await page.evaluate(() => document.getElementById('mSay')?.textContent ?? ''),
    /another board/i,
    'she says why',
  );
});

await check(
  'asking twice: both lines show at once, and the second question goes to Claude after the first reply has landed',
  async () => {
    await open('asks');
    const asks = await page.evaluate(async () => {
      const log: string[] = [];
      window.Fenmyr.ask = async (prompt: string) => {
        const one = prompt.includes('first'),
          landed = window.__fenmyr.curBoard().cards.some(c => c.type === 'note' && c.text === 'From the first');
        log.push(`${one ? 'first' : 'second'} asked, first reply on the board: ${landed}`);
        await new Promise(res => setTimeout(res, one ? 800 : 10));
        return JSON.stringify({
          say: one ? 'One.' : 'Two.',
          add: [{ text: one ? 'From the first' : 'From the second' }],
        });
      };
      const a = window.__fenmyr.ask('the first one'),
        b = window.__fenmyr.ask('the second one'),
        shown = [...document.querySelectorAll('#mcList .mc-msg.me')].map(d => d.textContent);
      await Promise.all([a, b]);
      return { log, shown };
    });
    assert.deepStrictEqual(asks.shown, ['the first one', 'the second one'], 'both questions show at once');
    assert.deepStrictEqual(asks.log, [
      'first asked, first reply on the board: false',
      'second asked, first reply on the board: true',
    ]);
  },
);

await check(
  'two questions, then another board opened while she thinks about the first: neither reply lands on it',
  async () => {
    await open('asked');
    const prompts = page.evaluate(async () => {
      const sent: string[] = [];
      window.Fenmyr.ask = async (prompt: string) => {
        const one = prompt.includes('first');
        sent.push(one ? 'first' : 'second');
        await new Promise(res => setTimeout(res, one ? 1200 : 10));
        return JSON.stringify({ say: one ? 'One.' : 'Two.', add: [{ text: one ? 'Asked first' : 'Asked second' }] });
      };
      await Promise.all([window.__fenmyr.ask('the first one'), window.__fenmyr.ask('the second one')]);
      return sent;
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__fenmyr.openBoard('elsewhere'));
    const sent = await prompts;
    await page.waitForTimeout(600);
    assert.deepStrictEqual(
      await onBoard(page, ['Asked first', 'Asked second']),
      [],
      'nothing lands on the board now open',
    );
    const there = await page.evaluate(async () =>
      ((await window.Fenmyr.load('asked'))?.cards ?? []).filter(c => 'text' in c && /^Asked/.test(String(c.text))),
    );
    assert.deepStrictEqual(there, [], 'nor on the board they were asked on');
    assert.deepStrictEqual(sent, ['first'], 'the second question is not sent with the other board');
  },
);

await check(
  'the vault chip goes with the question it was ticked for, even while an earlier one is thinking',
  async () => {
    await open('chip');
    const vault = path.join(l.data, 'vault');
    fs.cpSync(path.join(import.meta.dirname, 'sample-vault'), vault, { recursive: true });
    const used = await page.evaluate(async vault => {
      const M = window.__fenmyr,
        v = await Fenmyr.vaultAdd(vault);
      M.board.vaultAccess = [{ vault: v.id, folders: [''], ai: true, write: false, writeTo: 'Myra' }];
      await M.openVaultPicker();
      document.getElementById('vaultPick')?.remove();
      M.applyToolbar();
      const read: Record<string, boolean> = {};
      window.Fenmyr.ask = async (
        prompt: string,
        _snap: unknown,
        _confirmed?: boolean,
        opts?: { canVault?: boolean },
      ) => {
        const q = ['zero', 'one', 'two'].find(w => prompt.includes(`question ${w}`)) ?? prompt;
        read[q] = !opts?.canVault;
        await new Promise(res => setTimeout(res, q === 'zero' ? 800 : 10));
        return JSON.stringify({ say: 'ok' });
      };
      const zero = M.ask('question zero'),
        one = M.ask('question one');
      document.getElementById('mcVault')?.click();
      const two = M.ask('question two');
      await Promise.all([zero, one, two]);
      // the chip hands focus to the chat box, where Ctrl+Z would undo typing rather than the board
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      return read;
    }, vault);
    assert.deepStrictEqual(
      used,
      { zero: false, one: false, two: true },
      'only the question asked with the chip on reads the vault',
    );
  },
);

await check('a reply that fails part way: the board stays as it was, and the next reply is one undo step', async () => {
  await open('throws');
  const before = await boardJSON(page);
  const thrown = await page.evaluate(async () => {
    try {
      // @ts-expect-error a connection the reply check would never let through
      await window.__fenmyr.applyMyra({ say: 'boom', add: [{ text: 'Ghost' }], connect: [null] }, 'q');
      return '';
    } catch (e) {
      return String(e);
    }
  });
  assert.match(thrown, /TypeError/, 'the error still reaches the caller');
  assert.strictEqual(await boardJSON(page), before, 'nothing of the failed reply stays on the board');
  await page.evaluate(() => window.__fenmyr.applyMyra({ say: 'ok', add: [{ text: 'After' }] }, 'q'));
  await page.waitForTimeout(400);
  await undo();
  assert.strictEqual(await boardJSON(page), before, 'one Ctrl+Z takes back the next reply and leaves nothing behind');
});

await check("a template she saves from the cards she just touched keeps them in her reply's order", async () => {
  await open('order');
  const texts = await page.evaluate(async () => {
    await window.__fenmyr.applyMyra(
      {
        say: 'ok',
        edit: [{ id: 'n2', text: 'Edited second' }],
        move: [{ id: 'n1', x: 40, y: 1100 }],
        add: [{ text: 'Added' }],
        saveTemplate: { name: 'In order', fromNew: true },
      },
      'q',
    );
    const t = (await window.Fenmyr.templates()).find(x => x.name === 'In order');
    return t?.cards.map(c => (typeof c === 'object' && c !== null && 'text' in c ? c.text : null));
  });
  assert.deepStrictEqual(texts, ['Added', 'First note', 'Edited second'], 'added, then moved, then edited');
});

const errors = [...l.errors];
await l.close();
fs.rmSync(data, { recursive: true, force: true });
assert.deepStrictEqual(errors, [], 'no page errors');
assert.deepStrictEqual(failed, [], 'checks that failed');
console.log('REPLY UNDO OK');
