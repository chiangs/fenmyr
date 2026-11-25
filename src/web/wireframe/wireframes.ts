import { typesWith } from '../../shared/cardTypes.ts';
import type { Card } from '../../shared/model.ts';
import { applyStroke } from '../canvas/render.ts';
import { oneIn } from '../ui/dom.ts';

// ---------- wireframes: screens, boxes and text, and snapping ----------
export const WF = typesWith('wireframe');

// width, height and corner radius, in the order keys 1 to 5 pick them
export const DEVICES = {
  iPhone: [393, 852, 44],
  Android: [412, 915, 28],
  iPad: [834, 1194, 20],
  Desktop: [1440, 1024, 10],
  Watch: [205, 251, 40],
} as const satisfies Record<string, readonly [w: number, h: number, radius: number]>;
export type Device = keyof typeof DEVICES;
export const isDevice = (x: unknown): x is Device => typeof x === 'string' && Object.hasOwn(DEVICES, x);

export let FONTS = ['Figtree', 'Shantell Sans'];

export function styleWF(c: Card, el: HTMLElement) {
  el.classList.add('wf');
  c.r = 0;
  el.style.setProperty('--rot', `${c.rot || 0}deg`);
  el.classList.toggle('grouped', !!c.group);
  if (!el.querySelector('.rot-h')) el.insertAdjacentHTML('beforeend', '<i class="rot-h" title="Drag to rotate"></i>');
  if (c.type === 'icon') {
    el.style.setProperty('--isz', `${Math.min(c.w, c.h)}px`);
    el.style.setProperty('--ic', c.color || '#27272a');
    el.style.setProperty('--if', c.fill || 'none');
    // the glyph is drawn in a 256 unit box, so a stroke in screen pixels is scaled by this
    el.style.setProperty('--isk', String(256 / Math.min(c.w, c.h)));
  }
  if (c.type === 'frame') {
    el.style.setProperty('--fr-fill', c.fill === 'none' ? 'transparent' : c.fill || '#ffffff');
    el.classList.toggle('no-fill', c.fill === 'none');
    el.style.setProperty('--fr-r', `${c.radius ?? 0}px`);
  }
  const bx = oneIn(el, '.bx'),
    tx = oneIn(el, '.tx');
  if (c.type === 'box' && bx)
    Object.assign(bx.style, {
      background: c.src
        ? `center / cover no-repeat url("${c.src}")`
        : c.fill === 'none'
          ? 'transparent'
          : c.fill || '#e4e4e7',
      borderRadius: `${c.radius || 0}px`,
      opacity: String(c.opacity ?? 1),
      boxShadow: 'none',
      border: '0',
    });
  if (c.type === 'text' && tx) {
    el.style.height = 'auto';
    Object.assign(tx.style, {
      fontFamily: `"${c.font || 'Figtree'}", system-ui`,
      fontSize: `${c.size || 18}px`,
      fontWeight: String(c.weight || 500),
      color: c.color && c.color !== 'none' ? c.color : '#27272a',
      textAlign: c.align || 'left',
      lineHeight: String(c.lh || 1.3),
    });
    requestAnimationFrame(() => {
      const h = el.offsetHeight;
      if (h && Math.abs(h - c.h) > 1) c.h = h;
    });
  }
  applyStroke(c, el);
}
export function init46() {
  Fenmyr.fonts()
    .then(f => {
      if (f?.length) FONTS = f;
    })
    .catch(() => {});
}
