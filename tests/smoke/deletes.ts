import type { Smoke } from './kit.ts';

// deleting a project, a folder or a board asks the same question: both lines, the name on the red button, cancel closes it
export async function deleteConfirm(t: Smoke) {
  const { page } = t;
  await page.evaluate(async () => {
    await Fenmyr.saveFolders({
      projects: [{ id: 'dp', name: 'Del project', color: 'pink', open: true }],
      folders: [{ id: 'df', name: 'Del folder', project: 'dp', open: true }],
    });
    await Fenmyr.save({ id: 'dbd', name: 'Del board', folder: 'df', cards: [], links: [] });
    await window.__fenmyr.refreshBoards();
  });
  const asked = async (target: string) => {
    await page.locator(target).first().click({ button: 'right' });
    await page.locator('#rowMenu [data-m="del"]').click();
    return page.evaluate(() => {
      const m = document.getElementById('rowMenu'),
        yes = m?.querySelector<HTMLElement>('[data-m="yes"]');
      return {
        question: m?.querySelector('.rm-q')?.textContent ?? '',
        sub: m?.querySelector('.rm-sub')?.textContent ?? '',
        label: yes?.textContent ?? '',
        red: yes ? getComputedStyle(yes).backgroundColor : '',
        wide: (m?.getBoundingClientRect().width ?? 0) >= 340,
      };
    });
  };
  const project = await asked('.node.project > .node-head:has-text("Del project")');
  await page.locator('#rowMenu [data-m="no"]').click();
  const closed = (await page.locator('#rowMenu').count()) === 0;
  const folder = await asked('.node.folder > .node-head:has-text("Del folder")');
  await page.locator('#rowMenu [data-m="no"]').click();
  const board = await asked('.board-row:has-text("Del board")');
  const RED = 'rgb(214, 69, 93)',
    SUB = 'This can’t be undone.';
  t.checkAll('deleteConfirm', {
    project:
      project.question === 'Delete “Del project” and the 1 board inside it?' &&
      project.label === 'Delete “Del project”',
    folder:
      folder.question === 'Delete “Del folder” and the 1 board inside it?' && folder.label === 'Delete “Del folder”',
    board: board.question === 'Delete “Del board”?' && board.label === 'Delete “Del board”',
    secondLine: [project, folder, board].every(c => c.sub === SUB),
    red: [project, folder, board].every(c => c.red === RED),
    wide: [project, folder, board].every(c => c.wide),
    cancelCloses: closed,
  });
  await page.locator('#rowMenu [data-m="yes"]').click();
  await page.waitForTimeout(500);
  t.checkAll('deleteConfirmDeletes', {
    gone: (await page.locator('.board-row:has-text("Del board")').count()) === 0,
  });
  await page.evaluate(async () => {
    await Fenmyr.saveFolders({ projects: [], folders: [] });
    await window.__fenmyr.refreshBoards();
  });
}

// deleting the board you are on: its neighbour opens, the deleted one is gone for good (even with an edit still waiting to save), and the last board leaves a fresh one
export async function deleteCurrent(t: Smoke) {
  const { page } = t;
  await page.evaluate(async () => {
    const boards: [string, string, string | undefined][] = [
      ['dc1', 'DC One', undefined],
      ['dc2', 'DC Two', undefined],
      ['dc3', 'DC Three', undefined],
      ['dca', 'DCF A', 'dcf'],
      ['dcb', 'DCF B', 'dcf'],
    ];
    for (const [id, name, folder] of boards)
      await Fenmyr.save({
        id,
        name,
        ...(folder ? { folder } : {}),
        cards: [],
        links: [],
        tray: [],
        trayLinks: [],
        palette: [],
      });
    await Fenmyr.saveFolders({ projects: [], folders: [{ id: 'dcf', name: 'DC folder', open: true }] });
    await window.__fenmyr.refreshBoards();
  });
  const rows = async (scope: string) =>
      (await page.locator(`${scope} .board-row`).allTextContents()).map(x => x.trim()),
    current = () => page.evaluate(() => window.__fenmyr.board.name),
    onDisk = (id: string) => page.evaluate(async id => (await Fenmyr.list()).some(b => b.id === id), id),
    del = async (target: string) => {
      await page.locator(target).first().click({ button: 'right' });
      await page.locator('#rowMenu [data-m="del"]').click();
      await page.locator('#rowMenu [data-m="yes"]').click();
      await page.waitForTimeout(1500);
    };
  // 1) the open board, with an edit still waiting to save, among the loose boards: the next one down opens
  await page.evaluate(() => window.__fenmyr.openBoard('dc2'));
  await page.waitForTimeout(700);
  await page.evaluate(() => window.__fenmyr.newNote(0, 0));
  await page.keyboard.type('unsaved words');
  await page.keyboard.press('Escape');
  const loose = await rows('.loose-zone'),
    at = loose.indexOf('DC Two'),
    expected1 = loose[at + 1] ?? loose[at - 1];
  await del('.loose-zone .board-row:has-text("DC Two")');
  const first = { now: await current(), disk: await onDisk('dc2'), rows: await rows('#boards') };
  // 2) the last board of a folder: the one above it opens
  const inFolder = await rows('.node.folder:has-text("DC folder")'),
    last = inFolder[inFolder.length - 1] ?? '',
    lastId = last === 'DCF A' ? 'dca' : 'dcb';
  await page.evaluate(id => window.__fenmyr.openBoard(id), lastId);
  await page.waitForTimeout(700);
  await del(`.node.folder .board-row:has-text("${last}")`);
  const second = { now: await current(), expected: inFolder[inFolder.length - 2] };
  // 3) the folder the open board is in: the first board left in the sidebar opens
  await del('.node.folder > .node-head:has-text("DC folder")');
  const remaining = await rows('#boards'),
    third = { now: await current(), expected: remaining[0] };
  t.checkAll('deleteCurrent', {
    nextDown: first.now === expected1,
    goneForGood: !first.disk && !first.rows.includes('DC Two'),
    upWhenLast: second.now === second.expected,
    folderDelete: third.now === third.expected && !remaining.includes('DCF A') && !remaining.includes('DCF B'),
  });
  await page.evaluate(async () => {
    for (const id of ['dc1', 'dc3']) await Fenmyr.remove(id);
    await Fenmyr.saveFolders({ projects: [], folders: [] });
    await window.__fenmyr.refreshBoards();
  });
}

// the last board: deleting it leaves a fresh one, and says so. Runs after everything else, because it empties the library.
export async function deleteLastBoard(t: Smoke) {
  const { page } = t;
  // Open the board first: leaving the one before writes its waiting save, which would bring it back if the others were
  // removed already, and leave two boards in the library.
  await page.evaluate(async () => {
    await Fenmyr.save({ id: 'dlast', name: 'Last one', cards: [], links: [], tray: [], trayLinks: [], palette: [] });
    await window.__fenmyr.refreshBoards();
    await window.__fenmyr.openBoard('dlast');
  });
  await page.waitForTimeout(700);
  await page.evaluate(async () => {
    for (const b of await Fenmyr.list()) if (b.id !== 'dlast') await Fenmyr.remove(b.id);
    await Fenmyr.saveFolders({ projects: [], folders: [] });
    await window.__fenmyr.refreshBoards();
  });
  await page.waitForTimeout(300);
  // an earlier check leaves Myra quiet, and a quiet Myra doesn't chirp
  await page.evaluate(() => window.__fenmyr.setGreet(false, 'normal'));
  const was = await page.evaluate(() => window.__fenmyr.board.id);
  await page.locator('.loose-zone .board-row').first().click({ button: 'right' });
  await page.locator('#rowMenu [data-m="del"]').click();
  await page.locator('#rowMenu [data-m="yes"]').click();
  await page.waitForTimeout(1500);
  const after = await page.evaluate(async () => ({
    id: window.__fenmyr.board.id,
    name: window.__fenmyr.board.name,
    n: (await Fenmyr.list()).length,
    said: document.body.textContent?.includes('That was your last board') ?? false,
  }));
  t.checkAll('deleteLastBoard', {
    fresh: after.id !== was && after.name === 'My first board' && after.n === 1,
    says: after.said,
  });
}
