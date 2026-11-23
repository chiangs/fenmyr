// /template in Myra's chat: the menu lists the picker's templates in its groups and filters as its search does; typing a
// name matches exactly, then by start, then by containing, and asks when several fit; each template does what the
// picker's row does; it all works with thinking off, and one undo takes a framework back.
import assert from 'node:assert';
import { launch } from './support/launch.ts';
import { still } from './support/settled.ts';
import { templateChat } from './support/templateChat.ts';

const note = { id: 'n', type: 'note', x: 0, y: 0, w: 220, h: 120, r: 0, color: 'white', text: 'A note' };
const board = (id: string, folder?: string) => ({
  id,
  name: id,
  folder,
  cards: [{ ...note }],
  links: [],
  tray: [],
  view: { x: 300, y: 200, z: 1 },
});
const l = await launch({
  boards: [board('menu', 'f'), board('a', 'f'), board('b', 'f'), board('loose')],
  open: 'menu',
  settings: { ai: false },
});
const { page } = l;
const {
  cardCount,
  boardId,
  chatIsOpen,
  menuShown,
  menuRows,
  menuGroups,
  pickerRows,
  asRows,
  openChat,
  pickerOn,
  togglePicker,
  pickerNames,
  typed,
  heard,
  opened,
  goTo,
  made,
  lines,
} = templateChat(page);

const GROUPS = ['Think', 'Capture', 'Plan', 'Look back', 'Build'];
const NAME = 'Weekly review';
const NEW_NAME = 'Client kickoff';

async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}

try {
  await page.evaluate(async () => {
    window.Fenmyr.ask = async (prompt: string) => {
      Reflect.set(window, 'asked', [...(Reflect.get(window, 'asked') ?? []), prompt]);
      return JSON.stringify({ say: 'Sure.' });
    };
    await window.Fenmyr.saveFolders({
      projects: [{ id: 'p', name: 'Shop', open: true }],
      folders: [{ id: 'f', name: 'Ideas', project: 'p', open: true }],
      order: {},
    });
    await window.__fenmyr.refreshBoards();
  });
  await openChat();

  await check('the menu lists the picker’s groups and rows, in its order and words', async () => {
    for (const text of ['/template', '/template ']) {
      await page.fill('#mcInput', text);
      assert.ok(await menuShown(), `${JSON.stringify(text)} opens the menu`);
      assert.deepStrictEqual(await menuGroups(), GROUPS, 'every group, in the picker’s order');
      await togglePicker(true);
      const picker = await pickerRows();
      await togglePicker(false);
      await page.fill('#mcInput', text);
      assert.deepStrictEqual(asRows(await menuRows()), picker, 'each row has the picker’s name, line and tag');
    }
    const first = (await menuRows())[0];
    assert.ok(first?.on, 'the first row is selected');
  });

  await check('a saved template shows under Yours, once', async () => {
    await page.evaluate(
      async ([a, b]) => {
        await window.__fenmyr.saveAsTemplate(a ?? '', null, { desc: 'Every Friday', mode: 'add' });
        await window.__fenmyr.saveAsTemplate(b ?? '', null, { desc: '', mode: 'new' });
      },
      [NAME, NEW_NAME],
    );
    await page.fill('#mcInput', '');
    await page.fill('#mcInput', '/template');
    assert.deepStrictEqual(await menuGroups(), [...GROUPS, 'Yours']);
    const rows = await menuRows();
    assert.deepStrictEqual(
      rows.slice(-2).map(r => [r.name, r.line, r.tag]),
      [
        [NAME, 'Every Friday', 'Adds to this board'],
        [NEW_NAME, '1 card', 'Opens a new board ↗'],
      ],
    );
    await togglePicker(true);
    const picker = await pickerRows();
    await togglePicker(false);
    await page.fill('#mcInput', '/template');
    assert.deepStrictEqual(asRows(await menuRows()), picker, 'and the picker agrees');
  });

  await check('words after the command filter the rows as the picker’s search does', async () => {
    for (const q of ['kan', 'map', 'what they', 'weekly', 'ADD', 'zzz']) {
      await page.fill('#mcInput', `/template ${q}`);
      const menu = (await menuRows()).map(r => r.name);
      assert.deepStrictEqual(menu, await pickerNames(q), `${q}: the same rows as the picker`);
    }
    await page.fill('#mcInput', '/template map');
    assert.deepStrictEqual(
      (await menuRows()).map(r => r.name),
      ['Empathy map', 'Journey map', 'Affinity map', 'Opportunity map'],
    );
    assert.deepStrictEqual(await menuGroups(), ['Think'], 'and only the groups that still have a row');
    await page.fill('#mcInput', '/template zzz');
    assert.ok(!(await menuShown()), 'no row, no menu');
  });

  await check('arrows move, Esc closes the menu and not the chat, a click runs a row', async () => {
    await page.fill('#mcInput', '/template');
    await page.keyboard.press('ArrowDown');
    assert.deepStrictEqual((await menuRows()).map(r => r.on).indexOf(true), 1, 'Down selects the second row');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    const rows = await menuRows();
    assert.ok(rows.at(-1)?.on, 'Up from the first wraps to the last');
    await page.keyboard.press('Escape');
    assert.ok(!(await menuShown()), 'Esc closes the menu');
    assert.ok(await chatIsOpen(), 'and the chat stays');
    await page.fill('#mcInput', '/template');
    const mark = (await lines()).length,
      before = await cardCount();
    await page.click('.slash-menu [data-key="framework:retro"]');
    const said = await heard(mark, 'start, stop, continue');
    assert.ok(said.length, 'a click runs the row');
    assert.ok((await cardCount()) > before, 'and puts the cards on the board');
    assert.ok(!(await menuShown()), 'and the menu closes');
  });

  await check('Enter runs the selected row, filtered or not', async () => {
    const before = await cardCount();
    await page.fill('#mcInput', '/template kan');
    const mark = (await lines()).length;
    await page.keyboard.press('Enter');
    await heard(mark, 'kanban');
    assert.ok(
      await page.evaluate(() => window.__fenmyr.curBoard().cards.some(c => c.type === 'coll' && c.kanban)),
      'a Kanban is on the board',
    );
    assert.ok((await cardCount()) > before);
    await page.fill('#mcInput', '/template');
    const second = (await menuRows())[1]?.name ?? '';
    await page.keyboard.press('ArrowDown');
    const mark2 = (await lines()).length;
    await page.keyboard.press('Enter');
    await heard(mark2, second.toLowerCase());
  });

  await check('a name matches exactly, by its start, by containing it, or by its key, ignoring case', async () => {
    const cases: [text: string, line: string][] = [
      ['/template Kanban', 'kanban'],
      ['/template EMPATH', 'empathy map'],
      ['/template effort', 'impact / effort'],
      ['/template matrix', 'impact / effort'],
      ['/template hmw', 'how might we'],
      ['/template k', 'kanban'],
      [`/template ${NAME.toLowerCase()}`, `Here’s “${NAME}” ✦`],
    ];
    for (const [text, part] of cases) {
      const before = await cardCount(),
        mark = await typed(text),
        said = await heard(mark, part);
      assert.ok((await cardCount()) > before, `${text} adds cards`);
      assert.strictEqual(said.length, 1, `${text} is said once`);
      assert.deepStrictEqual(said[0]?.acts, [], `${text} asks nothing`);
    }
  });

  await check('an exact name wins over longer names that start with it', async () => {
    await page.evaluate(async () => {
      await window.__fenmyr.saveAsTemplate('Kan', null, { desc: '', mode: 'add' });
    });
    const mark = await typed('/template kan');
    const said = await heard(mark, 'Here’s “Kan” ✦');
    assert.deepStrictEqual(said[0]?.acts, [], 'it ran, rather than asking between Kan and Kanban');
  });

  await check('several matches are asked about, up to five, and a button runs its template', async () => {
    const before = await cardCount();
    let mark = await typed('/template map');
    let said = await heard(mark, 'Which one?');
    assert.deepStrictEqual(said[0]?.acts, ['Empathy map', 'Journey map', 'Affinity map', 'Opportunity map']);
    assert.strictEqual(await cardCount(), before, 'nothing is added until one is chosen');
    await page.locator('#mcList .m-acts button', { hasText: 'Journey map' }).click();
    said = await heard(mark + 1, 'journey map');
    assert.ok((await cardCount()) > before, 'a button adds its template');
    assert.deepStrictEqual((await lines()).find(m => m.text === 'Which one? ✦')?.acts.length, 0, 'and the row goes');
    mark = await typed('/template n');
    said = await heard(mark, 'Which one?');
    assert.deepStrictEqual(
      said[0]?.acts,
      ['Journey map', 'Affinity map', 'Opportunity map', 'Brain dump', 'OKRs and opportunities'],
      'five of the nine',
    );
  });

  await check('an unknown word offers close names and the picker', async () => {
    const before = await cardCount();
    let mark = await typed('/template kanbn');
    let said = await heard(mark, 'I don’t have a template called');
    assert.strictEqual(said[0]?.text, 'I don’t have a template called “kanbn” ✦');
    assert.deepStrictEqual(said[0]?.acts, ['Kanban', 'Open the template picker']);
    mark = await typed('/template zzzz');
    said = await heard(mark, '“zzzz”');
    assert.deepStrictEqual(said[0]?.acts, ['Open the template picker'], 'no name is close to zzzz');
    assert.strictEqual(await cardCount(), before, 'nothing is added');
    assert.ok(!(await pickerOn()));
    await page.locator('#mcList .m-acts button', { hasText: 'Open the template picker' }).last().click();
    await page.waitForFunction(() => document.getElementById('tplPick')?.classList.contains('on'));
    await togglePicker(false);
    mark = await typed('/template');
    said = await heard(mark, 'Say which one');
    assert.deepStrictEqual(said[0]?.acts, ['Open the template picker'], 'with no name she says how, and offers it');
  });

  await check('a board that opens says so, and a saved template added here keeps its own line', async () => {
    const id = await boardId();
    for (const [text, name] of [
      [`/template ${NEW_NAME}`, NEW_NAME],
      ['/template moodboard', 'Moodboard'],
    ]) {
      await typed(text ?? '');
      await opened(name ?? '');
      const said = await heard(0, `I opened a new ${name} ✦`);
      assert.strictEqual(said.length, 1, `${name}: the new board’s chat has her line, once`);
      assert.notStrictEqual(await boardId(), id);
      await goTo(id);
      await openChat();
    }
    const mark = await typed(`/template ${NAME}`);
    const said = await heard(mark, `Here’s “${NAME}” ✦`);
    assert.strictEqual(said.length, 1, 'a template added to this board is not confirmed twice');
  });

  await check('with thinking off it needs no ask, and one undo takes a framework back', async () => {
    await goTo('menu');
    await openChat();
    const before = await cardCount();
    // Sent in one task, so the second starts inside the 350 ms in which the first is still waiting for its own step.
    const counts = await page.evaluate(() => {
      const box = document.getElementById('mcInput'),
        form = box instanceof HTMLTextAreaElement ? box.form : null;
      return ['/template empathy', '/template kanban'].map(text => {
        if (box instanceof HTMLTextAreaElement) box.value = text;
        form?.requestSubmit();
        return window.__fenmyr.curBoard().cards.length;
      });
    });
    const [one, two] = counts;
    assert.ok(one !== undefined && two !== undefined && before < one && one < two, `both add cards: ${counts}`);
    await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
    await page.keyboard.press('Control+z');
    await page.waitForFunction(n => window.__fenmyr.curBoard().cards.length <= n, one);
    assert.strictEqual(await cardCount(), one, 'one undo removes the Kanban, with every card it added, and no more');
    assert.deepStrictEqual(
      await page.evaluate(() => Reflect.get(window, 'asked') ?? []),
      [],
      'nothing reached the bridge',
    );
  });

  await check('each kind does what the picker’s row does', async () => {
    const rowOf = async (kind: string) => {
      await togglePicker(true);
      const row =
        kind === 'framework'
          ? '#tplPick [data-tpl="kanban"]'
          : kind === 'starter'
            ? '#tplPick [data-starter="Moodboard"]'
            : `#tplPick [data-mine]:has(b:text-is("${kind === 'add' ? NAME : NEW_NAME}"))`;
      await page.click(row);
      await still(page);
    };
    const scenes: [kind: string, text: string, skip: string | null][] = [
      ['framework', '/template kanban', 'n'],
      ['starter', '/template moodboard', null],
      ['add', `/template ${NAME}`, 'n'],
      ['new', `/template ${NEW_NAME}`, null],
    ];
    for (const [kind, text, skip] of scenes) {
      await goTo('a');
      const from = await boardId();
      await rowOf(kind);
      if (skip === null) await page.waitForFunction(id => window.__fenmyr.curBoard().id !== id, from);
      await still(page);
      const viaPicker = await made(skip);
      await goTo('b');
      await openChat();
      await typed(text);
      if (skip === null) await page.waitForFunction(id => window.__fenmyr.curBoard().id !== id, 'b');
      await still(page);
      const viaCommand = await made(skip);
      assert.ok(viaPicker.cards.length > 0, `${kind}: the picker made cards`);
      assert.deepStrictEqual(viaCommand, viaPicker, `${kind}: the command makes what the picker makes`);
      if (skip === null) assert.strictEqual(viaPicker.folder, 'f', `${kind}: in the folder of the board it came from`);
    }
  });

  await check('Prototype starts the flow the picker’s Prototype row starts', async () => {
    await goTo('loose');
    await openChat();
    const dialog = () => page.evaluate(() => document.querySelector('.tdlg.sp')?.textContent ?? '');
    await togglePicker(true);
    await page.click('#tplPick [data-prototype]');
    await page.waitForSelector('.tdlg.sp');
    const viaPicker = await dialog();
    await page.click('.tdlg.sp [data-project=""]');
    await page.waitForSelector('.tdlg.sp', { state: 'detached' });
    await typed('/template prototype');
    await page.waitForSelector('.tdlg.sp');
    assert.match(await dialog(), /Which project is it for\?/);
    assert.strictEqual(await dialog(), viaPicker);
    await page.click('.tdlg.sp [data-project=""]');
  });

  await check('/help lists the command', async () => {
    const mark = await typed('/help');
    const said = await heard(mark, '/template <name>');
    assert.match(said[0]?.text ?? '', /\/template <name> {2}Add a template, or start a board from one/);
  });

  assert.deepStrictEqual(
    await page.evaluate(() => Reflect.get(window, 'asked') ?? []),
    [],
    'no ask reached the bridge',
  );
  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('slashTemplate: ok');
} finally {
  await l.close();
}
