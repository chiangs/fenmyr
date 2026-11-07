// Popups and menus: the one place that knows whether one is open, so a press that closes one isn't also taken as
// a click on what lies under it.
type Dismissal = { inside: string; isOpen: () => boolean; close: () => void };

const dismissals: Dismissal[] = [];
// popups that close by their own rules, only counted here
const others: (() => boolean)[] = [];
// popups that a press anywhere outside them removes
const transient = new Set<Element>();

type Press = { id: number; x: number; y: number; travel: number; release: (travel: number) => void };
const watchers: ((e: PointerEvent) => ((travel: number) => void) | null)[] = [];
let presses: Press[] = [];

/** Whether any popup or menu is open. */
export const menuOpen = () =>
  [...transient].some(p => p.isConnected) || dismissals.some(d => d.isOpen()) || others.some(isOpen => isOpen());

let listening = false;
function listen() {
  if (listening) return;
  listening = true;
  addEventListener(
    'pointerdown',
    e => {
      // watchers see the press before it closes anything, so menuOpen() still says what was open under it
      for (const watch of watchers) {
        const release = watch(e);
        if (release) presses.push({ id: e.pointerId, x: e.clientX, y: e.clientY, travel: 0, release });
      }
      const target = e.target instanceof Element ? e.target : null;
      for (const d of dismissals) if (d.isOpen() && !target?.closest(d.inside)) d.close();
      for (const p of transient)
        if (!p.isConnected || !target || !p.contains(target)) {
          p.remove();
          transient.delete(p);
        }
    },
    true,
  );
  addEventListener(
    'pointermove',
    e => {
      for (const p of presses)
        if (p.id === e.pointerId) p.travel = Math.max(p.travel, Math.hypot(e.clientX - p.x, e.clientY - p.y));
    },
    true,
  );
  addEventListener(
    'pointerup',
    e => {
      const ended = presses.filter(p => p.id === e.pointerId);
      presses = presses.filter(p => p.id !== e.pointerId);
      for (const p of ended) p.release(Math.max(p.travel, Math.hypot(e.clientX - p.x, e.clientY - p.y)));
    },
    true,
  );
  addEventListener(
    'pointercancel',
    e => {
      presses = presses.filter(p => p.id !== e.pointerId);
    },
    true,
  );
}

/** While `isOpen` says so, a press anywhere outside `inside` (a CSS selector) calls `close`. */
export function closeOnOutsidePress(inside: string, isOpen: () => boolean, close: () => void) {
  listen();
  dismissals.push({ inside, isOpen, close });
}

/** Counts a popup that closes by its own rules as an open menu while `isOpen` says so. */
export function countAsMenu(isOpen: () => boolean) {
  others.push(isOpen);
}

/** Removes a popup that was just opened at the next press outside it. */
export function removeOnOutsidePress(popup: Element) {
  listen();
  // the press that opened it is still on its way
  setTimeout(() => {
    if (popup.isConnected) transient.add(popup);
  });
}

/** Calls `watch` on every press, before any popup closes for it. When it returns a function, that runs at the
 *  release with the farthest the pointer travelled from the press, so a click can be told from a drag. */
export function watchPresses(watch: (e: PointerEvent) => ((travel: number) => void) | null) {
  listen();
  watchers.push(watch);
}

const EDGE = 10;

// Nudges a popup that was placed at the pointer back inside the window.
export function keepOnScreen(popup: HTMLElement) {
  const r = popup.getBoundingClientRect();
  if (r.bottom > innerHeight - EDGE) popup.style.top = `${Math.max(EDGE, innerHeight - r.height - EDGE)}px`;
  if (r.right > innerWidth - EDGE) popup.style.left = `${innerWidth - r.width - EDGE}px`;
}

export function showDialog(html: string, id?: string) {
  const wrap = document.createElement('div');
  if (id) wrap.id = id;
  wrap.className = 'tdlg-wrap';
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  return wrap;
}
