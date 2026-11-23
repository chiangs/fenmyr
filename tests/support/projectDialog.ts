// What the tests of the New project dialog read and do: opening it, its rows and field, what a choice made, and what the
// template menu lists.
import assert from 'node:assert';
import type { Page } from 'playwright';
import type { Folder, Project } from '../../src/shared/model.ts';
import type { BoardSummary } from '../../src/shared/ops.ts';
import { stored } from './library.ts';
import { still } from './settled.ts';

export function projectDialog(page: Page) {
  const onBoard = async (id: string) => {
    await page.evaluate(async b => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      await window.__fenmyr.openBoard(b);
      document.getElementById('homeClose')?.click();
    }, id);
    await still(page);
  };
  const home = async (at: string) => {
    await page.evaluate(h => window.__fenmyr.openHome(h), at);
    await still(page);
  };
  const open = async (name?: string) => {
    await page.evaluate(n => window.__fenmyr.openNewProject(n), name);
    await page.waitForSelector('#npDlg');
    await still(page);
  };
  const shown = () => page.evaluate(() => !!document.getElementById('npDlg'));
  const gone = () => page.waitForSelector('#npDlg', { state: 'detached' });
  const row = (name: string) => page.locator('#npDlg .np-row', { hasText: name });
  const field = () =>
    page.evaluate(() => {
      const f = document.getElementById('npName');
      return f instanceof HTMLInputElement
        ? {
            value: f.value,
            selected: f.selectionStart === 0 && f.selectionEnd === f.value.length,
            focused: f === document.activeElement,
          }
        : null;
    });
  const rows = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('#npDlg .np-row')].map(r => ({
        name: r.querySelector('b')?.textContent ?? '',
        line: r.querySelector('small')?.textContent ?? '',
        on: r.classList.contains('on'),
        hidden: r instanceof HTMLElement && r.hidden,
        aria: r.getAttribute('aria-selected'),
      })),
    );
  const visibleNames = async () => (await rows()).filter(r => !r.hidden).map(r => r.name);
  const headings = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('#npDlg .np-h')]
        .filter(h => h instanceof HTMLElement && !h.hidden)
        .map(h => h.textContent ?? ''),
    );
  const selected = async () => (await rows()).filter(r => r.on).map(r => r.name);
  // What the template menu lists, whether or not it is open
  const menu = () =>
    page.evaluate(() => ({
      html: document.getElementById('tplPick')?.innerHTML ?? '',
      names: [...document.querySelectorAll('#tplPick .tp-list button b')].map(b => b.textContent ?? ''),
      heads: [...document.querySelectorAll('#tplPick .tp-h')].map(h => h.textContent ?? ''),
    }));

  const fresh = <T extends { id: string }>(was: T[], now: T[]) => now.filter(x => !was.some(y => y.id === x.id));
  type Made = { projects: Project[]; folders: Folder[]; boards: BoardSummary[] };
  // What a choice made: runs `act`, waits for the dialog to go, and says what is new
  async function made(act: () => Promise<unknown>): Promise<Made> {
    const before = await stored(page);
    await act();
    await gone();
    await still(page);
    const after = await stored(page);
    return {
      projects: fresh(before.projects, after.projects),
      folders: fresh(before.folders, after.folders),
      boards: fresh(before.boards, after.boards),
    };
  }
  // One project with a Boards folder in it and one board in that
  function oneStart(m: Made) {
    assert.deepStrictEqual([m.projects.length, m.folders.length, m.boards.length], [1, 1, 1], 'one of each');
    const [project] = m.projects,
      [folder] = m.folders,
      [board] = m.boards;
    assert.ok(project && folder && board);
    assert.deepStrictEqual([folder.name, folder.project, folder.parent ?? null], ['Boards', project.id, null]);
    assert.strictEqual(board.folder, folder.id, 'the board is in that folder');
    return { project, folder, board };
  }
  const cardsOpen = () => page.evaluate(() => window.__fenmyr.curBoard().cards.length);
  const openId = () => page.evaluate(() => window.__fenmyr.curBoard().id);

  return {
    onBoard,
    home,
    open,
    shown,
    gone,
    row,
    field,
    rows,
    visibleNames,
    headings,
    selected,
    menu,
    made,
    oneStart,
    cardsOpen,
    openId,
  };
}
