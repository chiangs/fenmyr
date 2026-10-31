// @ts-nocheck
import { renderCard } from '../canvas/render.ts';
import { renderWires, selectOnly } from '../canvas/wires.ts';
import { clamp } from '../core/base.ts';
import { $, cardsEl, stage } from '../core/dom.ts';
import { save } from '../core/history.ts';

// ---------- crop an image: see the whole picture, drag the box or its corners, then Done ----------
export let cropping = null;
let cropDrag = null;

export function startCrop(c) {
  const img = cardsEl.querySelector(`[data-id="${c.id}"] img`),
    nw = img?.naturalWidth || c.w,
    nh = img?.naturalHeight || c.h;
  cropping = { c, nw, nh, prevH: c.h, prevCrop: c.crop, box: Object.assign({ x: 0, y: 0, w: 1, h: 1 }, c.crop) };
  c.cropEdit = true;
  c.h = Math.round(((c.w - 16) * nh) / nw + 16);
  renderCard(c);
  selectOnly([c.id]);
  $('selbar').dataset.key = '';
  renderWires();
}

export function endCrop(how) {
  if (!cropping) return;
  const { c, nw, nh, prevH, prevCrop, box } = cropping;
  if (how === 'reset') {
    cropping.box = { x: 0, y: 0, w: 1, h: 1 };
    renderCard(c);
    selectOnly([c.id]);
    return;
  }
  if (how === 'done') {
    const full = box.w > 0.995 && box.h > 0.995;
    if (full) delete c.crop;
    else c.crop = { ...box };
    c.h = Math.round(((c.w - 16) * (nh * box.h)) / (nw * box.w) + 16);
  } else {
    c.h = prevH;
    if (prevCrop) c.crop = prevCrop;
    else delete c.crop;
  }
  delete c.cropEdit;
  cropping = null;
  renderCard(c);
  selectOnly([c.id]);
  $('selbar').dataset.key = '';
  renderWires();
  if (how === 'done') save();
}

export function cropDown(e) {
  const img = cardsEl.querySelector(`[data-id="${cropping.c.id}"] img`);
  if (!img) return;
  cropDrag = {
    h: e.target.closest('[data-h]')?.dataset.h || 'move',
    r: img.getBoundingClientRect(),
    sx: e.clientX,
    sy: e.clientY,
    b0: { ...cropping.box },
  };
  stage.setPointerCapture(e.pointerId);
}
export function init49() {
  addEventListener('pointermove', e => {
    if (!cropDrag || !cropping) return;
    const { h, r, b0 } = cropDrag,
      dx = (e.clientX - cropDrag.sx) / r.width,
      dy = (e.clientY - cropDrag.sy) / r.height,
      MIN = 0.08,
      b = { ...b0 };
    if (h === 'move') {
      b.x = clamp(b0.x + dx, 0, 1 - b0.w);
      b.y = clamp(b0.y + dy, 0, 1 - b0.h);
    }
    if (h.includes('w')) {
      b.x = clamp(b0.x + dx, 0, b0.x + b0.w - MIN);
      b.w = b0.x + b0.w - b.x;
    }
    if (h.includes('e')) b.w = clamp(b0.w + dx, MIN, 1 - b0.x);
    if (h.includes('n')) {
      b.y = clamp(b0.y + dy, 0, b0.y + b0.h - MIN);
      b.h = b0.y + b0.h - b.y;
    }
    if (h.includes('s')) b.h = clamp(b0.h + dy, MIN, 1 - b0.y);
    cropping.box = b;
    const box = cardsEl.querySelector(`[data-id="${cropping.c.id}"] .crop-box`);
    if (box)
      Object.assign(box.style, {
        left: b.x * 100 + '%',
        top: b.y * 100 + '%',
        width: b.w * 100 + '%',
        height: b.h * 100 + '%',
      });
  });

  addEventListener('pointerup', () => {
    cropDrag = null;
  });
}
