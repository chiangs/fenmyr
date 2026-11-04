// Runs inside the preview frame, first, and sends what happens there to the preview pane: errors, console lines and,
// while pointing, the element clicked. It's turned into text with toString(), so it uses nothing from outside itself.
export function previewBridge() {
  const send = (type: string, data: Record<string, string>) =>
    parent.postMessage({ fenmyrPreview: true, type, ...data }, '*');
  const words = (x: unknown) => {
    if (typeof x === 'string') return x;
    try {
      return JSON.stringify(x);
    } catch {
      return String(x);
    }
  };
  addEventListener('error', e => send('error', { text: String(e.message), where: e.lineno ? `line ${e.lineno}` : '' }));
  addEventListener('unhandledrejection', e =>
    send('error', { text: words(e.reason instanceof Error ? e.reason.message : e.reason), where: '' }),
  );
  for (const level of ['log', 'warn', 'error'] as const) {
    const was = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      send('console', { level, text: args.map(words).join(' ').slice(0, 2000) });
      was(...args);
    };
  }
  let pointing = false;
  let lit: HTMLElement | null = null;
  const light = (el: HTMLElement | null) => {
    if (lit) lit.style.outline = '';
    lit = el;
    if (lit) lit.style.outline = '2px solid #6d6af0';
  };
  addEventListener('message', e => {
    if (e.source !== parent || typeof e.data !== 'object' || e.data === null || !('fenmyrPoint' in e.data)) return;
    pointing = e.data.fenmyrPoint === true;
    document.documentElement.style.cursor = pointing ? 'crosshair' : '';
    if (!pointing) light(null);
  });
  const describe = (el: Element) => {
    const parts: string[] = [];
    for (let n: Element | null = el; n && parts.length < 4; n = n.parentElement) {
      if (n.id) {
        parts.unshift(`${n.tagName.toLowerCase()}#${n.id}`);
        break;
      }
      const cls = [...n.classList].slice(0, 2).join('.');
      parts.unshift(n.tagName.toLowerCase() + (cls ? `.${cls}` : ''));
    }
    return parts.join(' > ');
  };
  addEventListener('mouseover', e => pointing && light(e.target instanceof HTMLElement ? e.target : null), true);
  addEventListener(
    'click',
    e => {
      if (!pointing || !(e.target instanceof Element)) return;
      e.preventDefault();
      e.stopPropagation();
      send('point', { selector: describe(e.target), text: (e.target.textContent ?? '').trim().slice(0, 80) });
    },
    true,
  );
}
