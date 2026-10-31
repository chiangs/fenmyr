// @ts-nocheck
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
    let cur = null;
    const clearable = el =>
      !!el &&
      !!el.tagName &&
      (el.tagName === 'INPUT' ? el.type === 'text' || el.type === 'search' : el.id === 'mcInput') &&
      !el.readOnly &&
      !el.disabled &&
      !el.closest('.dv-title, .board-name, .card, [data-no-clear]') &&
      !el.matches('.dv-title, .board-name');
    const place = () => {
      if (!cur || !cur.isConnected || !cur.value) {
        btn.hidden = true;
        return;
      }
      const r = cur.getBoundingClientRect();
      if (!r.width || r.bottom < 0 || r.top > innerHeight) {
        btn.hidden = true;
        return;
      }
      const S = 20;
      btn.hidden = false;
      btn.style.left = r.right - S - 6 + 'px';
      btn.style.top = (cur.tagName === 'TEXTAREA' ? r.top + 6 : r.top + (r.height - S) / 2) + 'px';
    };
    addEventListener(
      'pointerdown',
      e => {
        if (e.target.closest && e.target.closest('#clrBtn')) {
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
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.focus();
      place();
    });
  }
}
