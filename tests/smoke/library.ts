import fs from 'node:fs';
import path from 'node:path';
import type { Smoke } from './kit.ts';

// Your own templates, and Obsidian vaults: connecting one, notes on the board, and Myra reading them.
export async function library(t: Smoke) {
  await templates(t);
  await vaults(t);
  await vaultAI(t);
  await vaultTasks(t);
}

// save the board as a template, see it under Yours, add it to a board (twice: new ids each time) and open it as a new board
async function templates(t: Smoke) {
  const res = await t.page.evaluate(async () => {
    const T = window.__t,
      M = window.__fenmyr;
    const tpl = await M.saveAsTemplate('Smoke template', null, { desc: 'For testing', mode: 'add' });
    const saved = !!tpl && tpl.name === 'Smoke template' && tpl.cards.length > 3;
    T.click('#tools [data-add="tpl"]');
    await T.wait(200);
    const row = T.el('[data-mine]'),
      words = row.textContent ?? '',
      listed =
        words.includes('Smoke template') && words.includes('For testing') && words.includes('Adds to this board');
    const before = M.board.cards.length;
    row.click();
    await T.wait(800);
    const mid = M.board.cards.length;
    T.click('#tools [data-add="tpl"]');
    await T.wait(200);
    T.click('[data-mine]');
    await T.wait(800);
    const adds =
      mid > before &&
      M.board.cards.length === mid + (mid - before) &&
      new Set(M.board.cards.map(c => c.id)).size === M.board.cards.length;
    const id = M.board.id;
    if (tpl) await M.useTemplate(tpl, 'new');
    await T.wait(800);
    const asNew =
      !!tpl && M.board.id !== id && M.board.name === 'Smoke template' && M.board.cards.length === tpl.cards.length;
    return { saved, listed, adds, asNew };
  });
  t.checkAll('templates', res);
}

// connect a vault, give this board access, add a note (private ones stay out), flip it, load its full text (never saved), then take access away
async function vaults(t: Smoke) {
  const { page, data } = t,
    vp = path.join(data, 'vault');
  fs.cpSync(path.join(import.meta.dirname, '..', 'sample-vault'), vp, { recursive: true });
  fs.writeFileSync(
    path.join(vp, 'Reading', 'Long.md'),
    '# Long\n\n' +
      Array.from(
        { length: 40 },
        (_, i) => `Paragraph ${i + 1} of a long note, long enough to push the end well past the preview.`,
      ).join('\n\n') +
      '\n\nZZ-END\n',
  );
  const res = await page.evaluate(async vp => {
    const T = window.__t,
      M = window.__fenmyr;
    const v = await Fenmyr.vaultAdd(vp);
    await Fenmyr.vaultUpdate(v.id, { off: ['Private'] });
    M.board.vaultAccess = [{ vault: v.id, folders: [''], ai: false, write: false, writeTo: 'Myra' }];
    const tool0 = !T.el('[data-add="vnote"]').hidden;
    M.openVaultPicker();
    await T.wait(500);
    const names = T.all('#vaultPick .vp-row b')
      .map(b => b.textContent)
      .sort();
    const add = async (q: string) => {
      const box = T.input('#vpQ');
      box.value = q;
      box.dispatchEvent(new Event('input'));
      await T.wait(500);
      T.click('#vaultPick .vp-row');
      await T.wait(600);
    };
    await add('trip');
    const c = M.board.cards.find(x => x.type === 'vnote'),
      first = {
        names: names.join(),
        title: c?.title,
        tags: c?.tags?.join(),
        shown: !!document.querySelector('.card.vnote .vn-title')?.textContent,
        tool: !T.el('[data-add="vnote"]').hidden || tool0,
      };
    // flip to the back, ask for the full text: shown, but never stored on the card
    M.openVaultPicker();
    await T.wait(400);
    await add('long');
    const lc = M.board.cards.find(x => x.type === 'vnote' && x.title === 'Long');
    if (!lc || lc.type !== 'vnote') throw new Error('the long note was not added');
    const el = () => T.el(`[data-id="${lc.id}"]`),
      words = () => el().textContent ?? '';
    T.click(`[data-id="${lc.id}"] .vn-flip`);
    await T.wait(500);
    const side = lc.side === 'back' && !!el().querySelector('.vn-ex'),
      beforeFull = !words().includes('ZZ-END');
    T.click(`[data-id="${lc.id}"] [data-act="vn-full"]`);
    await T.wait(700);
    const fullShown = words().includes('ZZ-END'),
      fullSaved = JSON.stringify(M.board).includes('ZZ-END');
    T.click(`[data-id="${lc.id}"] [data-act="vn-full"]`);
    await T.wait(300);
    const lessAgain = !words().includes('ZZ-END');
    M.board.vaultAccess = [];
    await M.refreshVNotes();
    const blocked = c?.type === 'vnote' && !!c.blocked && !c.excerpt && !c.tags?.length;
    return { ...first, side, beforeFull, fullShown, fullSaved, lessAgain, blocked };
  }, vp);
  await page.evaluate(async () => {
    const v = (await Fenmyr.vaults())[0];
    if (v)
      window.__fenmyr.board.vaultAccess = [{ vault: v.id, folders: [''], ai: false, write: false, writeTo: 'Myra' }];
  });
  await page.mouse.click(5, 300);
  await page.keyboard.press('Alt+n');
  await page.waitForTimeout(500);
  const altN = await page.evaluate(() => !!document.getElementById('vaultPick'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  t.checkAll('vault', {
    names: res.names === '2026-10-20,Cloudberries,East bog,Long,Trip plan',
    title: res.title === 'Trip plan',
    tags: res.tags === 'trip,cloudberries,today',
    shown: res.shown,
    tool: res.tool,
    side: res.side,
    beforeFull: res.beforeFull,
    fullShown: res.fullShown,
    fullNotSaved: !res.fullSaved,
    lessAgain: res.lessAgain,
    blocked: res.blocked,
    altN,
  });
}

// Myra reads vault notes only with the grant's switch on and the chip ticked for that question; only allowed folders; and she says what she read
async function vaultAI(t: Smoke) {
  const { page, data } = t,
    promptNow = () => fs.readFileSync(path.join(data, 'prompt.txt'), 'utf8');
  const chip = await page.evaluate(async () => {
    const T = window.__t,
      M = window.__fenmyr,
      v = (await Fenmyr.vaults())[0];
    if (!v) throw new Error('no vault');
    M.board.vaultAccess = [{ vault: v.id, folders: ['Projects'], ai: false, write: false, writeTo: 'Myra' }];
    M.applyToolbar();
    const hiddenWhenOff = T.el('#mcVault').hidden;
    M.board.vaultAccess = [{ vault: v.id, folders: ['Projects'], ai: true, write: false, writeTo: 'Myra' }];
    M.applyToolbar();
    const shown = !T.el('#mcVault').hidden;
    await M.ask('what do I know about cloudberries?');
    return { hiddenWhenOff, shown };
  });
  const before = promptNow(),
    withoutChip =
      !before.includes('dries out by August') &&
      !before.includes('FROM THEIR OBSIDIAN VAULT') &&
      before.includes('did not ask you to this time');
  const ticked = await page.evaluate(async () => {
    const T = window.__t,
      M = window.__fenmyr;
    T.click('#mcVault');
    const on = T.el('#mcVault').classList.contains('on');
    await M.ask('what do I know about cloudberries?');
    await T.wait(300);
    return {
      on,
      said: (document.body.textContent ?? '').includes('I read 2 notes from your vault'),
      reset: !T.el('#mcVault').classList.contains('on'),
    };
  });
  const p = promptNow(),
    withChip =
      p.includes('FROM THEIR OBSIDIAN VAULT') &&
      p.includes('dries out by August') &&
      p.includes('Pack boots') &&
      !p.includes('Cloudberries ripen from amber') &&
      !p.includes('Nobody should read this') &&
      !p.includes('Dear diary');
  // notes she lists become cards, but only ones she was given
  const cards = await page.evaluate(async () => {
    const M = window.__fenmyr,
      v = (await Fenmyr.vaults())[0];
    if (!v) throw new Error('no vault');
    const n = M.board.cards.filter(c => c.type === 'vnote').length;
    await M.applyMyra(
      {
        say: 'ok',
        vaultNotes: [
          { vault: v.name, path: 'Projects/Bog Notes/East bog.md' },
          { vault: v.name, path: 'Private/Diary.md' },
        ],
      },
      'q',
      {
        asked: true,
        used: [
          {
            vault: v.name,
            vaultId: v.id,
            rel: 'Projects/Bog Notes/East bog.md',
            title: 'East bog',
            tags: ['place'],
            props: [],
            excerpt: 'x',
            text: 'x',
          },
        ],
      },
    );
    const now = M.board.cards.filter(c => c.type === 'vnote').length;
    M.board.vaultAccess = [];
    M.applyToolbar();
    return now - n;
  });
  t.checkAll('vaultAI', {
    chipHiddenWhenOff: chip.hiddenWhenOff,
    chipShown: chip.shown,
    withoutChip,
    chipOn: ticked.on,
    withChip,
    said: ticked.said,
    chipReset: ticked.reset,
    oneCard: cards === 1,
  });
}

// asking for tasks: the app collects the unfinished ones (narrowed to the request's names, sub-tasks kept, due date
// read) and says what it used; Myra's kanban with cards in its columns is built from her reply
async function vaultTasks(t: Smoke) {
  const { page, data } = t,
    vp = path.join(data, 'vault'),
    promptNow = () => fs.readFileSync(path.join(data, 'prompt.txt'), 'utf8');
  fs.writeFileSync(
    path.join(vp, 'Projects/Gifts.md'),
    [
      '# Gifts',
      '- [x] Order the wrapping paper',
      '- [ ] Buy a gift for Ruth 📅 2026-12-20',
      '  - [x] Pick a shop',
      '  - [ ] Wrap it',
      '- [/] Card for Max',
      '- [ ] Unrelated chore',
    ].join('\n'),
  );
  // Myra may read the Projects folder, and the chip is ticked for one question
  const askTasks = (q: string) =>
    page.evaluate(async q => {
      const T = window.__t,
        M = window.__fenmyr,
        v = (await Fenmyr.vaults())[0];
      if (!v) throw new Error('no vault');
      M.board.vaultAccess = [{ vault: v.id, folders: ['Projects'], ai: true, write: false, writeTo: 'Myra' }];
      M.applyToolbar();
      T.click('#mcVault');
      await M.ask(q);
      await T.wait(300);
      return document.body.textContent ?? '';
    }, q);
  const said = /I used 2 unfinished tasks from 1 note in your vault \(\d+ open in all/.test(
      await askTasks('take all my tasks that are not completed and add a kanban board for the xmas/ruth/max ones'),
    ),
    p = promptNow(),
    prompt =
      p.includes('THEIR UNFINISHED TASKS') &&
      p.includes('Buy a gift for Ruth') &&
      p.includes('due 2026-12-20') &&
      p.includes('[x] Pick a shop') &&
      p.includes('Card for Max (in progress)') &&
      !p.includes('Unrelated chore') &&
      !p.includes('Order the wrapping paper');
  const kanban = await page.evaluate(async () => {
    const M = window.__fenmyr,
      b = M.board;
    await M.applyMyra({
      say: 'ok',
      collections: [{ name: 'Xmas gifts', kanban: true, columns: ['Ruth', 'Max'], x: 0, y: 900 }],
      add: [
        {
          type: 'todo',
          text: 'Buy a gift for Ruth',
          items: ['Pick a shop', { t: 'Wrap it', done: true }],
          due: '2026-12-20',
          in: 'Xmas gifts',
          column: 'Ruth',
        },
        { type: 'todo', text: 'Card for Max', items: ['Write it'], in: 'Xmas gifts', column: 'Max' },
      ],
    });
    const k = b.cards.find(c => c.type === 'coll' && c.text === 'Xmas gifts');
    if (k?.type !== 'coll') return { made: false, columns: false, sub: false, due: false };
    const [a, c] = k.kids.map(id => b.cards.find(x => x.id === id));
    if (a?.type !== 'todo' || !c) return { made: true, columns: false, sub: false, due: false };
    return {
      made: k.kanban === true && k.colNames?.join() === 'Ruth,Max',
      columns: k.colOf?.[a.id] === 0 && k.colOf?.[c.id] === 1,
      sub: a.items?.length === 2 && a.items[1]?.done === true && a.items[0]?.done === false,
      due: a.due === '2026-12-20' && !!document.querySelector(`[data-id="${a.id}"] .due`),
    };
  });
  const nothing = /found none that match your words/.test(
    await askTasks('list my unfinished tasks about the moon landing'),
  );
  await page.evaluate(() => {
    window.__fenmyr.board.vaultAccess = [];
    window.__fenmyr.applyToolbar();
  });
  t.checkAll('vaultTasks', {
    said,
    prompt,
    kanbanMade: kanban.made,
    kanbanColumns: kanban.columns,
    kanbanSub: kanban.sub,
    kanbanDue: kanban.due,
    nothing,
    noEmptyBoard: promptNow().includes('Do not build, fill or empty any board'),
  });
  fs.rmSync(path.join(vp, 'Projects/Gifts.md'));
}
