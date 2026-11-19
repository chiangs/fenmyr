import type { BoardLists } from '../../shared/changes.ts';
import type { Card } from '../../shared/model.ts';
import { $ } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { session } from '../core/state.ts';
import { chirp } from '../myra/say.ts';
import { settings } from '../settings/settings.ts';
import { applySettings } from '../settings/widgets.ts';
import { cardEl, esc } from '../ui/dom.ts';
import { renderCard } from './render.ts';
import { renderWires } from './wires.ts';

type Point = { x: number; y: number };

let trayN: number | null = null;

export function renderTray() {
  if (window.__phone?.on) setTimeout(window.__phone.count);
  // Unsorted turned off in Settings: still say when something lands there, with a way to see it
  if (settings.wTray === false && trayN !== null && session.board.tray.length > trayN)
    chirp('Saved to Unsorted ✦', 4000, [
      {
        label: 'Show Unsorted',
        run: () => {
          settings.wTray = true;
          applySettings();
        },
      },
    ]);
  trayN = session.board.tray.length;
  const list = $('trayList');
  list.innerHTML = '';
  $('trayCount').textContent = String(session.board.tray.length);
  session.board.tray.forEach(c => {
    const d = document.createElement('div');
    d.className = 'tray-item';
    d.dataset.id = c.id;
    d.style.setProperty('--tilt', `${(c.r ?? 0) / 2}deg`);
    const src = c.type === 'image' ? esc(c.src) : '';
    d.innerHTML = c.type === 'image' ? `<img src="${src}">` : esc(c.type === 'link' ? c.title || c.url : c.text);
    list.appendChild(d);
  });
}

// Unsorted keeps ideas simple: every card is its own item. But cards that were joined by connectors when they went in stay tied (c.tie, and their
// connectors wait in board.trayLinks), so pulling one back out brings the others with it, laid out as they were, reconnected
export function sendToTray(cards: Card[]) {
  const ids = new Set(cards.map(c => c.id)),
    joined = session.board.links.filter(l => ids.has(l.a) && ids.has(l.b)),
    up = new Map(cards.map(c => [c.id, c.id]));
  const root = (start: string) => {
    let id = start;
    for (let next = up.get(id); next !== undefined && next !== id; next = up.get(id)) id = next;
    return id;
  };
  joined.forEach(l => {
    up.set(root(l.a), root(l.b));
  });
  const size: Record<string, number> = {};
  cards.forEach(c => {
    const r = root(c.id);
    size[r] = (size[r] || 0) + 1;
  });
  cards.forEach(c => {
    const r = root(c.id);
    if ((size[r] ?? 0) > 1) c.tie = r;
    else delete c.tie;
  });
  session.board.trayLinks = [...(session.board.trayLinks || []), ...joined];
  session.board.cards = session.board.cards.filter(c => !ids.has(c.id));
  session.board.links = session.board.links.filter(l => !ids.has(l.a) && !ids.has(l.b));
  cards.forEach(c => {
    session.board.tray.unshift(c);
    cardEl(c.id)?.remove();
  });
}

// back onto the board with c's top-left at `at`; the rest of its group follows. Returns everything that came out.
export function pullFromTray(b: BoardLists, c: Card, at: Point) {
  const members = c.tie ? b.tray.filter(m => m.tie === c.tie) : [c];
  if (!members.includes(c)) members.push(c);
  const dx = at.x - c.x,
    dy = at.y - c.y,
    ids = new Set(members.map(m => m.id));
  members.forEach(m => {
    if (m === c) {
      m.x = at.x;
      m.y = at.y;
    } else {
      m.x += dx;
      m.y += dy;
    }
  });
  const back = (b.trayLinks || []).filter(l => ids.has(l.a) && ids.has(l.b));
  b.trayLinks = (b.trayLinks || []).filter(l => !back.includes(l));
  b.links.push(...back);
  b.tray = b.tray.filter(m => !ids.has(m.id));
  members.forEach(m => {
    delete m.tie;
    b.cards.push(m);
  });
  return members;
}

export function takeFromTray(c: Card, at: Point) {
  const members = pullFromTray(session.board, c, at);
  members.forEach(m => {
    renderCard(m, true);
  });
  save();
  renderWires();
  return members;
}
