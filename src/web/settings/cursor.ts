// @ts-nocheck
import { luminance } from '../ui/color.ts';
import { stage } from '../core/dom.ts';
import { OS } from '../platform/osWords.ts';
import { MYRA_COLORS, settings } from './settings.ts';
import { drawOn } from '../tools/draw.ts';
import { placing } from '../tools/place.ts';
export let myCur;

const NATIVE =
  'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=button]):not([type=color]), textarea, select, [contenteditable="true"], .card.editing, .knob, .wires .w-end, .wires .w-bend, iframe, .wheel, .bright';

// the name tag: a rounded rectangle whose straight edges wobble gently (the corners stay clean), drawn to fit the name
function tagPath(w, h, phase) {
  const r = Math.min(8, h / 2 - 1),
    a = 0.8,
    step = 3,
    wav = (t, len) =>
      a * Math.sin((t / len) * Math.PI * Math.max(1, Math.round(len / 22)) + phase) * Math.sin((t / len) * Math.PI);
  const p = [`M${r} 0`];
  for (let x = r + step; x < w - r; x += step) p.push(`L${x.toFixed(1)} ${(-wav(x - r, w - 2 * r)).toFixed(2)}`);
  p.push(`L${w - r} 0A${r} ${r} 0 0 1 ${w} ${r}`);
  for (let y = r + step; y < h - r; y += step) p.push(`L${(w + wav(y - r, h - 2 * r)).toFixed(2)} ${y.toFixed(1)}`);
  p.push(`L${w} ${h - r}A${r} ${r} 0 0 1 ${w - r} ${h}`);
  for (let x = w - r - step; x > r; x -= step) p.push(`L${x.toFixed(1)} ${(h + wav(x - r, w - 2 * r)).toFixed(2)}`);
  p.push(`L${r} ${h}A${r} ${r} 0 0 1 0 ${h - r}`);
  for (let y = h - r - step; y > r; y -= step) p.push(`L${(-wav(y - r, h - 2 * r)).toFixed(2)} ${y.toFixed(1)}`);
  return p.join('') + `L0 ${r}A${r} ${r} 0 0 1 ${r} 0Z`;
}

function shapeTag() {
  const bub = myCur.querySelector('.bub'),
    svg = myCur.querySelector('.tagbg'),
    w = bub.offsetWidth,
    h = bub.offsetHeight;
  if (!w || !h) return;
  svg.setAttribute('width', w + 4);
  svg.setAttribute('height', h + 4);
  svg.setAttribute('viewBox', `-2 -2 ${w + 4} ${h + 4}`);
  Object.assign(svg.style, { left: bub.offsetLeft - 2 + 'px', top: bub.offsetTop - 2 + 'px' });
  const ps = [0, Math.PI * 0.66, Math.PI * 1.33].map(ph => tagPath(w, h, ph)),
    path = svg.querySelector('path');
  path.setAttribute('d', ps[0]);
  path.innerHTML = window.myraCalm
    ? ''
    : `<animate attributeName="d" dur="5s" repeatCount="indefinite" values="${ps.join(';')};${ps[0]}" calcMode="spline" keySplines="${'.45 0 .55 1;'.repeat(3).slice(0, -1)}"/>`;
}

export function paintCursor() {
  const m = MYRA_COLORS[settings.myra] || MYRA_COLORS.golden,
    c = m.B,
    edge = m.D; // your cursor wears Myra's color
  myCur.style.setProperty('--c', c);
  myCur.style.setProperty('--cs', edge);
  myCur.style.setProperty('--ct', luminance(c) > 0.4 ? '#3d3640' : '#ffffff');
  myCur.querySelector('.bub').textContent = (settings.name || 'You').slice(0, 24);
  requestAnimationFrame(shapeTag);
  document.body.classList.toggle(
    'fancy-cursor',
    settings.fancyCursor !== false && matchMedia('(hover: hover) and (pointer: fine)').matches,
  );
}
export function init27() {
  // ---------- your cursor: a little pointer and name tag in Myra's color ----------
  // It follows the mouse; over a card it turns into an open hand, and a fist while you drag. Text and inputs keep the system's own I-beam.
  myCur = document.createElement('div');
  myCur.className = 'mcur';
  myCur.setAttribute('aria-hidden', 'true');

  myCur.innerHTML =
    `<svg class="tipv" viewBox="0 0 20 22"><path d="M2.6 1.6 17.2 9.9c1 .6.9 1.5-.2 1.8l-6.1 1.8c-.5.2-.9.5-1.1 1l-2.6 6c-.5 1-1.4 1-1.7-.1L1.2 2.9c-.3-1.1.5-1.8 1.4-1.3Z"/></svg><svg class="tagbg" aria-hidden="true"><path/></svg>` +
    `<svg class="grabhand open" viewBox="0 0 34 34"><g class="o"><rect x="8.5" y="15" width="19.5" height="16" rx="7"/><rect x="8" y="4.2" width="5" height="15.5" rx="2.5" transform="rotate(-8 10.5 19)"/><rect x="13.2" y="1.2" width="5" height="17.5" rx="2.5"/><rect x="18.4" y="2.2" width="5" height="16.5" rx="2.5"/><rect x="23.4" y="5.6" width="4.6" height="14" rx="2.3" transform="rotate(8 25.7 19)"/><rect x="7.6" y="15.5" width="3.8" height="9" rx="1.9" transform="rotate(-42 9.5 24)"/></g><g class="f"><rect x="8.5" y="15" width="19.5" height="16" rx="7"/><rect x="8" y="4.2" width="5" height="15.5" rx="2.5" transform="rotate(-8 10.5 19)"/><rect x="13.2" y="1.2" width="5" height="17.5" rx="2.5"/><rect x="18.4" y="2.2" width="5" height="16.5" rx="2.5"/><rect x="23.4" y="5.6" width="4.6" height="14" rx="2.3" transform="rotate(8 25.7 19)"/><rect x="7.6" y="15.5" width="3.8" height="9" rx="1.9" transform="rotate(-42 9.5 24)"/></g></svg>` +
    `<svg class="grabhand fist" viewBox="0 0 34 34"><g class="o"><rect x="7.5" y="13" width="21" height="17" rx="7.5"/><circle cx="11" cy="13.6" r="3"/><circle cx="16" cy="12.6" r="3"/><circle cx="21" cy="12.8" r="3"/><circle cx="25.4" cy="14.4" r="2.7"/><rect x="6" y="17" width="12" height="5" rx="2.5" transform="rotate(-12 12 19.5)"/></g><g class="f"><rect x="7.5" y="13" width="21" height="17" rx="7.5"/><circle cx="11" cy="13.6" r="3"/><circle cx="16" cy="12.6" r="3"/><circle cx="21" cy="12.8" r="3"/><circle cx="25.4" cy="14.4" r="2.7"/><rect x="6" y="17" width="12" height="5" rx="2.5" transform="rotate(-12 12 19.5)"/></g></svg>` +
    `<svg class="rszv" viewBox="0 0 34 34"><g class="o"><path d="M17 3.5 22.8 11.5H18.8V22.5H22.8L17 30.5 11.2 22.5H15.2V11.5H11.2Z"/></g><g class="f"><path d="M17 3.5 22.8 11.5H18.8V22.5H22.8L17 30.5 11.2 22.5H15.2V11.5H11.2Z"/></g></svg>` +
    `<i class="ring"></i><div class="bub"></div>`;

  document.body.appendChild(myCur);

  document.fonts?.ready.then(() => requestAnimationFrame(shapeTag));

  addEventListener(
    'pointermove',
    e => {
      if (e.pointerType !== 'mouse' || !document.body.classList.contains('fancy-cursor')) return;
      myCur.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      myCur.classList.add('show');
      // at the window's edges, and over the top-left strip (the Mac's traffic lights, and the strip you drag the window by: the page never sees the pointer there), hand back the system cursor
      const strip = e.clientY < 44 && e.clientX < 240 && (OS === 'mac' || e.clientX >= 70),
        edge =
          Fenmyr.native &&
          (e.clientX < 8 || e.clientY < 8 || e.clientX > innerWidth - 8 || e.clientY > innerHeight - 8 || strip);
      document.body.classList.toggle('cur-edge', edge);
      const t = e.target,
        native = edge || !!(t.closest && t.closest(NATIVE));
      myCur.classList.toggle('hide', native);
      document.body.classList.toggle('cur-native', native);
      const onCard =
        !native && !placing && !drawOn && t.closest && t.closest('.card') && !t.closest('button, a, input');
      const rz =
        native || !t.closest
          ? null
          : t.closest('.rz-grip')
            ? 0
            : t.closest('#rh, .handle')
              ? -45
              : t.closest('.crop-box i[data-h]')
                ? /^(nw|se)$/.test(t.closest('.crop-box i[data-h]').dataset.h)
                  ? -45
                  : 45
                : t.closest('.resize-cursor')
                  ? 90
                  : null; // over a resize handle: her own double arrow, turned to fit (height grips, corners, table column edges)
      myCur.classList.toggle('rsz', rz !== null);
      if (rz !== null) myCur.style.setProperty('--rz', rz + 'deg');
      myCur.classList.toggle(
        'grabby',
        !!onCard || stage.classList.contains('space') || stage.classList.contains('panning'),
      );
    },
    { passive: true, capture: true },
  );

  addEventListener(
    'pointerdown',
    e => {
      if (e.pointerType !== 'mouse') return;
      myCur.classList.add('down');
      myCur.classList.remove('tap');
      void myCur.offsetWidth;
      myCur.classList.add('tap');
    },
    true,
  );

  addEventListener('pointerup', () => myCur.classList.remove('down'), true);

  document.addEventListener('pointerleave', () => myCur.classList.remove('show'));

  addEventListener('blur', () => myCur.classList.remove('show'));
}
