import { htmlIn } from '../ui/dom.ts';
import type { Card } from '../../shared/model.ts';
import { $, cardsEl, stage } from '../core/dom.ts';
import { FS } from '../selbar/textSize.ts';

export function clearStuckDrag() {
  htmlIn(cardsEl, '.card.dragging').forEach(el => {
    el.classList.remove('dragging');
    el.style.transform = '';
    el.style.willChange = '';
  });
  stage.classList.remove('dragging-cards', 'cloning', 'panning');
}

export const overTray = (e: { clientX: number; clientY: number }) => {
  const r = $('tray').getBoundingClientRect();
  return e.clientX > r.left && e.clientY > r.top && e.clientY < r.bottom && !$('tray').classList.contains('closed');
};

// a text size from a scale: one of the named sizes when it lands on one, otherwise the number itself
export function setFs(c: Card, m0: number) {
  const m = +m0.toFixed(4),
    hit = Object.keys(FS).find(z => Math.abs((FS[z] ?? 0) - m) < 0.001);
  if (hit === 'm') delete c.fs;
  else c.fs = hit || m;
}

export const targetId = (e: Event) => (e.target instanceof Element ? e.target.id : '');
export const targetHas = (e: Event, cls: string) => e.target instanceof Element && e.target.classList.contains(cls);
