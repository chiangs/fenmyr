// One behaviour check for each shortcut that styles text or works a list: on selected cards, and inside a note that is
// being typed in. The ids are the ones in SHORTCUTS.
import assert from 'node:assert';
import type { Page } from 'playwright';
import type { Check } from './keyChecks.ts';
import type { Kit } from './keyKit.ts';

export function noteChecks(page: Page, k: Kit): Record<string, Check> {
  let noteId = '';
  // a new note being typed in, its words "alpha two" all selected
  const typing = async () => {
    await k.reset();
    noteId = await page.evaluate(() => window.__fenmyr.newNote(0, 260));
    await page.waitForTimeout(200);
    await page.keyboard.type('alpha two');
    await page.keyboard.press('Control+a');
  };
  const state = (command: string) => page.evaluate(c => document.queryCommandState(c), command);
  const count = (selector: string) =>
    page.evaluate(([id, sel]) => document.querySelectorAll(`#cards [data-id="${id}"] ${sel}`).length, [
      noteId,
      selector,
    ] as const);
  const nested = () => count(':is(ul, ol) :is(ul, ol) li');
  const items = (list: string) => count(`${list} li`);
  // a whole card's style, which Ctrl+B and the others set when cards are selected rather than a note being typed in
  const styled = async (keys: string, prop: 'bold' | 'italic' | 'under') => {
    await k.reset();
    await k.select('b');
    await k.press(keys);
    return page.evaluate(
      ([id, p]) => {
        const c = window.__fenmyr.board.cards.find(c => c.id === id);
        return !!c && p !== undefined && p in c && Reflect.get(c, p) === true;
      },
      ['b', prop] as const,
    );
  };
  const mark =
    (id: string, command: string, prop: 'bold' | 'italic' | 'under'): Check =>
    async () => {
      await typing();
      await k.press(k.chord(id));
      assert.ok(await state(command), `${id} applies to the words selected in a note`);
      assert.ok(await styled(k.chord(id), prop), `${id} applies to a selected card`);
    };

  return {
    bold: mark('bold', 'bold', 'bold'),
    italic: mark('italic', 'italic', 'italic'),
    underline: mark('underline', 'underline', 'under'),

    strike: async () => {
      await typing();
      await k.press(k.chord('strike'));
      assert.ok(await state('strikeThrough'), 'strikethrough strikes the words through');
    },
    clear: async () => {
      await typing();
      await k.press(k.chord('bold'));
      assert.ok(await state('bold'), 'the words are bold');
      await k.press(k.chord('clear'));
      assert.ok(!(await state('bold')), 'clear formatting clears it, in a note');
      assert.ok(!(await k.has('body', 'clean')), 'and does not tuck the panels away');
    },
    bullets: async () => {
      await typing();
      await k.press(k.chord('bullets'));
      assert.strictEqual(await items('ul'), 1, 'bulleted list makes the line a list');
    },
    numbered: async () => {
      await typing();
      await k.press(k.chord('numbered'));
      assert.strictEqual(await items('ol'), 1, 'numbered list makes the line a list');
    },
    link: async () => {
      await typing();
      await k.press(k.chord('link'));
      assert.strictEqual(await page.locator('.note-link').count(), 1, 'add a link opens the link box in a note');
      assert.ok(!(await k.has('#capture', 'on')), 'not quick capture');
    },
    indent: async () => {
      await typing();
      await page.keyboard.type('one');
      await k.press(k.chord('bullets'));
      await page.keyboard.press('Enter');
      await page.keyboard.type('two');
      await k.press(k.chord('indent'));
      assert.strictEqual(await nested(), 1, 'indent puts the second item under the first');
    },
    outdent: async () => {
      await typing();
      await page.keyboard.type('one');
      await k.press(k.chord('bullets'));
      await page.keyboard.press('Enter');
      await page.keyboard.type('two');
      await k.press(k.chord('indent'));
      assert.strictEqual(await nested(), 1, 'the second item is indented');
      await k.press(k.chord('outdent'));
      assert.strictEqual(await nested(), 0, 'outdent brings it back out');
    },
  };
}
