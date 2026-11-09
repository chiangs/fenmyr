import { withoutNul } from '../../shared/chat.ts';
import { uid } from '../core/base.ts';
import { $ } from '../core/dom.ts';
import { session } from '../core/state.ts';
import { child, closestTo, elementById, esc } from '../ui/dom.ts';
import { isPlainPaste } from '../ui/plainPaste.ts';
import { showDialog } from '../ui/popover.ts';
import { pasteAction, pastedLabel } from './chatRules.ts';
import { say } from './say.ts';
import { addToNext, filesInNext, pastedChars, pastesOf, removeAdded } from './seesStrip.ts';

// A paste over PASTE_AT characters becomes a chip in the "Myra sees" strip instead of filling the box. It goes with the
// next message as a text file, the way an added file does, so the words never ride in the prompt or in the chat log.

const box = () => elementById('mcInput', HTMLTextAreaElement);

function onPaste(e: ClipboardEvent) {
  // a picture or file on the clipboard is the Add chips' to take
  if (e.defaultPrevented || e.clipboardData?.files.length) return;
  const el = box(),
    text = withoutNul(e.clipboardData?.getData('text/plain') ?? ''),
    action = pasteAction({
      text,
      plain: isPlainPaste(e),
      native: Fenmyr.native,
      kept: el.value.length - (el.selectionEnd - el.selectionStart) + pastedChars(session.board.id),
      attachments: filesInNext(),
    });
  if (action.type === 'insert') return;
  e.preventDefault();
  if (action.type === 'refuse') say(action.why, 6000);
  else addToNext([{ kind: 'paste', id: uid(), text }]);
}

// The text as pasted, read-only. Put in message turns it back into words at the caret, for anyone who pasted with the
// mouse and has no shortcut to skip the chip.
function openPaste(id: string) {
  const text = pastesOf(session.board.id).find(p => p.id === id)?.text;
  if (text === undefined) return;
  const label = esc(pastedLabel(text)),
    d = showDialog(
      `<div class="tdlg pasted" role="dialog" aria-modal="true" aria-label="${label}"><h3>${label}</h3><pre class="pasted-text" tabindex="0"></pre><div class="tdlg-btns"><button type="button" class="set-btn" data-put>Put in message</button><button type="button" class="set-btn hot" data-close>Close</button></div></div>`,
    );
  child(d, '.pasted-text').textContent = text;
  const close = (toBox: boolean) => {
    removeEventListener('keydown', onKey, true);
    d.remove();
    if (toBox) box().focus();
    else
      $('mcSees')
        .querySelector<HTMLElement>(`[data-open="${CSS.escape(id)}"]`)
        ?.focus();
  };
  const put = () => {
    removeAdded(id);
    close(true);
    document.execCommand('insertText', false, text);
  };
  // Esc is this dialog's alone, so neither the chat nor the board hears it. Tab stays among the dialog's own controls,
  // as aria-modal promises.
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Tab') {
      const stops = [...d.querySelectorAll<HTMLElement>('.pasted-text, button')],
        edge = stops[e.shiftKey ? 0 : stops.length - 1];
      if (document.activeElement !== edge && d.contains(document.activeElement)) return;
      e.preventDefault();
      stops[e.shiftKey ? stops.length - 1 : 0]?.focus();
      return;
    }
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    close(false);
  }
  addEventListener('keydown', onKey, true);
  d.onclick = e => {
    if (e.target === d) close(false);
    else if (closestTo(e.target, '[data-close]')) close(false);
    else if (closestTo(e.target, '[data-put]')) put();
  };
  child(d, '[data-close]').focus();
}

export function initPasted() {
  box().addEventListener('paste', onPaste);
  $('mcSees').addEventListener('click', e => {
    const id = closestTo(e.target, '[data-open]')?.dataset.open;
    if (id) openPaste(id);
  });
}
