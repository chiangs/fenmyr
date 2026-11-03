// The prototype board's columns, left to right: Myra's chat, the preview, the code and the canvas. Widths are what the
// person dragged them to; closed is what they folded. Kept free of the page, so the rule can be tested on its own.
export type Pane = 'preview' | 'code' | 'canvas';
export type Layout = { chat: number; preview: number; code: number; closed: Pane[] };

export const DEFAULT_LAYOUT: Layout = { chat: 320, preview: 400, code: 360, closed: [] };
export const MIN = { chat: 280, preview: 320, code: 260, canvas: 300 };
export const STRIP = 30;
export const DIVIDER = 6;

const PANES: Pane[] = ['preview', 'code', 'canvas'];
const FOLD_ORDER: Pane[] = ['canvas', 'code'];
const width = (p: Pane, l: Layout) => (p === 'canvas' ? MIN.canvas : l[p]);

// What's folded at this window width: the person's choice, then the canvas and then the code fold until the rest fits.
// The preview and Myra never fold on their own; a preview too narrow for its device scales down instead.
export function fit(l: Layout, windowWidth: number): Pane[] {
  const closed = new Set(l.closed);
  const need = () => l.chat + PANES.reduce((n, p) => n + DIVIDER + (closed.has(p) ? STRIP : width(p, l)), 0);
  for (const p of FOLD_ORDER) if (need() > windowWidth) closed.add(p);
  return PANES.filter(p => closed.has(p));
}
