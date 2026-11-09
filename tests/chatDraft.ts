// Myra's unsent draft in the real app. It survives closing the chat, switching boards and a restart, comes back with the
// caret at the end and writes nothing on the way in; it reaches the board file after 2 s idle, 5 s of unbroken typing,
// a blur or a board switch, and only when chats are kept with the board; text typed while a board loads stays with
// the board it was typed on; a deleted board takes its draft with it; Clear all chats and leaving On each board clear it;
// Duplicate copies it; "Myra sees" choices are kept for each board.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DRAFT_MAX } from '../src/shared/chat.ts';
import { launch } from './support/launch.ts';

const card = (id: string) => ({ id, type: 'note', x: 0, y: 0, w: 220, h: 140, r: 0, color: 'butter', text: id });
const plain = (id: string, name: string, more = {}) => ({
  id,
  name,
  cards: [card(id)],
  links: [],
  tray: [],
  view: { x: 0, y: 0, z: 1 },
  ...more,
});
const DRAFT = 'Plan the launch\nwith dates';

async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}

function session(l: Awaited<ReturnType<typeof launch>>) {
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
  const input = () =>
    page.evaluate(() => {
      const el = document.getElementById('mcInput');
      return el instanceof HTMLTextAreaElement ? { text: el.value, at: el.selectionStart, end: el.selectionEnd } : null;
    });
  const text = async () => (await input())?.text;
  const open = async () => {
    if (!(await page.evaluate(() => !!document.getElementById('myra')?.classList.contains('chat'))))
      await page.click('#mPill');
    await page.waitForTimeout(400);
  };
  const go = async (id: string) => {
    await page.evaluate(id => window.__fenmyr.openBoard(id), id);
    await page.waitForTimeout(150);
  };
  const boxLine = () =>
    page.evaluate(() =>
      document.getElementById('mDraft')?.checkVisibility() ? document.getElementById('mDraft')?.textContent : null,
    );
  const click = (sel: string) => page.evaluate(sel => document.querySelector<HTMLElement>(sel)?.click(), sel);
  return {
    page,
    file,
    stored,
    until,
    input,
    text,
    open,
    go,
    boxLine,
    click,
    exists: (id: string) => fs.existsSync(file(id)),
  };
}

const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-draft-'));
try {
  let l = await launch({
    boards: [plain('a', 'Alpha'), plain('b', 'Bravo'), plain('c', 'Charlie')],
    open: 'a',
    settings: { chatKeep: 'board' },
    data,
  });
  let s = session(l);

  await check('a draft survives closing the chat and switching boards, with the caret at the end', async () => {
    await s.open();
    await s.page.fill('#mcInput', DRAFT);
    await s.page.keyboard.press('Escape');
    assert.strictEqual(await s.boxLine(), 'Draft · 2 lines', 'a closed chat says it holds a draft');
    await s.go('b');
    assert.strictEqual(await s.text(), '', 'the next board starts with an empty input');
    assert.strictEqual(await s.boxLine(), null, 'and her box shows no draft');
    await s.open();
    await s.page.fill('#mcInput', 'other');
    await s.go('a');
    assert.deepStrictEqual(
      await s.input(),
      { text: DRAFT, at: DRAFT.length, end: DRAFT.length },
      'A’s words, caret last',
    );
    await s.page.keyboard.press('Escape');
    assert.strictEqual(await s.boxLine(), 'Draft · 2 lines');
    await s.until(() => s.stored('a') === DRAFT && s.stored('b') === 'other', 'each board file holds its own draft');
  });

  await check('a draft survives a restart, and sending it takes it out of the file', async () => {
    await l.close();
    l = await launch({ open: 'a', settings: { chatKeep: 'board' }, data });
    s = session(l);
    assert.strictEqual(await s.boxLine(), 'Draft · 2 lines', 'her box shows the stored draft');
    await s.open();
    assert.strictEqual(await s.text(), DRAFT);
    await s.page.click('.mc-send');
    await s.until(() => s.stored('a') === undefined, 'a sent draft is gone from the file');
  });

  await check('a draft is written 2 s after the last key, 5 s into unbroken typing, and at once on blur', async () => {
    await s.open();
    await s.page.fill('#mcInput', 'idle');
    await s.page.waitForTimeout(1000);
    assert.strictEqual(s.stored('a'), undefined, 'nothing is written after 1 s');
    await s.until(() => s.stored('a') === 'idle', 'it is written after 2 s');
    await s.page.fill('#mcInput', 'blurred');
    const t0 = Date.now();
    await s.page.evaluate(() => document.getElementById('mcInput')?.blur());
    await s.until(() => s.stored('a') === 'blurred', 'blur writes it', 1200);
    assert.ok(Date.now() - t0 < 1200, 'before the idle timer');
    await s.page.fill('#mcInput', '');
    await s.until(() => s.stored('a') === undefined, 'an emptied input takes the field out');
    await s.page.focus('#mcInput');
    const t1 = Date.now();
    let seen = 0;
    while (Date.now() - t1 < 6500) {
      await s.page.keyboard.type('k');
      await s.page.waitForTimeout(400);
      if (!seen && s.stored('a')) seen = Date.now() - t1;
    }
    assert.ok(seen > 0 && seen < 6000, `typing without a 2 s pause is still written (after ${seen} ms)`);
    await s.page.fill('#mcInput', '');
  });

  await check('opening a board writes nothing, even when memory holds a newer draft', async () => {
    await s.page.evaluate(() => {
      document
        .querySelector('[data-seg="chatKeep"] [data-v="session"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await s.page.fill('#mcInput', 'in memory');
    await s.go('b');
    await s.page.evaluate(() => {
      document
        .querySelector('[data-seg="chatKeep"] [data-v="board"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await s.go('a');
    assert.deepStrictEqual(await s.input(), { text: 'in memory', at: 9, end: 9 });
    await s.page.waitForTimeout(3000);
    assert.strictEqual(s.stored('a'), undefined, 'restoring did not write the draft');
    await s.page.keyboard.type('!');
    await s.until(() => s.stored('a') === 'in memory!', 'typing does');
    await s.page.fill('#mcInput', '');
  });

  await check('words typed while a board loads stay with the board they were typed on', async () => {
    await s.page.fill('#mcInput', 'first');
    await s.page.evaluate(async () => {
      const bridge = window.Fenmyr,
        load = bridge.load,
        box = document.getElementById('mcInput');
      if (!(box instanceof HTMLTextAreaElement)) throw new Error('no input');
      bridge.load = async id => {
        await new Promise(r => setTimeout(r, 800));
        return load(id);
      };
      const moving = window.__fenmyr.openBoard('b');
      await new Promise(r => setTimeout(r, 200));
      box.value = 'first and late';
      box.dispatchEvent(new Event('input', { bubbles: true }));
      await moving;
      bridge.load = load;
    });
    assert.strictEqual(await s.text(), '', 'B opens with its own, empty, input');
    await s.go('a');
    assert.strictEqual(await s.text(), 'first and late', 'A has the late words');
    await s.until(() => s.stored('a') === 'first and late', 'and so has its file');
    await s.page.waitForTimeout(2500);
    assert.strictEqual(s.stored('b'), undefined, 'B’s file never got them');
  });

  await check('Duplicate copies the draft', async () => {
    await s.page.evaluate(() => {
      const row = [...document.querySelectorAll('.board-row')].find(
        r => r.querySelector('span')?.textContent === 'Alpha',
      );
      row?.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200 }),
      );
      document.querySelector<HTMLElement>('#rowMenu [data-m="dup"]')?.click();
    });
    await s.until(
      () => fs.readdirSync(path.dirname(s.file('a'))).some(f => !['a.json', 'b.json', 'c.json'].includes(f)),
      'a copy was made',
    );
    const copy = fs.readdirSync(path.dirname(s.file('a'))).find(f => !['a.json', 'b.json', 'c.json'].includes(f));
    assert.strictEqual(copy && s.stored(copy.replace('.json', '')), 'first and late');
  });

  await check('a deleted board takes its draft, and nothing brings it back', async () => {
    await s.page.fill('#mcInput', 'typed just now');
    await s.page.evaluate(() => {
      const row = [...document.querySelectorAll('.board-row')].find(
        r => r.querySelector('span')?.textContent === 'Alpha',
      );
      row?.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200 }),
      );
      document.querySelector<HTMLElement>('#rowMenu [data-m="del"]')?.click();
      document.querySelector<HTMLElement>('#rowMenu [data-m="yes"]')?.click();
    });
    await s.until(() => !s.exists('a'), 'the board file is deleted');
    await s.page.waitForTimeout(3000);
    assert.ok(!s.exists('a'), 'a late draft write did not bring it back');
    const now = await s.page.evaluate(() => window.__fenmyr.curBoard()?.id);
    assert.notStrictEqual(now, 'a');
    assert.strictEqual(await s.text(), '', 'the board that opened next does not inherit the words');
    assert.strictEqual(s.stored(String(now)), undefined);
  });

  await check('Myra sees choices are kept for each board', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    );
    const add = async (name: string) => {
      await s.open();
      await s.page.click('#mcSees .mcs-add');
      const chooser = s.page.waitForEvent('filechooser');
      await s.page.click('#rowMenu button:has-text("Picture or file…")');
      await (await chooser).setFiles([{ name, mimeType: 'image/png', buffer: png }]);
      await s.page.waitForTimeout(200);
    };
    const chips = () => s.page.locator('#mcSees [data-chip="added"] .mcs-t').allTextContents();
    const here = await s.page.evaluate(() => window.__fenmyr.curBoard()?.id ?? '');
    const other = ['b', 'c'].find(x => x !== here) ?? 'c';
    await add('one.png');
    await s.go(other);
    await s.open();
    assert.deepStrictEqual(await chips(), [], 'the other board has none');
    await add('two.png');
    await s.go(here);
    await s.open();
    assert.deepStrictEqual(await chips(), ['one.png'], 'the first board still has its file');
  });

  await check('Clear all chats and leaving On each board clear drafts', async () => {
    await s.go('b');
    await s.page.fill('#mcInput', 'keep me');
    await s.go('c');
    await s.page.fill('#mcInput', 'and me');
    await s.page.evaluate(() => document.getElementById('mcInput')?.blur());
    await s.until(() => s.stored('b') === 'keep me' && s.stored('c') === 'and me', 'both are on disk');
    await s.page.evaluate(() => {
      document
        .querySelector('[data-seg="chatKeep"] [data-v="session"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await s.until(() => s.stored('b') === undefined && s.stored('c') === undefined, 'files lose their drafts');
    assert.strictEqual(await s.text(), 'and me', 'the open input keeps the words in memory');
    await s.page.evaluate(() => {
      document
        .querySelector('[data-seg="chatKeep"] [data-v="board"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await s.page.keyboard.type('!');
    await s.go('b');
    await s.go('c');
    await s.page.fill('#mcInput', 'again');
    await s.go('b');
    await s.page.evaluate(() => document.getElementById('mcInput')?.blur());
    await s.until(() => s.stored('c') === 'again', 'drafts are written again');
    await s.click('#clearChats');
    await s.until(
      () => s.stored('c') === undefined && s.stored('b') === undefined,
      'Clear all chats empties the files',
    );
    assert.strictEqual(await s.text(), '', 'and the open input');
    await s.go('c');
    assert.strictEqual(await s.text(), '', 'and the other board’s memory');
  });

  await check('the draft holds at most DRAFT_MAX characters and refuses a paste that would not fit', async () => {
    assert.strictEqual(
      await s.page.evaluate(() => {
        const box = document.getElementById('mcInput');
        return box instanceof HTMLTextAreaElement ? box.maxLength : 0;
      }),
      DRAFT_MAX,
    );
    const paste = (n: number) =>
      s.page.evaluate(n => {
        // Ctrl+Shift+V, so a long paste is words and not a chip
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'V', code: 'KeyV', ctrlKey: true, shiftKey: true }));
        const data = new DataTransfer();
        data.setData('text/plain', 'x'.repeat(n));
        const e = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
        document.getElementById('mcInput')?.dispatchEvent(e);
        return e.defaultPrevented;
      }, n);
    assert.strictEqual(await paste(DRAFT_MAX), false, 'a paste that fits goes in');
    assert.strictEqual(await paste(DRAFT_MAX + 1), true, 'one that would be cut short is refused');
  });
  await l.close();

  for (const keep of ['session', 'off']) {
    await check(`with chats kept "${keep}", a draft survives a board switch and never reaches the file`, async () => {
      l = await launch({ boards: [plain('a', 'Alpha'), plain('b', 'Bravo')], open: 'a', settings: { chatKeep: keep } });
      s = session(l);
      await s.open();
      await s.page.fill('#mcInput', DRAFT);
      await s.go('b');
      assert.strictEqual(await s.text(), '');
      await s.go('a');
      assert.strictEqual(await s.text(), DRAFT);
      await s.page.evaluate(() => document.getElementById('mcInput')?.blur());
      await s.page.waitForTimeout(2800);
      assert.strictEqual(s.stored('a'), undefined, 'the board file has no draft');
      await l.close();
    });
  }

  await check('a prototype board keeps its draft with chat saving off', async () => {
    const proto = plain('p', 'Checkout', { kind: 'prototype', proto: { dir: 'prototypes/checkout', stack: 'react' } });
    l = await launch({ boards: [proto], open: 'p', settings: { chatKeep: 'off' } });
    s = session(l);
    await s.page.fill('#mcInput', 'a prototype note');
    await s.page.evaluate(() => document.getElementById('mcInput')?.blur());
    await s.until(() => s.stored('p') === 'a prototype note', 'it is written');
    await l.close();
  });
} finally {
  fs.rmSync(data, { recursive: true, force: true });
}
console.log('CHAT DRAFT OK');
