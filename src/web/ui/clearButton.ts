import { closestTo } from './dom.ts';
export function init2() {
  // ---------- a clear (×) button on every search and text field ----------
  // One floating button, not one per field: it sits at the right edge of the field you are in (or pointing at) while it has text, so no field is wrapped and fields made later get it too.
  // It is set up first, so its pointerdown stops the "click outside closes" handlers registered further on (the button is not part of a popup).
  {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'clrBtn';
    btn.className = 'clr-btn';
    btn.setAttribute('aria-label', 'Clear');
    btn.tabIndex = -1;
    btn.innerHTML = Icon('close', { size: 11 });
    btn.hidden = true;
    document.body.appendChild(btn);
    let cur: HTMLInputElement | HTMLTextAreaElement | null = null;
    // a text field people type into themselves, not one the app fills in
    const clearable = (el: unknown): el is HTMLInputElement | HTMLTextAreaElement => {
      const field =
        el instanceof HTMLInputElement && (el.type === 'text' || el.type === 'search')
          ? el
          : el instanceof HTMLTextAreaElement && el.id === 'mcInput'
            ? el
            : null;
      return (
        !!field &&
        !field.readOnly &&
        !field.disabled &&
        !field.closest('.dv-title, .board-name, .card, [data-no-clear]') &&
        !field.matches('.dv-title, .board-name')
      );
    };
    const place = () => {
      if (!cur?.isConnected || !cur.value) {
        btn.hidden = true;
        return;
      }
      const r = cur.getBoundingClientRect();
      if (!r.width || r.bottom < 0 || r.top > innerHeight) {
        btn.hidden = true;
        return;
      }
      const S = 20,
        cs = getComputedStyle(cur),
        bar = cur.offsetWidth - cur.clientWidth - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
      btn.hidden = false;
      btn.style.left = `${r.right - Math.max(0, bar) - S - 6}px`;
      btn.style.top = `${cur.tagName === 'TEXTAREA' ? r.top + 6 : r.top + (r.height - S) / 2}px`;
    };
    addEventListener(
      'pointerdown',
      e => {
        if (closestTo(e.target, '#clrBtn')) {
          e.stopImmediatePropagation();
          e.preventDefault();
        }
      },
      true,
    );
    addEventListener(
      'pointerover',
      e => {
        if (clearable(e.target) && document.activeElement !== cur) {
          cur = e.target;
          place();
        }
      },
      true,
    );
    addEventListener(
      'pointerout',
      e => {
        if (cur && e.target === cur && document.activeElement !== cur && e.relatedTarget !== btn) {
          cur = null;
          place();
        }
      },
      true,
    );
    btn.addEventListener('pointerout', e => {
      if (cur && document.activeElement !== cur && e.relatedTarget !== cur) {
        cur = null;
        place();
      }
    });
    addEventListener(
      'focusin',
      e => {
        if (clearable(e.target)) {
          cur = e.target;
          place();
        }
      },
      true,
    );
    addEventListener(
      'focusout',
      e => {
        if (e.target === cur && e.relatedTarget !== btn) {
          cur = null;
          place();
        }
      },
      true,
    );
    addEventListener(
      'input',
      e => {
        if (e.target === cur) place();
      },
      true,
    );
    addEventListener('scroll', place, true);
    addEventListener('resize', place);
    btn.addEventListener('click', e => {
      e.stopPropagation();
      if (!cur) return;
      const el = cur;
      el.focus();
      el.select();
      // as an edit, not a new value, so Ctrl+Z brings the text back; it sends the input event itself
      document.execCommand('delete');
      place();
    });
  }
}
