import type { Page } from 'playwright';

/** Pastes `text` into Myra's input as a clipboard event, and says whether the app took the paste over (so the browser
 *  would not have typed it). `plain` presses Ctrl+Shift+V first. */
export const pasteIntoChat = (page: Page, text: string, plain = false) =>
  page.evaluate(
    ({ text, plain }) => {
      if (plain)
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'V', code: 'KeyV', ctrlKey: true, shiftKey: true }));
      const data = new DataTransfer();
      data.setData('text/plain', text);
      const e = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
      document.getElementById('mcInput')?.dispatchEvent(e);
      return e.defaultPrevented;
    },
    { text, plain },
  );

/** `lines` short lines of text, long enough to become a chip from 80 lines up. */
export const longText = (lines: number) =>
  Array.from({ length: lines }, (_, i) => `Line ${i + 1} of a long message`).join('\n');
