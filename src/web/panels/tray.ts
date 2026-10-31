// @ts-nocheck
import { toWorld } from '../canvas/handles.ts';
import { overTray } from '../canvas/pointer.ts';
import { renderTray, takeFromTray } from '../canvas/wires.ts';
import { $ } from '../core/dom.ts';
import { homeAt } from '../library/home.ts';
import { openVaultPicker } from '../vault/ask.ts';
import { session } from '../core/state.ts';

// ---------- the tray: drag ideas out onto the board ----------
// Unsorted collapses to its title with its – button, like the other widgets, and remembers it
const trayMin = min => {
  $('tray').classList.toggle('closed', min);
  $('trayMin').textContent = min ? '+' : '–';
  $('trayMin').title = min ? 'Open' : 'Minimise';
  try {
    localStorage.setItem('fenmyr:trayMin', min ? '1' : '');
  } catch (e) {}
};
export function init17() {
  try {
    trayMin(!!localStorage.getItem('fenmyr:trayMin'));
  } catch (e) {}

  $('trayMin').onclick = e => {
    e.stopPropagation();
    trayMin(!$('tray').classList.contains('closed'));
  };

  $('trayList').addEventListener('pointerdown', e => {
    const it = e.target.closest('.tray-item');
    if (!it) return;
    e.preventDefault();
    const c = session.board.tray.find(x => x.id === it.dataset.id),
      ghost = it.cloneNode(true);
    Object.assign(ghost.style, {
      position: 'fixed',
      width: it.offsetWidth + 'px',
      pointerEvents: 'none',
      zIndex: 99,
      left: e.clientX - 40 + 'px',
      top: e.clientY - 20 + 'px',
      rotate: '-3deg',
    });
    document.body.appendChild(ghost);
    it.style.opacity = 0.3;
    const mv = ev => {
      ghost.style.left = ev.clientX - 40 + 'px';
      ghost.style.top = ev.clientY - 20 + 'px';
    };
    const up = ev => {
      removeEventListener('pointermove', mv);
      removeEventListener('pointerup', up);
      ghost.remove();
      it.style.opacity = '';
      if (!overTray(ev) && !ev.target.closest('.side, .box')) {
        const w = toWorld(ev.clientX, ev.clientY);
        takeFromTray(c, { x: w.x - c.w / 2, y: w.y - 20 });
        renderTray();
      }
    };
    addEventListener('pointermove', mv);
    addEventListener('pointerup', up);
  });

  // no system beep: keys pressed on the board (not while typing) are Myra's own, so tell the system they were handled.
  // Otherwise Delete, Escape, arrows and the letter shortcuts fall through to the window, and macOS beeps.
  // Alt+N: a note from a vault (the letter shortcuts below ignore Alt)
  addEventListener('keydown', e => {
    if (!e.altKey || e.metaKey || e.ctrlKey || e.shiftKey || e.code !== 'KeyN' || homeAt || !Fenmyr.native) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"]') || $('vaultPick')) return;
    e.preventDefault();
    openVaultPicker();
  });

  addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea, select, [contenteditable="true"]'))
      return;
    if (e.key === ' ' && e.target.closest?.('button, a, [role="button"]')) return; // Space still presses a focused button
    if (
      /^(Backspace|Delete|Escape|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End|PageUp|PageDown)$/.test(e.key) ||
      e.key.length === 1
    )
      e.preventDefault();
  });
}
