import type { Card } from '../../shared/model.ts';
import { renderCard } from '../canvas/render.ts';
import { renderWires, selectOnly } from '../canvas/wires.ts';
import { $ } from '../core/dom.ts';
import { remember, save } from '../core/history.ts';
import { formatOn, isFormat, runFormat } from '../edit/noteKeys.ts';
import { fitText } from '../edit/text.ts';
import { closestTo, esc, htmlIn } from '../ui/dom.ts';
import { caret, closeSbPops, G, markOnce, marks, pct, pop, rebuildBar, redraw, syncPair } from './barKit.ts';
import { boardFontPop } from './fontPop.ts';
import { group, some } from './group.ts';
import { selCards } from './selected.ts';
import { FS, FS_BASE, fitNote, fsPx, lhOf, lsOf, SIZED, setFsPx, setSpacing, sizedCards } from './textSize.ts';
import { backToNote, editedNoteBody } from './typingFocus.ts';

type Style = 'bold' | 'italic' | 'under' | 'strike';
const STYLES: [Style, string, string][] = [
  ['bold', '<b>B</b>', 'Bold · ⌘B'],
  ['italic', '<i>I</i>', 'Italic · ⌘I'],
  ['under', '<u>U</u>', 'Underline · ⌘U'],
  ['strike', '<s>S</s>', 'Strikethrough'],
];
const TYPING_FORMATS = [
  ['bullets', 'bullets', 'Bulleted list · ⇧⌘8'],
  ['numbered', 'numbered', 'Numbered list · ⇧⌘7'],
  ['clear', 'clear-format', 'Clear formatting · ⌘\\'],
] as const;
const ALIGNS = [
  ['left', 'Align left'],
  ['center', 'Centre'],
  ['right', 'Align right'],
];
const SZ: Record<string, string> = { s: 'Small', m: 'Medium', l: 'Large', xl: 'Extra large' };
const CASES = [
  ['', 'Aa', 'As typed'],
  ['upper', 'AB', 'UPPERCASE'],
  ['lower', 'ab', 'lowercase'],
  ['title', 'Ab', 'Title Case'],
];

// bold is on by default for titles and collection names, off for everything else
const isOn = (c: Card, k: Style) => c[k] ?? (k === 'bold' && ['title', 'coll'].includes(c.type));
const isStyle = (k: string | undefined): k is Style =>
  k === 'bold' || k === 'italic' || k === 'under' || k === 'strike';

// the same value on every card, or '' when they differ
const shared = (cs: Card[], of: (c: Card) => string) => {
  const v = cs[0] ? of(cs[0]) : '';
  return cs.every(c => of(c) === v) ? v : '';
};

function sizeHtml(sized: Card[], first: Card) {
  const cur = shared(sized, c => String(c.fs || 'm')),
    px = shared(sized, c => String(fsPx(c))),
    shown = px || 'Size',
    list = Object.entries(SZ)
      .map(([z, n]) => {
        const cls = cur === z ? 'on' : '',
          size = Math.round((FS_BASE[first.type] || 15) * (FS[z] ?? 1));
        return `<button data-fs="${z}" class="sz-${z} ${cls}"><b>Aa</b><span>${n}</span><em>${size}</em></button>`;
      })
      .join(''),
    CARET = caret();
  return pop(
    'size',
    `<b>${shown}</b>${CARET}`,
    `<div class="sb-fsbox"><div class="sbc-top sb-fsrow"><span>Size</span><button class="sb-fsstep" data-fsstep="-1" title="Smaller (⇧ for 10)">−</button><input type="number" min="6" max="400" step="1" value="${px}" placeholder="–" data-fsnum aria-label="Text size in pixels"><span class="sb-fspx">px</span><button class="sb-fsstep" data-fsstep="1" title="Bigger (⇧ for 10)">+</button></div><div class="sb-sizelist">${list}</div></div>`,
    'Text size',
  );
}

const spRow = (k: string, label: string, v: number, min: number, max: number, step: number, unit: string) => {
  const p = pct(v, min, max);
  return `<div class="sbc-top"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${v}" style="--p:${p}" data-sp="${k}"><input type="number" min="${min}" max="${max}" step="${step}" value="${v}" data-spn="${k}" aria-label="${label}"><b class="sb-unit">${unit}</b></div>`;
};
const spChips = (k: string, list: [string, number | string][]) => {
  const chips = list.map(([t, v]) => `<button data-spq="${k}:${v}">${t}</button>`).join('');
  return `<div class="sbc-chips sb-spchips">${chips}</div>`;
};

function spacingHtml(f: Card) {
  const lh = spRow('lh', 'Line height', lhOf(f), 0.8, 3, 0.05, '×'),
    lhChips = spChips('lh', [
      ['Tight', 1.1],
      ['Normal', 'normal'],
      ['Airy', 1.8],
    ]),
    ls = spRow('ls', 'Letters', lsOf(f), -10, 30, 0.5, '%'),
    lsChips = spChips('ls', [
      ['Tight', -3],
      ['Normal', 'normal'],
      ['Wide', 8],
    ]),
    cases = CASES.map(([k, g, t]) => {
      const cls = (f.tcase || '') === k ? 'on' : '';
      return `<button data-tcase="${k}" title="${t}" class="${cls}"><b>${g}</b><small>${t}</small></button>`;
    }).join(''),
    icon = Icon('spacing', { cls: 'sb-l24' }),
    CARET = caret();
  return pop(
    'spacing',
    `${icon}${CARET}`,
    `<div class="sb-corners sb-spacing">${lh}${lhChips}<i class="sb-sprule"></i>${ls}${lsChips}<i class="sb-sprule"></i><div class="sbc-top"><span>Case</span></div><div class="sbc-chips sb-cases">${cases}</div></div>`,
    'Line height and letter spacing',
  );
}

const typedIn = (sized: Card[]) => {
  const body = editedNoteBody();
  return sized.length === 1 && body?.closest('.card')?.getAttribute('data-id') === sized[0]?.id ? body : null;
};

// The tooltip's words before its shortcut. The tooltip itself moves out of title on hover, so it can't be the name.
const nameOf = (tip: string) => tip.split(' · ')[0] ?? tip;

// Drawn with every note and shown only while it is typed in, so starting to type doesn't rebuild the bar.
function typingFormatsHtml(typing: boolean) {
  const buttons = TYPING_FORMATS.map(([k, icon, t]) => {
    const on = typing && formatOn(k),
      cls = on ? 'on' : '',
      pressed = k === 'clear' ? '' : ` aria-pressed="${on}"`,
      name = nameOf(t),
      svg = Icon(icon);
    return `<button data-fmt="${k}" title="${t}" aria-label="${name}"${pressed} class="${cls}">${svg}</button>`;
  }).join('');
  return `<span class="sb-g sb-typing" data-fold="1"><div class="sb-sizes sb-style sb-align">${buttons}</div></span>`;
}

// the text controls for notes, titles, checklists, shapes and collections
function textBarHtml(sized: [Card, ...Card[]]) {
  const first = sized[0],
    typing = typedIn(sized),
    styles = STYLES.map(([k, l, t]) => {
      const on = typing ? formatOn(k) : sized.every(c => isOn(c, k)),
        cls = on ? 'on' : '',
        name = nameOf(t);
      return `<button data-ts="${k}" title="${t}" aria-label="${name}" aria-pressed="${on}" class="${cls}">${l}</button>`;
    }).join(''),
    al = shared(sized, c => c.align || 'left'),
    aligns = ALIGNS.map(([k, t]) => {
      const cls = al === k ? 'on' : '',
        icon = Icon(`text-${k}`);
      return `<button data-al="${k}" title="${t}" class="${cls}">${icon}</button>`;
    }).join(''),
    mixed = !sized.every(c => (c.font || '') === (first.font || '')),
    fnt = mixed ? '' : first.font || '',
    fontStyle = fnt ? `font-family:'${esc(fnt)}', var(--font)` : '',
    fontName = mixed ? 'Mixed fonts' : esc(fnt || 'Default font'),
    fontCaret = Icon('caret-down', { cls: 'sb-caret', size: 10 }),
    sep = `<span class="sb-sep"></span>`;
  return (
    G(1, `${sep}<div class="sb-sizes sb-style">${styles}</div>`) + // B I U S stay together
    (sized.length === 1 && first.type === 'note' ? typingFormatsHtml(!!typing) : '') +
    G(1, `<div class="sb-sizes sb-style sb-align">${aligns}</div>`) +
    G(
      5,
      `${sep}<button class="sb-txt sb-font" data-sbfont="1" title="Font"><span style="${fontStyle}">${fontName}</span>${fontCaret}</button>`,
    ) +
    G(4, sep + sizeHtml(sized, first)) +
    G(6, spacingHtml(first))
  );
}

const stepSize = (from: number, by: number) => String(Math.max(6, Math.min(400, from + by)));

function keepTypingFocus(e: MouseEvent) {
  if (editedNoteBody() && closestTo(e.target, '[data-ts], [data-fmt], [data-pop]')) e.preventDefault();
}

// what the caret has while a note is typed in, and the card's own styles otherwise
export function syncTypingFormats() {
  const typing = !!editedNoteBody(),
    cards = sizedCards();
  htmlIn($('selbar'), '[data-ts], [data-fmt]').forEach(b => {
    const f = b.dataset.ts ?? b.dataset.fmt;
    if (!isFormat(f)) return;
    const on = typing ? formatOn(f) : isStyle(f) && cards.every(c => isOn(c, f));
    b.classList.toggle('on', on);
    if (b.hasAttribute('aria-pressed')) b.ariaPressed = String(on);
  });
}

function initTextBar(place: () => void) {
  $('selbar').addEventListener('mousedown', keepTypingFocus);
  document.addEventListener('selectionchange', () => {
    if (editedNoteBody()) syncTypingFormats();
  });

  $('selbar').addEventListener('input', e => {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.value === '-') return;
    const p = syncPair(t, 'data-sp', 'data-spn');
    if (!p || (p.key !== 'lh' && p.key !== 'ls')) return;
    markOnce('sp');
    setSpacing(p.key, p.r.value);
  });

  $('selbar').addEventListener(
    'click',
    e => {
      const b = closestTo(e.target, '[data-tcase]');
      if (!b) return;
      e.stopImmediatePropagation();
      remember();
      sizedCards().forEach(c => {
        if (b.dataset.tcase) c.tcase = b.dataset.tcase;
        else delete c.tcase;
        renderCard(c);
        fitText(c);
      });
      htmlIn($('selbar'), '[data-tcase]').forEach(x => {
        x.classList.toggle('on', x === b);
      });
      selectOnly(selCards().map(c => c.id));
      renderWires();
      save();
    },
    true,
  );

  $('selbar').addEventListener(
    'click',
    e => {
      const q = closestTo(e.target, '[data-spq]')?.dataset.spq;
      if (!q) return;
      e.stopImmediatePropagation();
      remember();
      const [k, v] = q.split(':');
      if ((k !== 'lh' && k !== 'ls') || v === undefined) return;
      setSpacing(k, v);
      const f = sizedCards()[0],
        rg = $('selbar').querySelector(`[data-sp="${k}"]`),
        nb = rg?.parentElement?.querySelector('[data-spn]');
      if (!f || !(rg instanceof HTMLInputElement) || !(nb instanceof HTMLInputElement)) return;
      const cur = k === 'lh' ? lhOf(f) : lsOf(f);
      rg.value = nb.value = String(cur);
      rg.style.setProperty('--p', pct(cur, +rg.min, +rg.max));
    },
    true,
  );

  $('selbar').addEventListener('keydown', e => {
    if (!closestTo(e.target, '[data-spn]')) return;
    e.stopPropagation();
    if (e.key === 'Enter') {
      closeSbPops();
      place();
    }
  });

  $('selbar').addEventListener('input', e => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || !t.matches('[data-fsnum]') || !t.value) return;
    markOnce('fs');
    setFsPx(t.value);
  });

  $('selbar').addEventListener(
    'click',
    e => {
      const step = closestTo(e.target, '[data-fsstep]')?.dataset.fsstep;
      if (!step) return;
      e.stopImmediatePropagation();
      const inp = $('selbar').querySelector('[data-fsnum]'),
        first = sizedCards()[0];
      if (!(inp instanceof HTMLInputElement)) return;
      const cur = +inp.value || (first ? fsPx(first) : 15);
      markOnce('fs');
      inp.value = stepSize(cur, +step * (e.shiftKey ? 10 : 1));
      setFsPx(inp.value);
    },
    true,
  );

  $('selbar').addEventListener('keydown', e => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || !t.matches('[data-fsnum]')) return;
    e.stopPropagation();
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      markOnce('fs');
      t.value = stepSize(+t.value || 15, (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1));
      setFsPx(t.value);
    }
    if (e.key === 'Enter') {
      setFsPx(t.value);
      marks.fs = false;
      closeSbPops();
      rebuildBar();
      place();
    }
  });

  $('selbar').addEventListener(
    'click',
    e => {
      const al = closestTo(e.target, '[data-al]')?.dataset.al;
      if (!al) return;
      e.stopImmediatePropagation();
      remember();
      sizedCards().forEach(c => {
        if (al === 'left') delete c.align;
        else c.align = al;
        renderCard(c);
      });
      selectOnly(selCards().map(c => c.id));
      rebuildBar();
      save();
    },
    true,
  );

  // bold, italic, underline and strikethrough; the font picker; the named sizes
  $('selbar').addEventListener('click', e => {
    const body = editedNoteBody(),
      word = closestTo(e.target, '[data-ts], [data-fmt]'),
      format = word?.dataset.ts ?? word?.dataset.fmt;
    if (body && isFormat(format)) {
      backToNote();
      runFormat(body, format);
      syncTypingFormats();
      return;
    }
    const list = sizedCards(),
      ts = closestTo(e.target, '[data-ts]')?.dataset.ts,
      font = closestTo(e.target, '[data-sbfont]'),
      fs = closestTo(e.target, '[data-fs]')?.dataset.fs;
    if (isStyle(ts)) {
      const to = !list.every(c => isOn(c, ts));
      list.forEach(c => {
        c[ts] = to;
      });
      redraw(selCards());
    }
    if (font) return boardFontPop(font, list);
    if (fs) {
      list.forEach(c => {
        if (fs === 'm') delete c.fs;
        else c.fs = fs;
        fitNote(c);
      });
      redraw(selCards());
    }
  });
}

export const text = group({ on: some(c => SIZED.includes(c.type)), html: textBarHtml, init: initTextBar });
