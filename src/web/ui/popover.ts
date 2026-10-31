type Dismissal = { inside: string; close: () => void };

const dismissals: Dismissal[] = [];

// A press anywhere outside `inside` (a CSS selector) calls `close`, which should do nothing when already closed.
export function closeOnOutsidePress(inside: string, close: () => void) {
  if (!dismissals.length)
    addEventListener(
      'pointerdown',
      e => {
        const target = e.target instanceof Element ? e.target : null;
        for (const d of dismissals) if (!target?.closest(d.inside)) d.close();
      },
      true,
    );
  dismissals.push({ inside, close });
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
