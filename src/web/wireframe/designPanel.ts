import type { Card } from '../../shared/model.ts';
import { renderCard } from '../canvas/render.ts';
import { byId, renderWires, selectOnly } from '../canvas/wires.ts';
import { hasAll, queryWords } from '../core/base.ts';
import { $ } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { selCards } from '../selbar/selected.ts';
import { startPlacing, stopPlacing } from '../tools/place.ts';
import { closestTo, htmlIn, textField } from '../ui/dom.ts';
import {
  alignSection,
  boxSection,
  field,
  fontCardSection,
  frameSection,
  groupSection,
  iconSection,
  placeSection,
  sec,
  textSection,
} from './designMarkup.ts';
import { groupSel } from './stack.ts';
import { DEVICES, WF } from './wireframes.ts';

// icons: search Myra's icon set, then click to place (or swap the selected icon)
let iconSwap: string | null = null;

function renderIcons() {
  const words = queryWords(textField('iconSearch').value),
    all = window.iconList(),
    hits = words.length ? all.filter(i => hasAll(words, i.kw)) : all;
  $('iconGrid').innerHTML =
    hits
      .map(i => {
        const tip = i.name.replace(/-/g, ' '),
          icon = Icon(i.name);
        return `<button data-icon="${i.name}" title="${tip}">${icon}</button>`;
      })
      .join('') + (hits.length ? '' : '<div class="more">No icons match that</div>');
}

// the design panel: tools when nothing's picked, the selection's settings when something is
export function pickWF(t: string | null = null) {
  htmlIn(document, '[data-wf]').forEach(b => {
    b.classList.toggle('on', b.dataset.wf === t);
  });
  $('dzPresets').classList.toggle('on', t === 'frame');
  $('dzIcons').classList.toggle('on', t === 'icon');
  if (t === 'icon') {
    renderIcons();
    setTimeout(() => $('iconSearch').focus(), 20);
    return;
  }
  iconSwap = null;
  if (t)
    htmlIn(document, '.dz-piece-grid .on').forEach(x => {
      x.classList.remove('on');
    });
  if (t === 'frame') {
    $('dzPresets').innerHTML = Object.keys(DEVICES)
      .map(n => `<button data-dev="${n}">${n}</button>`)
      .join('');
    return;
  }
  if (t) startPlacing(t);
}

// Unsorted sits under the Wireframe panel and always fits on screen; its list scrolls when it's long
export function placeTray() {
  if ($('tray').parentElement?.classList.contains('side')) $('tray').style.top = $('tray').style.maxHeight = ''; // in a sidebar column: it just stacks
}

export let ALIGN: Record<string, string> = {};
// the one selected card, when it's a font card
const soleFont = () => {
  const cs = selCards();
  return cs.length === 1 && cs[0]?.type === 'font' ? cs[0] : null;
};

export function renderDesign() {
  const fc = soleFont(),
    el = $('dzProps');
  if (fc) {
    el.innerHTML = fontCardSection(fc);
    return;
  }
  const cs = selCards().filter(c => WF.includes(c.type));
  if (!cs.length) {
    el.innerHTML = selCards().length
      ? ''
      : '<div class="dz-hint">Pick a tool or a piece. Drag to draw a box; things snap into line as you move them.</div>';
    return;
  }
  const one = cs.length === 1 ? (cs[0] ?? null) : null;
  let h = '';
  if (one) h += placeSection(one);
  if (one && one.type !== 'frame') h += sec(field('rot', 'Rotate°', one.rot || 0, 'number', 'wide'));
  if (one?.type === 'icon') h += iconSection(one);
  if (cs.length > 1) h += groupSection(cs.every(c => c.group && c.group === cs[0]?.group));
  if (one?.type === 'frame') h += frameSection(one);
  if (one?.type === 'box') h += boxSection(one);
  if (one?.type === 'text') h += textSection(one);
  if (cs.length > 1 || (one?.onFrame && byId(one.onFrame))) h += alignSection(cs.length);
  el.innerHTML = h;
}

// keep X / Y / W / H current while you drag (unless you're typing in them)
export function syncDesign() {
  const cs = selCards(),
    one = cs.length === 1 && cs[0] && WF.includes(cs[0].type) ? cs[0] : null;
  if (!one || $('dzProps').contains(document.activeElement)) return;
  const now = { x: one.x, y: one.y, w: one.w, h: one.h };
  for (const [k, v] of Object.entries(now)) {
    const i = $('dzProps').querySelector(`input[data-k="${k}"]`);
    if (i instanceof HTMLInputElement && +i.value !== Math.round(v)) i.value = String(Math.round(v));
  }
}

// a value typed into the design panel, put on the card it belongs to
function setProp(one: Card, k: string, raw: string) {
  const n = +raw || 0;
  switch (k) {
    case 'x':
    case 'y':
    case 'w':
    case 'h':
      one[k] = n;
      break;
    case 'radius':
    case 'sw':
    case 'rot':
      one[k] = n;
      break;
    case 'size':
      if (one.type === 'text') one.size = n;
      break;
    case 'isz':
      one.w = one.h = Math.max(8, n);
      break;
    case 'opacity':
      if (one.type === 'box') one.opacity = Math.max(0, Math.min(100, +raw)) / 100;
      break;
    case 'lh':
      one.lh = +raw || 1.3;
      break;
    case 'weight':
      if (one.type === 'text') one.weight = +raw;
      break;
    case 'device': {
      const d = DEVICES[raw];
      if (d) [one.w, one.h, one.radius] = d;
      if (one.type === 'frame') one.device = raw;
      break;
    }
    case 'name':
      if (one.type === 'frame') one.name = raw;
      break;
    case 'fill':
      if (one.type === 'frame' || one.type === 'box') one.fill = raw;
      break;
    case 'stroke':
    case 'color':
    case 'font':
      one[k] = raw;
      break;
  }
  if ((k === 'w' || k === 'h') && one.type === 'frame') one.device = 'Custom';
}

let gfontT: ReturnType<typeof setTimeout> | undefined;

export function initDesign() {
  const iconSearch = textField('iconSearch');
  iconSearch.oninput = renderIcons;

  iconSearch.onkeydown = e => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      pickWF(null);
      stopPlacing();
    }
  };

  $('iconGrid').onclick = e => {
    const b = closestTo(e.target, '[data-icon]'),
      name = b?.dataset.icon;
    if (!b || !name) return;
    htmlIn($('iconGrid'), '.on').forEach(x => {
      x.classList.remove('on');
    });
    b.classList.add('on');
    const c = iconSwap ? byId(iconSwap) : undefined;
    if (c) {
      c.name = name;
      renderCard(c);
      selectOnly([c.id]);
      save();
      iconSwap = null;
      pickWF(null);
      return;
    }
    startPlacing('icon', { name });
  };

  htmlIn(document, '[data-wf]').forEach(b => {
    b.onclick = () => {
      if (b.classList.contains('on')) {
        stopPlacing();
        pickWF(null);
        return;
      }
      pickWF(b.dataset.wf ?? null);
    };
  });

  $('dzPresets').onclick = e => {
    const b = closestTo(e.target, '[data-dev]');
    if (!b) return;
    htmlIn($('dzPresets'), 'button').forEach(x => {
      x.classList.toggle('on', x === b);
    });
    startPlacing('frame', { device: b.dataset.dev });
  };

  $('design').addEventListener('pointerdown', e => e.stopPropagation());

  addEventListener('resize', placeTray);

  new ResizeObserver(placeTray).observe($('design'));

  ALIGN = {
    l: Icon('align-l'),
    c: Icon('align-c'),
    r: Icon('align-r'),
    t: Icon('align-t'),
    m: Icon('align-m'),
    b: Icon('align-b'),
    dh: Icon('distribute-h'),
    dv: Icon('distribute-v'),
  };

  $('dzProps').addEventListener('input', e => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement || t instanceof HTMLSelectElement)) return;
    const k = t.dataset.k,
      fc = soleFont();
    if (fc && (k === 'font' || k === 'gfont')) {
      const v = t.value.trim();
      if (!v) return;
      if (k === 'gfont') {
        clearTimeout(gfontT);
        gfontT = setTimeout(() => {
          fc.font = v;
          renderCard(fc);
          selectOnly([fc.id]);
          save();
        }, 500);
        return;
      }
      fc.font = v;
      renderCard(fc);
      selectOnly([fc.id]);
      save();
      return;
    }
    const one = selCards().filter(c => WF.includes(c.type))[0];
    if (!k || !one) return;
    setProp(one, k, t.value);
    renderCard(one);
    selectOnly([one.id]);
    renderWires();
    save();
    if (k === 'device') {
      $('selbar').dataset.key = '';
      renderDesign();
    }
  });

  $('dzProps').addEventListener('click', e => {
    if (closestTo(e.target, '[data-swap]')) {
      iconSwap = selCards()[0]?.id ?? null;
      pickWF('icon');
      return;
    }
    const gp = closestTo(e.target, '[data-grp]');
    if (gp) return groupSel(gp.dataset.grp === 'on');
    const cs = selCards().filter(c => WF.includes(c.type)),
      ta = closestTo(e.target, '[data-talign]')?.dataset.talign,
      al = closestTo(e.target, '[data-align]')?.dataset.align,
      di = closestTo(e.target, '[data-dist]')?.dataset.dist;
    if (ta)
      cs.forEach(c => {
        c.align = ta;
      });
    if (al) {
      // line them up with each other, or a single thing with its screen
      const only = cs.length === 1 ? cs[0] : undefined,
        ref = only?.onFrame ? byId(only.onFrame) : undefined,
        x0 = ref ? ref.x : Math.min(...cs.map(c => c.x)),
        y0 = ref ? ref.y : Math.min(...cs.map(c => c.y)),
        x1 = ref ? ref.x + ref.w : Math.max(...cs.map(c => c.x + c.w)),
        y1 = ref ? ref.y + ref.h : Math.max(...cs.map(c => c.y + c.h));
      cs.forEach(c => {
        if (al === 'l') c.x = x0;
        if (al === 'c') c.x = (x0 + x1) / 2 - c.w / 2;
        if (al === 'r') c.x = x1 - c.w;
        if (al === 't') c.y = y0;
        if (al === 'm') c.y = (y0 + y1) / 2 - c.h / 2;
        if (al === 'b') c.y = y1 - c.h;
      });
    }
    const s = [...cs].sort((a, b) => (di === 'h' ? a.x - b.x : a.y - b.y)),
      first = s[0],
      last = s.at(-1);
    if (di && first && last) {
      const hz = di === 'h',
        span = hz ? last.x + last.w - first.x : last.y + last.h - first.y,
        used = s.reduce((t, c) => t + (hz ? c.w : c.h), 0),
        gap = (span - used) / (s.length - 1);
      let at = hz ? first.x : first.y;
      s.forEach(c => {
        if (hz) c.x = at;
        else c.y = at;
        at += (hz ? c.w : c.h) + gap;
      });
    }
    if (ta || al || di) {
      cs.forEach(c => {
        renderCard(c);
      });
      selectOnly(cs.map(c => c.id));
      renderWires();
      save();
      renderDesign();
    }
  });
}
