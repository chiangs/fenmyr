// What the template tests read and do in Myra's chat and the template picker: her lines and their buttons, the slash
// menu's rows, the picker's rows, typing a command, and what a template made.
import type { Page } from 'playwright';
import { still } from './settled.ts';

export function templateChat(page: Page) {
  const lines = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('#mcList .mc-msg:not(.typing)')].map(d => ({
        who: d.classList.contains('me') ? 'me' : 'myra',
        text: d.firstChild?.textContent ?? '',
        acts: [...d.querySelectorAll('.m-acts button')].map(b => b.textContent ?? ''),
      })),
    );
  const cardCount = () => page.evaluate(() => window.__fenmyr.curBoard().cards.length);
  const boardId = () => page.evaluate(() => window.__fenmyr.curBoard().id);
  const chatIsOpen = () => page.evaluate(() => !!document.getElementById('myra')?.classList.contains('chat'));
  const menuShown = () =>
    page.evaluate(() => {
      const m = document.querySelector('.slash-menu');
      return m instanceof HTMLElement && !m.hidden;
    });
  // a hidden menu keeps the rows it last had, so what shows is read only while it shows
  const menuRows = () =>
    page.evaluate(() =>
      document.querySelector('.slash-menu[hidden]')
        ? []
        : [...document.querySelectorAll('.slash-menu button')].map(b => ({
            key: b.getAttribute('data-key') ?? '',
            on: b.classList.contains('on'),
            name: b.querySelector('b')?.firstChild?.textContent?.trim() ?? '',
            tag: b.querySelector('b i')?.textContent ?? '',
            line: b.querySelector('span')?.textContent ?? '',
          })),
    );
  const menuGroups = () =>
    page.evaluate(() =>
      document.querySelector('.slash-menu[hidden]')
        ? []
        : [...document.querySelectorAll('.slash-menu .slash-group')].map(g => g.textContent ?? ''),
    );
  const pickerRows = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('#tplPick .tp-list button')].map(b => ({
        name: b.querySelector('b')?.textContent ?? '',
        tag: b.querySelector('.tp-k')?.textContent ?? '',
        line: b.querySelector('small')?.textContent ?? '',
      })),
    );
  const asRows = (rows: { name: string; tag: string; line: string }[]) =>
    rows.map(({ name, tag, line }) => ({ name, tag, line }));

  async function openChat() {
    if (!(await chatIsOpen())) await page.click('#mPill');
    await page.waitForFunction(() => document.getElementById('mChat')?.checkVisibility({ visibilityProperty: true }));
    await still(page);
  }
  const pickerOn = () => page.evaluate(() => !!document.getElementById('tplPick')?.classList.contains('on'));
  async function togglePicker(on: boolean) {
    if ((await pickerOn()) !== on) await page.click('#tools [data-add="tpl"]');
    await page.waitForFunction(on => !!document.getElementById('tplPick')?.classList.contains('on') === on, on);
    await still(page);
  }
  // the names the picker's own search leaves showing
  async function pickerNames(q: string) {
    await togglePicker(true);
    await page.fill('#tpSearch', q);
    const names = await page.evaluate(() =>
      [...document.querySelectorAll('#tplPick .tp-list button:not([hidden]) b')].map(b => b.textContent ?? ''),
    );
    await togglePicker(false);
    return names;
  }

  // a command typed in full and sent: the menu is closed first, as it is when nothing is left to pick
  async function typed(text: string) {
    const mark = (await lines()).length;
    await page.fill('#mcInput', text);
    if (await menuShown()) await page.keyboard.press('Escape');
    await page.keyboard.press('Enter');
    return mark;
  }
  // Myra's lines after the first `mark` lines, once one of them has `part` in it
  async function heard(mark: number, part: string) {
    await page.waitForFunction(
      ([n, t]) =>
        [...document.querySelectorAll('#mcList .mc-msg:not(.typing)')]
          .slice(Number(n))
          .some(d => d.classList.contains('myra') && (d.firstChild?.textContent ?? '').includes(String(t))),
      [mark, part] as const,
    );
    await still(page);
    return (await lines()).slice(mark).filter(m => m.who === 'myra');
  }
  async function opened(name: string) {
    await page.waitForFunction(n => window.__fenmyr.curBoard().name === n, name);
    await still(page);
  }
  async function goTo(id: string) {
    await page.evaluate(id => window.__fenmyr.openBoard(id), id);
    await page.waitForFunction(id => window.__fenmyr.curBoard().id === id, id);
    await still(page);
  }

  // what a template made, without ids or the random tilt, and with places taken from the first card; a board's name
  // counts only when the template opened a new board
  const made = (skip: string | null) =>
    page.evaluate(skip => {
      const b = window.__fenmyr.curBoard(),
        cs = b.cards.filter(c => c.id !== skip),
        x0 = Math.min(...cs.map(c => c.x)),
        y0 = Math.min(...cs.map(c => c.y));
      return {
        name: skip === null ? b.name : '',
        folder: b.folder ?? null,
        cards: cs.map(c =>
          [c.type, 'text' in c ? c.text : '', 'name' in c ? c.name : '', c.x - x0, c.y - y0, c.w, c.h].join('|'),
        ),
      };
    }, skip);
  return {
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
  };
}
