// A message that never reached Myra comes back. The host's refusal, an offline send, a plain error and a queued ask that
// finds another board open each give back the words (when the input is empty) and the files and pasted texts, on the
// board the message was written on; a message that did reach her gives back nothing. The four-file limit and the draft's
// budget hold for what comes back; Clear all chats and a deleted board get nothing back; the origin board's file hears of
// it; words typed while a board saves stay with it; a board that was just made keeps its draft.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { type Launched, launch } from './support/launch.ts';
import { longText, pasteIntoChat } from './support/paste.ts';

const card = (id: string) => ({ id, type: 'note', x: 0, y: 0, w: 220, h: 140, r: 0, color: 'butter', text: id });
const plain = (id: string, name: string) => ({
  id,
  name,
  cards: [card(id)],
  links: [],
  tray: [],
  view: { x: 0, y: 0, z: 1 },
});

async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}

function rig(l: Launched) {
  const { page } = l;
  const file = (id: string) => path.join(l.data, 'fenmyr', 'boards', `${id}.json`);
  const stored = (id: string): string | undefined => {
    try {
      return JSON.parse(fs.readFileSync(file(id), 'utf8')).chatDraft?.text;
    } catch {
      return undefined;
    }
  };
  const until = async (ok: () => boolean | Promise<boolean>, what: string, ms = 6000) => {
    const end = Date.now() + ms;
    while (Date.now() < end && !(await ok())) await page.waitForTimeout(80);
    assert.ok(await ok(), what);
  };
  const chips = () => page.locator('#mcSees .mcs-chip.paste .mcs-t').allTextContents();
  const text = () => page.inputValue('#mcInput');
  const log = () => page.locator('#mcList').innerText();
  const go = async (id: string) => {
    await page.evaluate(id => window.__fenmyr.openBoard(id), id);
    await page.waitForTimeout(250);
  };
  // each ask waits in `gates` until the test refuses it, answers it or makes it fail
  const gate = () =>
    page.evaluate(() => {
      const gates: { settle: (how: string) => void }[] = [];
      Reflect.set(window, 'gates', gates);
      window.Fenmyr.ask = () =>
        new Promise<string>((res, rej) =>
          gates.push({
            settle: how => {
              if (how === 'ok') res('{"say":"ok"}');
              else rej(new Error(how === 'refuse' ? 'Not sent. A stand-in refusal.' : how));
            },
          }),
        );
    });
  const settle = (i: number, how: 'ok' | 'refuse' | 'boom') =>
    page.evaluate(([i, how]) => Reflect.get(window, 'gates')[i].settle(how), [i, how] as const);
  const pending = () => page.evaluate(() => Reflect.get(window, 'gates').length);
  const send = async (words: string) => {
    await page.fill('#mcInput', words);
    await page.click('.mc-send');
  };
  const paste = (lines: number) => pasteIntoChat(page, longText(lines));
  const open = async () => {
    await page.click('#mPill');
    await page.waitForTimeout(400);
  };
  const label = (lines: number) => `Pasted text · ${lines} lines`;
  return { page, stored, until, chips, text, log, go, gate, settle, pending, send, paste, open, label };
}

const four = [80, 81, 82, 83],
  late = [120, 121, 122, 123];

{
  const l = await launch({
    boards: [plain('a', 'Alpha'), plain('b', 'Bravo')],
    open: 'a',
    claude: true,
    settings: { chatKeep: 'board' },
  });
  const r = rig(l);
  const { page } = r;
  await r.open();
  await r.gate();

  await check(
    'a refused message gives back its four files, and what was added since is left out in one line',
    async () => {
      for (const n of four) await r.paste(n);
      await r.send('first words');
      await r.until(async () => (await r.pending()) === 1, 'the ask is in flight');
      for (const n of late) await r.paste(n);
      assert.strictEqual((await r.chips()).length, 4, 'four more fit while it is out');
      await r.settle(0, 'refuse');
      await r.until(async () => (await r.log()).includes('no room to put back'), 'the line says what was left out');
      assert.deepStrictEqual(await r.chips(), four.map(r.label), 'the refused four come back first');
      assert.match(
        await r.log(),
        /no room to put back 4 files or pasted texts you added after sending, so I left them out/,
      );
      assert.strictEqual(await r.text(), 'first words', 'and the words');
      const at = await page.evaluate(() => document.querySelector<HTMLTextAreaElement>('#mcInput')?.selectionStart);
      assert.strictEqual(at, 'first words'.length, 'with the caret at the end');
      await r.send('again');
      await r.settle(1, 'ok');
      await r.until(async () => (await r.chips()).length === 0, 'the next send takes them');
    },
  );

  await check('pasted texts that would not fit the draft with the words are left out', async () => {
    await pasteIntoChat(page, 'p'.repeat(60_000));
    await page.fill('#mcInput', 'w'.repeat(30_000));
    await page.click('.mc-send');
    await r.until(async () => (await r.pending()) === 3, 'in flight');
    await pasteIntoChat(page, 'q'.repeat(20_000));
    await r.settle(2, 'refuse');
    await r.until(async () => (await r.log()).includes('no room to put back one file'), 'one was left out');
    assert.deepStrictEqual(await r.chips(), ['Pasted text · 1 line'], 'only the refused one is back');
    assert.strictEqual((await r.text()).length, 30_000);
    await page.click('#mcSees .mcs-chip.paste .mcs-x');
    await page.fill('#mcInput', '');
  });

  await check(
    'an empty input gets the words back, a typed one is left alone, and an answered ask gives nothing',
    async () => {
      await r.send('words one');
      await r.until(async () => (await r.pending()) === 4, 'in flight');
      await r.settle(3, 'refuse');
      await r.until(async () => (await r.text()) === 'words one', 'refilled');
      await page.fill('#mcInput', '');
      await r.send('words two');
      await r.until(async () => (await r.pending()) === 5, 'in flight');
      await page.fill('#mcInput', 'newer words');
      await r.settle(4, 'refuse');
      await r.until(async () => (await r.log()).includes('Not sent'), 'refused');
      await page.waitForTimeout(200);
      assert.strictEqual(await r.text(), 'newer words', 'left alone');
      assert.match(await r.log(), /words two/, 'the log keeps them');
      await page.fill('#mcInput', '');
      await r.paste(90);
      await r.send('words three');
      await r.until(async () => (await r.pending()) === 6, 'in flight');
      await r.settle(5, 'ok');
      await page.waitForTimeout(400);
      assert.strictEqual(await r.text(), '');
      assert.deepStrictEqual(await r.chips(), [], 'an answered ask gives nothing back');
    },
  );

  await check(
    'an error, an offline send and a queued ask that finds another board open give everything back',
    async () => {
      await r.paste(91);
      await r.send('error words');
      await r.until(async () => (await r.pending()) === 7, 'in flight');
      await r.settle(6, 'boom');
      await r.until(async () => (await r.text()) === 'error words', 'words back after an error');
      assert.deepStrictEqual(await r.chips(), [r.label(91)]);
      await page.evaluate(() => Object.defineProperty(navigator, 'onLine', { get: () => false, configurable: true }));
      await r.send('offline words');
      await r.until(async () => (await r.log()).includes("You're offline"), 'offline line');
      assert.strictEqual(await r.text(), 'offline words');
      assert.deepStrictEqual(await r.chips(), [r.label(91)], 'the chip stayed through the offline send');
      await page.evaluate(() => Reflect.deleteProperty(navigator, 'onLine'));
      await page.fill('#mcInput', '');
      await page.click('#mcSees .mcs-chip.paste .mcs-x');
      await r.send('slow ask');
      await r.until(async () => (await r.pending()) === 8, 'the first ask is in flight');
      await r.paste(92);
      await r.send('queued words');
      await r.go('b');
      await r.settle(7, 'ok');
      await page.waitForTimeout(500);
      await r.go('a');
      assert.deepStrictEqual(await r.chips(), [r.label(92)], 'the queued ask’s chip is back on its board');
      assert.strictEqual(await r.text(), 'queued words');
      assert.strictEqual(await r.pending(), 8, 'and the ask never went out');
      await page.fill('#mcInput', '');
      await page.click('#mcSees .mcs-chip.paste .mcs-x');
    },
  );

  await check('two asks refused one after the other give each its pasted text once', async () => {
    await r.paste(100);
    await r.send('one');
    await r.paste(101);
    await r.send('two');
    await r.until(async () => (await r.pending()) === 9, 'the first is in flight');
    await r.settle(8, 'refuse');
    await r.until(async () => (await r.pending()) === 10, 'the second is in flight');
    await r.settle(9, 'refuse');
    await r.until(async () => (await r.chips()).length === 2, 'both back');
    await page.waitForTimeout(300);
    assert.deepStrictEqual((await r.chips()).sort(), [r.label(100), r.label(101)]);
    assert.strictEqual(await r.text(), 'one', 'the first refilled the empty input and the second left it');
    await page.fill('#mcInput', '');
    for (let i = 0; i < 2; i++) await page.click('#mcSees .mcs-chip.paste .mcs-x');
  });

  await check('a refusal that comes after Clear all chats restores nothing, in memory or in the file', async () => {
    await r.paste(95);
    await r.send('to be cleared');
    await r.until(async () => (await r.pending()) === 11, 'in flight');
    await page.evaluate(() => document.getElementById('clearChats')?.click());
    await page.waitForTimeout(300);
    await r.settle(10, 'refuse');
    await r.until(async () => (await r.log()).includes('Not sent'), 'refused');
    await page.waitForTimeout(3000);
    assert.deepStrictEqual(await r.chips(), []);
    assert.strictEqual(await r.text(), '');
    assert.strictEqual(r.stored('a'), undefined, 'and the board file holds no draft');
    assert.deepStrictEqual(await page.evaluate(() => window.__fenmyr.draftBoards()), []);
  });

  await check('a refusal after a board switch reaches the origin board’s file and not the other board’s', async () => {
    await r.paste(96);
    await r.send('origin words');
    await r.until(async () => (await r.pending()) === 12, 'in flight');
    await r.go('b');
    await r.settle(11, 'refuse');
    await r.until(async () => (await r.log()).includes('Not sent'), 'refused');
    assert.strictEqual(await r.text(), '', 'the other board’s input is untouched');
    assert.deepStrictEqual(await r.chips(), []);
    await r.go('a');
    assert.strictEqual(await r.text(), 'origin words');
    assert.deepStrictEqual(await r.chips(), [r.label(96)]);
    await r.until(() => r.stored('a') === 'origin words', 'the file of the board it came from holds it');
    assert.strictEqual(r.stored('b'), undefined, 'and the other board’s file does not');
    await page.fill('#mcInput', '');
    await page.click('#mcSees .mcs-chip.paste .mcs-x');
    await page.evaluate(() => document.getElementById('mcInput')?.blur());
  });

  await check('words typed while a board saves on the way out stay with it', async () => {
    await page.fill('#mcInput', 'first');
    await page.evaluate(() => {
      const save = window.Fenmyr.save;
      window.Fenmyr.save = async board => {
        await new Promise(r => setTimeout(r, 700));
        return save(board);
      };
    });
    await page.evaluate(() => void window.__fenmyr.openBoard('b'));
    await page.waitForTimeout(150);
    await page.fill('#mcInput', 'first and the rest');
    await r.until(() => page.evaluate(() => window.__fenmyr.curBoard()?.id === 'b'), 'the board changed');
    await r.go('a');
    assert.strictEqual(await r.text(), 'first and the rest');
    await r.until(() => r.stored('a') === 'first and the rest', 'and its file has them');
  });

  await check('a refusal for a board that was deleted leaves nothing behind', async () => {
    await page.fill('#mcInput', '');
    await r.gate();
    await r.paste(97);
    await r.send('doomed');
    await r.until(async () => (await r.pending()) === 1, 'in flight');
    await r.go('b');
    await page.evaluate(async () => {
      await window.Fenmyr.remove('a');
      await window.__fenmyr.refreshBoards();
    });
    await r.settle(0, 'refuse');
    await r.until(async () => (await r.log()).includes('Not sent'), 'refused');
    assert.deepStrictEqual(await page.evaluate(() => [window.__fenmyr.nextBoards(), window.__fenmyr.draftBoards()]), [
      [],
      [],
    ]);
  });

  assert.deepStrictEqual(l.errors, []);
  await l.close();
}

{
  const l = await launch({ boards: [plain('a', 'Alpha'), plain('b', 'Bravo')], open: 'a' });
  const r = rig(l);
  const { page } = r;

  await check('a board the library has not listed yet keeps its draft when others open', async () => {
    await page.evaluate(() => {
      const list = window.Fenmyr.list;
      window.Fenmyr.list = async () => (await list()).filter(b => b.id !== 'c');
    });
    fs.writeFileSync(path.join(l.data, 'fenmyr', 'boards', 'c.json'), JSON.stringify(plain('c', 'Charlie')));
    await r.go('c');
    await r.open();
    await page.fill('#mcInput', 'new board words');
    await r.go('a');
    await r.go('b');
    await r.go('c');
    assert.strictEqual(await r.text(), 'new board words');
  });

  assert.deepStrictEqual(l.errors, []);
  await l.close();
}
console.log('CHAT GIVE BACK OK');
