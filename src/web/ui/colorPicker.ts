// @ts-nocheck
import { esc, renderCard } from '../canvas/render.ts';
import { selectOnly } from '../canvas/wires.ts';
import { colorName } from '../cards/colorNames.ts';
import { COLORS, clamp } from '../core/base.ts';
import { $, cardsEl, stage } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { boardMenu } from '../features/export.ts';
import { addAtCenter } from '../panels/zoomMenu.ts';
import { colorOf, myColors } from '../settings/colors.ts';
import { chirp } from '../settings/licenses.ts';
import { settings } from '../settings/settings.ts';
import { applySettings } from '../settings/widgets.ts';
import { session } from '../core/state.ts';

// ---------- colors: the editor beside a color card, and the board's own palette ----------
// the wheel works in HSV: hue = angle, saturation = distance from the middle, value = the brightness slider
let colorCard = null;
let hsv = { h: 330, s: 0.4, v: 1 };

const normHex = v => {
  let h = String(v || '')
    .trim()
    .replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = [...h].map(x => x + x).join('');
  return /^[0-9a-f]{6}$/i.test(h) ? '#' + h.toLowerCase() : null;
};

const hsv2rgb = (h, s, v) => {
  const f = n => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5), f(3), f(1)].map(x => Math.round(x * 255));
};

const rgb2hex = c3 => '#' + c3.map(x => x.toString(16).padStart(2, '0')).join('');

const hex2hsv = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255),
    mx = Math.max(r, g, b),
    mn = Math.min(r, g, b),
    d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: mx ? d / mx : 0, v: mx };
};
let wheelCv;
let wg;

function drawWheel() {
  const N = wheelCv.width,
    R = N / 2,
    img = wg.createImageData(N, N),
    d = img.data;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = x - R + 0.5,
        dy = y - R + 0.5,
        r = Math.hypot(dx, dy),
        i = (y * N + x) * 4;
      if (r > R) continue;
      const [cr, cg, cb] = hsv2rgb(((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360, Math.min(1, r / R), hsv.v);
      d[i] = cr;
      d[i + 1] = cg;
      d[i + 2] = cb;
      d[i + 3] = r > R - 1 ? Math.round((R - r) * 255) : 255;
    }
  wg.putImageData(img, 0, 0);
}

function showHSV() {
  const W = 220,
    a = (hsv.h * Math.PI) / 180,
    rr = (hsv.s * W) / 2;
  Object.assign($('wheelRing').style, {
    left: W / 2 + Math.cos(a) * rr + 'px',
    top: W / 2 + Math.sin(a) * rr + 'px',
    background: rgb2hex(hsv2rgb(hsv.h, hsv.s, hsv.v)),
  });
  $('bright').style.background = `linear-gradient(to right, #000, ${rgb2hex(hsv2rgb(hsv.h, hsv.s, 1))})`;
  Object.assign($('brightRing').style, { left: hsv.v * 100 + '%', background: rgb2hex(hsv2rgb(hsv.h, hsv.s, hsv.v)) });
}

function dragOn(el, fn) {
  el.addEventListener('pointerdown', e => {
    e.stopPropagation();
    el.setPointerCapture(e.pointerId);
    fn(e);
    const mv = ev => fn(ev),
      up = () => {
        el.removeEventListener('pointermove', mv);
        el.removeEventListener('pointerup', up);
        save();
      };
    el.addEventListener('pointermove', mv);
    el.addEventListener('pointerup', up);
  });
}

let drawnV = -1;
function drawIfV() {
  if (Math.abs(drawnV - hsv.v) > 0.004) {
    drawnV = hsv.v;
    drawWheel();
  }
  showHSV();
}

function placeColorPop(c) {
  const el = cardsEl.querySelector(`[data-id="${c.id}"]`),
    r = el.getBoundingClientRect(),
    s = stage.getBoundingClientRect(),
    pop = $('cpop');
  const dock = $('dock').getBoundingClientRect(),
    floor = Math.min(s.height, dock.top - s.top - 14),
    ph = pop.offsetHeight || 470; // never over the bottom bar
  let x = r.right + 14 - s.left,
    y = r.top - s.top;
  if (x + 270 > s.width - 250) x = r.left - 270 - s.left;
  pop.style.left = Math.max(260, x) + 'px';
  pop.style.top = clamp(y, 70, Math.max(70, floor - ph)) + 'px';
}

// colors for the wheel's quick row: your saved board colors, then colors already used on this board (most used first); none at all → the starter set
// the wheel's quick colors: black + white always, then saved board colors, the color cards on the board (with their names), then other colors in use
let cpAll = false;
// the wheel's colors: two easy rows, or every color on the board (remembered while the app is open)
function boardColorRows(starter) {
  const norm = v => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : COLORS[v] || null),
    seen = new Set(['#000000', '#ffffff']);
  const take = list => list.filter(x => x.hex && !seen.has(x.hex) && seen.add(x.hex));
  const saved = take((session.board.palette || []).map(p => ({ hex: p.hex.toLowerCase(), name: p.name })));
  const cards = take(
    session.board.cards
      .filter(c => c.type === 'swatch' && c.hex)
      .map(c => ({ hex: c.hex.toLowerCase(), name: c.label || c.hex.toUpperCase() })),
  );
  const count = new Map();
  session.board.cards.forEach(
    c =>
      c.type !== 'swatch' &&
      ['color', 'fill', 'stroke'].forEach(k => {
        const h = norm(c[k]);
        if (h) count.set(h, (count.get(h) || 0) + 1);
      }),
  );
  const used = take([...count].sort((a, b) => b[1] - a[1]).map(([h]) => ({ hex: h, name: h.toUpperCase() })));
  const dot = x => `<button style="background:${x.hex}" data-hex="${x.hex}" title="${esc(x.name)}"></button>`,
    row = (label, xs) =>
      xs.length ? `<div class="cpq-l">${label}</div><div class="cpq-row">${xs.map(dot).join('')}</div>` : '';
  const bw = [
    { hex: '#000000', name: 'Black' },
    { hex: '#ffffff', name: 'White' },
  ];
  if (!saved.length && !cards.length && !used.length)
    return `<div class="cpq-row">${[...bw, ...take(starter.map(h => ({ hex: h.toLowerCase(), name: h.toUpperCase() })))].map(dot).join('')}</div>`;
  const all = [...bw, ...saved, ...cards, ...used],
    FEW = 16; // two rows of dots
  if (all.length <= FEW) return `<div class="cpq-row">${all.map(dot).join('')}</div>`;
  return cpAll
    ? row('Black & white', bw) +
        row('Board colours', saved) +
        row('Colour cards', cards) +
        row('On this board', used) +
        `<button class="cpq-more" data-cpq="few">Fewer</button>`
    : `<div class="cpq-row">${all.slice(0, FEW).map(dot).join('')}</div><button class="cpq-more" data-cpq="all">All board colours (${all.length})</button>`;
}

export function openColor(c) {
  $('cpop').classList.toggle('tint', !!c.tint);
  $('cpop').classList.toggle('from-bar', !!c.fromBar);
  if (c.tint) document.body.appendChild($('cpop'));
  else if ($('cpop').parentNode !== stage) stage.appendChild($('cpop')); // UI colors sit above Settings; card colors stay on the board
  if (c.tint) {
    // a UI color, not a color card: no name or palette, a few starting points, and a way back to the default
    colorCard = c;
    hsv = hex2hsv(c.hex);
    drawIfV();
    $('cpHex').value = c.hex.toUpperCase();
    $('cpDot').style.background = c.hex;
    $('cpTitle').textContent = c.title;
    $('cpQuick').innerHTML = c.boardColors
      ? boardColorRows(c.presets)
      : c.presets
          .map(h => `<button style="background:${h}" data-hex="${h}" title="${h.toUpperCase()}"></button>`)
          .join('');
    $('cpQuick').classList.toggle('rows', !!c.boardColors);
    $('cpReset').hidden = !!c.boardColors;
    $('cpQuick').dataset.starter = c.boardColors ? JSON.stringify(c.presets) : '';
    const pop = $('cpop');
    pop.classList.add('on');
    const w = 252,
      h = pop.offsetHeight || 470;
    pop.style.left = clamp(c.at.x, 12, innerWidth - w - 12) + 'px';
    pop.style.top = clamp(c.at.y, 12, innerHeight - h - 12) + 'px';
    return;
  }
  colorCard = c;
  hsv = hex2hsv(c.hex);
  drawIfV();
  $('cpHex').value = c.hex.toUpperCase();
  $('cpName').value = c.label || '';
  $('cpDot').style.background = c.hex;
  $('cpQuick').innerHTML = session.board.palette
    .map(p => `<button style="background:${p.hex}" data-hex="${p.hex}" title="${esc(p.name)}"></button>`)
    .join('');
  $('cpSave').textContent = session.board.palette.some(p => p.hex === c.hex)
    ? 'Update board colour'
    : 'Save to board colours';
  $('cpSave').classList.remove('saved-ok');
  placeColorPop(c);
  $('cpop').classList.add('on');
}

export function closeColor() {
  $('cpop').classList.remove('on');
  colorCard = null;
}

function setColor(hex, from) {
  if (colorCard && colorCard.tint && hex) {
    colorCard.hex = hex;
    $('cpDot').style.background = hex;
    if (from !== 'hex') $('cpHex').value = hex.toUpperCase();
    if (from !== 'wheel') {
      hsv = hex2hsv(hex);
      drawIfV();
    }
    colorCard.apply(hex);
    return;
  }
  if (!colorCard || !hex) return;
  colorCard.hex = hex;
  $('cpDot').style.background = hex;
  if (from !== 'hex') $('cpHex').value = hex.toUpperCase();
  if (from !== 'wheel') {
    hsv = hex2hsv(hex);
    drawIfV();
  }
  const named = session.board.palette.find(p => p.hex === hex);
  if (named && from !== 'name') {
    colorCard.label = named.name;
    $('cpName').value = named.name;
  } else if (colorCard.autoName !== false && from !== 'name') {
    colorCard.label = colorName(hex);
    colorCard.autoName = true;
    $('cpName').value = colorCard.label;
  }
  $('cpSave').textContent = named ? 'Update board colour' : 'Save to board colours';
  $('cpSave').classList.remove('saved-ok');
  renderCard(colorCard);
  selectOnly([colorCard.id]);
  if (from !== 'wheel') save();
}

const keepCpopOnScreen = () => {
  const p = $('cpop'),
    r = p.getBoundingClientRect();
  if (r.bottom > innerHeight - 12) p.style.top = Math.max(12, innerHeight - r.height - 12) + 'px';
};

export const PRESETS = {
  bg: ['#faf7f2', '#ffffff', '#fff8ef', '#fffaf0', '#f4fbf6', '#f3f8ff', '#f6f2ff', '#1d1a16', '#232733', '#2c2620'],
  dot: ['#e4dccf', '#f2c9da', '#cfe8d9', '#cfe0f5', '#e6dcff', '#d8d2dd', '#3a332b', '#4a4452'],
  panel: ['#ffffff', '#fff8ef', '#fffaf0', '#f4fbf6', '#f3f8ff', '#f6f2ff', '#28231d', '#2f2a36'],
  accent: ['#e88a24', '#ff8a5c', '#f3c84a', '#3fbf86', '#4aa3f0', '#9b7bff', '#3b342d'],
  cursor: ['#f6b45e', '#ffc8a6', '#f8e08a', '#a8e6c3', '#aed3ff', '#cdb8ff', '#ffffff', '#3b342d'],
};

const COLOR_TITLES = { bg: 'Board background', dot: 'Dots', panel: 'Panels', accent: 'Accent', cursor: 'Your cursor' };

// open the wheel for a UI color; `forBoard` means just this board's background (from a right-click)
export function tintPicker(key, at, forBoard) {
  const set = hex => {
    if (key === 'cursor') settings.cursor = hex;
    else if (forBoard) {
      session.board.bg = hex;
      save();
    } else myColors()[key] = hex;
    applySettings();
  };
  openColor({
    tint: true,
    title: forBoard ? 'This board’s background' : COLOR_TITLES[key],
    hex: key === 'cursor' ? settings.cursor : forBoard ? session.board.bg || colorOf('bg') : colorOf(key),
    presets: PRESETS[key],
    at,
    apply: set,
    reset: () => {
      if (key === 'cursor') settings.cursor = '#f6b45e';
      else if (forBoard) {
        delete session.board.bg;
        save();
      } else delete myColors()[key];
      applySettings();
    },
  });
}

export function renderPalette() {
  const el = $('palette');
  el.innerHTML = '';
  if (!session.board.palette.length) {
    el.innerHTML =
      '<div class="palette-empty">Custom colours for this board and Myra to use.<br>Add a Colour card from the toolbar, then choose Save to board colours</div>';
    return;
  }
  session.board.palette.forEach((p, i) => {
    const r = document.createElement('div');
    r.className = 'pal';
    r.title = 'Click to add to the board';
    r.innerHTML = `<i style="background:${p.hex}"></i><span></span><small>${p.hex.slice(1)}</small>`;
    r.title = 'Click to add it to the board. Right-click to rename, change or remove it';
    const name = r.querySelector('span');
    name.textContent = p.name;
    const rename = () => {
      name.contentEditable = 'true';
      name.focus();
      getSelection().selectAllChildren(name);
      const done = () => {
        name.contentEditable = 'false';
        const v = name.textContent.trim();
        if (v) {
          p.name = v;
          session.board.cards
            .filter(c => c.type === 'swatch' && c.hex === p.hex)
            .forEach(c => {
              c.label = v;
              renderCard(c);
            });
        }
        renderPalette();
        save();
      };
      name.onblur = done;
      name.onkeydown = ev => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          name.blur();
        }
        if (ev.key === 'Escape') {
          name.textContent = p.name;
          name.blur();
        }
        ev.stopPropagation();
      };
    };
    // change the color itself: color cards on the board that use it follow along
    const recolor = e => {
      const was = p.hex,
        rr = r.getBoundingClientRect();
      openColor({
        tint: true,
        title: `Change “${p.name}”`,
        hex: p.hex,
        presets: [p.hex, ...session.board.palette.filter(x => x !== p).map(x => x.hex)].slice(0, 10),
        at: { x: rr.right + 12, y: rr.top - 60 },
        apply: hex => {
          const from = p.hex;
          p.hex = hex;
          session.board.cards
            .filter(c => c.type === 'swatch' && c.hex === from)
            .forEach(c => {
              c.hex = hex;
              renderCard(c);
            });
          r.querySelector('i').style.background = hex;
          r.querySelector('small').textContent = hex.slice(1);
          save();
        },
        reset: () => {
          const from = p.hex;
          p.hex = was;
          session.board.cards
            .filter(c => c.type === 'swatch' && c.hex === from)
            .forEach(c => {
              c.hex = was;
              renderCard(c);
            });
          renderPalette();
          save();
        },
      });
    };
    r.onclick = () => {
      if (name.isContentEditable) return;
      addAtCenter('swatch', { hex: p.hex, label: p.name });
    };
    r.oncontextmenu = e => {
      e.preventDefault();
      e.stopPropagation();
      boardMenu(e, [
        { label: 'Add to the board', run: () => addAtCenter('swatch', { hex: p.hex, label: p.name }) },
        { label: 'Rename', run: rename },
        { label: 'Change colour…', run: recolor },
        '-',
        {
          label: 'Remove from board colours',
          danger: true,
          run: () => {
            session.board.palette.splice(i, 1);
            renderPalette();
            save();
            chirp(`Removed “${p.name}” from this board's colours`, 2500);
          },
        },
      ]);
    };
    el.appendChild(r);
  });
}
export function init57() {
  wheelCv = $('wheelCv');
  wg = wheelCv.getContext('2d');

  dragOn($('wheel'), e => {
    const r = $('wheel').getBoundingClientRect(),
      dx = e.clientX - r.left - r.width / 2,
      dy = e.clientY - r.top - r.height / 2;
    hsv.h = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
    hsv.s = Math.min(1, Math.hypot(dx, dy) / (r.width / 2));
    if (hsv.v < 0.05) hsv.v = 1;
    drawIfV();
    setColor(rgb2hex(hsv2rgb(hsv.h, hsv.s, hsv.v)), 'wheel');
  });

  dragOn($('bright'), e => {
    const r = $('bright').getBoundingClientRect();
    hsv.v = clamp((e.clientX - r.left) / r.width, 0, 1);
    drawIfV();
    setColor(rgb2hex(hsv2rgb(hsv.h, hsv.s, hsv.v)), 'wheel');
  });

  $('cpHex').oninput = e => {
    const h = normHex(e.target.value);
    if (h) setColor(h, 'hex');
  };

  $('cpName').oninput = e => {
    if (!colorCard) return;
    colorCard.autoName = false;
    colorCard.label = e.target.value;
    renderCard(colorCard);
    selectOnly([colorCard.id]);
    save();
  };

  $('cpQuick').onclick = e => {
    const m = e.target.closest('[data-cpq]');
    if (m) {
      cpAll = m.dataset.cpq === 'all';
      $('cpQuick').innerHTML = boardColorRows(JSON.parse($('cpQuick').dataset.starter || '[]'));
      keepCpopOnScreen();
      return;
    }
    const b = e.target.closest('[data-hex]');
    if (b) setColor(b.dataset.hex, 'quick');
  };

  $('cpSave').onclick = () => {
    if (!colorCard) return;
    const name = (colorCard.label || '').trim() || colorCard.hex.toUpperCase(),
      hit = session.board.palette.find(p => p.hex === colorCard.hex);
    if (hit) hit.name = name;
    else session.board.palette.push({ hex: colorCard.hex, name });
    colorCard.label = name;
    renderCard(colorCard);
    selectOnly([colorCard.id]);
    renderPalette();
    save();
    openColor(colorCard);
    $('cpSave').textContent = 'Saved ✓';
    $('cpSave').classList.add('saved-ok');
    chirp(`Saved “${name}” to this board's colours ✦`, 3500);
  };

  $('cpDone').onclick = closeColor;

  addEventListener(
    'pointerdown',
    e => {
      if ($('cpop').classList.contains('on') && !e.target.closest('.cpop, .card.swatch, [data-col]')) closeColor();
    },
    true,
  );

  $('cpReset').onclick = () => {
    if (colorCard && colorCard.tint) {
      colorCard.reset();
      closeColor();
    }
  };

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-col]');
    if (!b) return;
    const r = b.getBoundingClientRect();
    tintPicker(b.dataset.col, { x: r.left - 270, y: r.top - 120 });
  });
}
