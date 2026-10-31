// @ts-nocheck
import { cardEl } from '../ui/dom.ts';
import { renderWires } from '../canvas/wires.ts';
import { parentOf } from '../cards/collection.ts';
import { cardsEl } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { GUIDE } from './chat.ts';
import { say } from '../settings/licenses.ts';
import { appState, session } from '../core/state.ts';

// ---------- Myra's helpers: Claude Code, Mobbin, Higgsfield ----------
let lastConn = 0;

export async function showConnections(force) {
  if (!force && Date.now() - lastConn < 5 * 60 * 1000) return;
  lastConn = Date.now();
  const els = [...document.querySelectorAll('.conns')];
  els.forEach(el => {
    if (!el.children.length)
      el.innerHTML = ['Claude Code', 'Mobbin', 'Higgsfield']
        .map(
          n => `<div class="conn"><span class="dot"></span>${n}<em style="color:var(--ink-faint)">checking…</em></div>`,
        )
        .join('');
  });
  const c = await Fenmyr.connections().catch(() => ({}));
  if (!c.browser) appState.haveClaude = !!c.claude;
  const rows = [
    ['claude', 'Claude Code', GUIDE, 'Set up'],
    ['mobbin', 'Mobbin', 'https://claude.ai/settings/connectors', 'Connect'],
    ['higgsfield', 'Higgsfield', 'https://claude.ai/settings/connectors', 'Connect'],
  ];
  els.forEach(el => {
    el.innerHTML = '';
    // Connect clears the 5-minute wait, so the app looks again the moment they come back from claude.ai
    rows.forEach(([k, name, url, verb]) => {
      const r = document.createElement('div');
      r.className = 'conn' + (c[k] ? ' on' : '');
      r.innerHTML = `<span class="dot"></span>${name}`;
      if (c[k]) r.insertAdjacentHTML('beforeend', '<em>ready</em>');
      else if (!c.browser) {
        const b = document.createElement('button');
        b.textContent = verb;
        b.onclick = () => {
          lastConn = 0;
          Fenmyr.openURL(url);
          say(
            k === 'claude'
              ? 'Follow the steps on that page, then come back. I’ll notice as soon as Claude Code is ready!'
              : `Connect ${name} in your Claude settings (Connectors), then come back. I'll check again when you reopen me ✦`,
            9000,
          );
        };
        r.appendChild(b);
      }
      el.appendChild(r);
    });
  });
}

export function removeSelected() {
  const gone = new Set(session.sel);
  session.board.cards = session.board.cards.filter(c => !gone.has(c.id));
  session.board.links = session.board.links.filter(l => !gone.has(l.a) && !gone.has(l.b));
  gone.forEach(id => cardEl(id)?.remove());
  session.sel.clear();
  cardsEl.querySelectorAll('.card.inside').forEach(el => {
    if (!parentOf(el.dataset.id)) {
      el.classList.remove('inside');
    }
  });
  renderWires();
  save();
}
export function init40() {
  addEventListener('focus', () => showConnections());
}
