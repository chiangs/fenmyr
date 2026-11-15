// A popup menu that keyboard and screen reader users can work. Its opener says whether it's open, Up and Down move
// between its items, and a menu opened from the keyboard starts on its first item and hands focus back when it goes.
const MOVES: Record<string, (at: number) => number> = {
  ArrowDown: at => at + 1,
  ArrowUp: at => (at < 0 ? -1 : at - 1),
  Home: () => 0,
  End: () => -1,
};

// whether the person's last move was a key or the pointer: a click focuses its button too, and a button tabbed to and
// then clicked still matches :focus-visible
let keyed = false;
addEventListener('keydown', () => (keyed = true), true);
addEventListener('pointerdown', () => (keyed = false), true);

export function menuKeys(m: HTMLElement) {
  const active = document.activeElement,
    opener = active instanceof HTMLButtonElement ? active : null,
    byKeys = keyed && !!opener,
    popup = opener?.hasAttribute('aria-haspopup') ? opener : null,
    items = [...m.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)')];
  m.setAttribute('role', 'menu');
  popup?.setAttribute('aria-expanded', 'true');
  // a menu goes by many routes (an item, Esc, a press outside, the next menu), so watch for it leaving the page
  new MutationObserver((_, watch) => {
    if (m.isConnected) return;
    watch.disconnect();
    popup?.setAttribute('aria-expanded', 'false');
    if (byKeys && document.activeElement === document.body) opener?.focus();
  }).observe(document.body, { childList: true });
  m.addEventListener('keydown', e => {
    if (e.key === 'Tab') return m.remove();
    const move = MOVES[e.key];
    if (!move) return;
    e.preventDefault();
    e.stopPropagation();
    const on = document.activeElement,
      at = on instanceof HTMLElement ? items.indexOf(on) : -1;
    items.at(move(at) % items.length)?.focus();
  });
  if (!byKeys) return;
  if (!items.length) m.tabIndex = -1;
  (items[0] ?? m).focus();
}
