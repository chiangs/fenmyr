import { $ } from '../core/dom.ts';
import { settings } from './settings.ts';
import { PANELS, htmlOrNull } from './colors.ts';

// the height of one row, so a panel never shrinks past it
const rowHeight = (list: HTMLElement, selector: string) => htmlOrNull(list.querySelector(selector))?.offsetHeight;

export const panelMin = (k: string) =>
  k === 'layers'
    ? Math.max(30, rowHeight($('layers'), '.ly') || 30)
    : k === 'boards'
      ? Math.max(30, rowHeight($('boards'), '.board-row, .folder-row, .proj-row') || 32)
      : k === 'tray'
        ? 60
        : 120;

export function applyPanelH() {
  Object.entries(PANELS).forEach(([k, f]) => {
    const el = f();
    if (!el) return;
    const v = settings.panelH[k];
    if (v) {
      const h = Math.max(panelMin(k), v);
      Object.assign(el.style, {
        height: h + 'px',
        minHeight: '0',
        maxHeight: 'none',
        flex: `0 1 ${h}px`,
        overflowY: 'auto',
        overflowX: k === 'tray' || k === 'design' ? 'hidden' : '',
      });
    } else
      Object.assign(el.style, { height: '', minHeight: '', maxHeight: '', flex: '', overflowY: '', overflowX: '' });
    el.closest('.design, .tray')?.classList.toggle('sized', !!v);
  });
  fitSides();
}

// Wireframe and Unsorted share the right column: a height you dragged (or saved) is a wish, trimmed so everything in the column stays on screen (Wireframe gives way first)
export function fitSides() {
  document.querySelectorAll('.side').forEach(side => {
    let over = side.scrollHeight - side.clientHeight;
    if (over < 2) return;
    ['design', 'tray'].forEach(k => {
      const el = PANELS[k]?.();
      if (over < 2 || !el || !el.closest('.side') || el.closest('.side') !== side || !el.closest('.sized')) return;
      const cur = el.getBoundingClientRect().height,
        h = Math.max(panelMin(k), Math.floor(cur - over));
      if (h >= cur) return;
      Object.assign(el.style, { height: h + 'px', flex: `0 1 ${h}px` });
      over -= cur - h;
    });
  });
}

// the height grips bulge on hover: the line widens and swells into a small round peak above and below, with a wobble that settles (a damped spring on its width and thickness)
export function gripBulge(grip: HTMLElement) {
  const NS = 'http://www.w3.org/2000/svg',
    svg = document.createElementNS(NS, 'svg'),
    path = document.createElementNS(NS, 'path');
  svg.setAttribute('viewBox', '0 0 200 40');
  svg.appendChild(path);
  grip.appendChild(svg);
  const REST = { w: 15, t: 4 },
    HOT = { w: 20, t: 11 },
    st = { w: REST.w, t: REST.t, vw: 0, vt: 0 };
  let raf = 0,
    last = 0;
  const draw = () => {
    const N = 36,
      top: string[] = [],
      bot: string[] = [];
    for (let i = 0; i <= N; i++) {
      const u = -1 + (2 * i) / N,
        h = i === 0 || i === N ? 2 : 2 + (st.t / 2 - 2) * Math.exp(-u * u * 9),
        x = (100 + u * st.w).toFixed(2);
      top.push(`${x},${(20 - h).toFixed(2)}`);
      bot.push(`${x},${(20 + h).toFixed(2)}`);
    }
    path.setAttribute(
      'd',
      `M${top.join(' L')} A2,2 0 0 1 ${bot[N] ?? ''} L${bot.reverse().join(' L')} A2,2 0 0 1 ${top[0] ?? ''} Z`,
    );
  };
  const goal = () => (grip.matches(':hover') || grip.classList.contains('on') ? 1 : 0);
  const tick = (now: number) => {
    const dt = Math.min(32, now - (last || now)) / 1000;
    last = now;
    const g = goal(),
      gw = REST.w + (HOT.w - REST.w) * g,
      gt = REST.t + (HOT.t - REST.t) * g;
    st.vw += (-190 * (st.w - gw) - 14 * st.vw) * dt;
    st.w += st.vw * dt;
    st.vt += (-230 * (st.t - gt) - 7 * st.vt) * dt;
    st.t = Math.max(2.5, st.t + st.vt * dt);
    draw();
    if (Math.abs(st.w - gw) + Math.abs(st.t - gt) + Math.abs(st.vw) * 0.05 + Math.abs(st.vt) * 0.05 < 0.05) {
      st.w = gw;
      st.t = gt;
      st.vw = st.vt = 0;
      draw();
      raf = 0;
      last = 0;
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  const kick = () => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const g = goal();
      st.w = g ? HOT.w : REST.w;
      st.t = g ? HOT.t : REST.t;
      draw();
    } else if (!raf) raf = requestAnimationFrame(tick);
  };
  ['pointerenter', 'pointerleave', 'pointerdown', 'pointerup', 'lostpointercapture'].forEach(ev =>
    grip.addEventListener(ev, () => setTimeout(kick, 0)),
  );
  draw();
}
