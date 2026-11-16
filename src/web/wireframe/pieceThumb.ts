import type { PieceItem } from './pieceKit.ts';
import { PIECES } from './pieces.ts';

// a phone screen's body, which pieces are made at unless they say otherwise; web sections are made at 1200
const PHONE_W = 345;
// a small piece (a toggle, a checkbox) is drawn at this share of the cell rather than filling it
const MIN_VIEW = 200;
const DARK = new Set(['#18181b', '#27272a']);
const LIGHT = new Set(['#fff', '#ffffff']);

// A text is drawn as a bar the height of its letters, as long as its words would run, placed by its alignment.
function textBar(i: PieceItem) {
  const s = i.size ?? 15,
    w = Math.min(i.w, Math.max(s, (i.text?.length ?? 6) * s * 0.5)),
    x = i.align === 'center' ? i.x + (i.w - w) / 2 : i.align === 'right' ? i.x + i.w - w : i.x,
    y = i.y + s * 0.25,
    h = s * 0.6,
    rx = h / 2,
    cls = LIGHT.has(i.color ?? '') ? 't tl' : 't';
  return `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/>`;
}

function shape(i: PieceItem) {
  switch (i.type) {
    case 'text':
      return textBar(i);
    case 'icon': {
      const cx = i.x + i.w / 2,
        cy = i.y + i.h / 2,
        r = Math.min(i.w, i.h) / 2.4,
        cls = LIGHT.has(i.color ?? '') ? 'i tl' : 'i';
      return `<circle class="${cls}" cx="${cx}" cy="${cy}" r="${r}"/>`;
    }
    case 'box': {
      const cls = DARK.has(i.fill ?? '') ? 'bd' : 'b',
        rx = Math.min(i.radius ?? 0, i.h / 2, i.w / 2);
      return `<rect class="${cls}" x="${i.x}" y="${i.y}" width="${i.w}" height="${i.h}" rx="${rx}"/>`;
    }
    default: {
      const unknown: never = i.type;
      return unknown;
    }
  }
}

const made = new Map<string, string>();

/** A piece drawn small from its own cards, for its cell in the Pieces picker: boxes as boxes, words as bars, icons as
 *  dots, each coloured from the theme in CSS. Built the first time it is asked for, then kept. */
export function pieceThumb(name: string): string {
  const kept = made.get(name);
  if (kept !== undefined) return kept;
  const P = PIECES[name];
  if (!P) return '';
  const items = P.make(P.web ? 1200 : P.w || PHONE_W, { panel: true }),
    bw = Math.max(1, ...items.map(i => i.x + i.w)),
    bh = Math.max(1, ...items.map(i => i.y + i.h)),
    vw = Math.max(bw, MIN_VIEW),
    vx = (bw - vw) / 2,
    parts = items.map(shape).join(''),
    svg = `<svg viewBox="${vx} 0 ${vw} ${bh}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${parts}</svg>`;
  made.set(name, svg);
  return svg;
}
