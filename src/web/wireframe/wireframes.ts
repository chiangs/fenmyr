// @ts-nocheck
import { typesWith } from '../../shared/cardTypes.ts';
import { applyStroke } from '../canvas/render.ts';

// ---------- wireframes: screens, boxes and text, a design panel, and snapping ----------
export const WF = typesWith('wireframe');

export const DEVICES = {
  iPhone: [393, 852, 44],
  Android: [412, 915, 28],
  iPad: [834, 1194, 20],
  Desktop: [1440, 1024, 10],
  Watch: [205, 251, 40],
};

export let FONTS = ['Figtree', 'Shantell Sans'];

export function styleWF(c, el) {
  el.classList.add('wf');
  c.r = 0;
  el.style.setProperty('--rot', (c.rot || 0) + 'deg');
  el.classList.toggle('grouped', !!c.group);
  if (!el.querySelector('.rot-h')) el.insertAdjacentHTML('beforeend', '<i class="rot-h" title="Drag to rotate"></i>');
  if (c.type === 'icon') {
    el.style.setProperty('--isz', Math.min(c.w, c.h) + 'px');
    el.style.setProperty('--ic', c.color || '#27272a');
  }
  if (c.type === 'frame') {
    el.style.setProperty('--fr-fill', c.fill === 'none' ? 'transparent' : c.fill || '#ffffff');
    el.classList.toggle('no-fill', c.fill === 'none');
    el.style.setProperty('--fr-r', (c.radius ?? 0) + 'px');
  }
  if (c.type === 'box')
    Object.assign(el.querySelector('.bx').style, {
      background: c.src
        ? `center / cover no-repeat url("${c.src}")`
        : c.fill === 'none'
          ? 'transparent'
          : c.fill || '#e4e4e7',
      borderRadius: (c.radius || 0) + 'px',
      opacity: c.opacity ?? 1,
      boxShadow: 'none',
      border: '0',
    });
  if (c.type === 'text') {
    el.style.height = 'auto';
    Object.assign(el.querySelector('.tx').style, {
      fontFamily: `"${c.font || 'Figtree'}", system-ui`,
      fontSize: (c.size || 18) + 'px',
      fontWeight: c.weight || 500,
      color: c.color && c.color !== 'none' ? c.color : '#27272a',
      textAlign: c.align || 'left',
      lineHeight: c.lh || 1.3,
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
