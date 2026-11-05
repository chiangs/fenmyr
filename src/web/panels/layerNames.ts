import type { Card } from '../../shared/model.ts';
import { CIC, host } from '../cards/shapes.ts';
import { plainOf } from '../richtext/render.ts';
import { pxSrc } from '../tools/stamps.ts';
import { esc } from '../ui/dom.ts';

export let LICON: Record<string, string> = {};

export const lyText = (s: unknown) =>
  String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const SHAPE_N: Record<string, string> = {
  rect: 'Rectangle',
  circle: 'Circle',
  tri: 'Triangle',
  star: 'Star',
  heart: 'Heart',
  line: 'Line',
};
const PLAIN_NAMES: Record<string, string> = { note: 'Note', text: 'Text', title: 'Title', todo: 'Checklist' };

// what a card shows as in the list, from its own words where it has some
function ownName(c: Card): string {
  switch (c.type) {
    case 'frame':
      return c.name || 'Screen';
    case 'coll':
      return c.name || c.text || (c.kanban ? 'Kanban' : 'Collection');
    case 'vnote':
      return c.title || 'Vault note';
    case 'note':
      return lyText(c.name) || lyText(plainOf(c));
    case 'text':
    case 'title':
      return lyText(c.text);
    case 'todo':
      return lyText(c.text) || lyText(c.items?.[0]?.t);
    case 'image':
      return c.tagText || 'Image';
    case 'link':
      return c.title || (c.url ? host(c.url) : 'Link');
    case 'doc':
      return c.text || 'Doc';
    case 'canvas':
      return c.text || 'Canvas';
    case 'swatch':
      return c.label || (c.hex || '').toUpperCase();
    case 'shape':
      return SHAPE_N[c.shape || 'rect'] ?? '';
    case 'path':
      return c.closed ? 'Pen shape' : 'Pen line';
    case 'stamp':
      return 'Stamp';
    case 'icon':
      return c.name || 'Icon';
    case 'audio':
      return 'Voice memo';
    case 'video':
      return c.title || 'Video';
    case 'spotify':
      return c.title || 'Spotify';
    case 'ink':
      return 'Drawing';
    case 'box':
      return c.img ? 'Image spot' : 'Box';
    case 'font':
      return c.font || 'Figtree';
    default:
      return '';
  }
}

export function layerName(c: Card) {
  if (c.type === 'section') return lyText(c.text) || 'Section';
  if (c.ln) return c.ln;
  return ownName(c) || PLAIN_NAMES[c.type] || c.type;
}

export function layerIcon(c: Card) {
  if (c.type === 'section') return LICON.section ?? '';
  if (c.type === 'stamp') {
    const s = c.src || pxSrc(c.emoji || '⭐'),
      src = esc(s),
      emoji = esc(c.emoji || '⭐');
    return s ? `<img src="${src}" alt="">` : `<span class="ly-emo">${emoji}</span>`;
  }
  if (c.type === 'swatch') {
    const hex = esc(c.hex);
    return `<i class="ly-sw" style="background:${hex}"></i>`;
  }
  if (c.type === 'icon') return Icon(c.name || 'star');
  return toolIcon(c.type) || LICON[c.type] || CIC[c.type] || LICON.box || '';
}

// the very same icon as the button you made it with (the toolbar, or the wireframe panel), so a piece looks the same in both places
const TOOL_OF: Record<string, string> = {
  ink: '[data-add="draw"]',
  frame: '[data-wf="frame"]',
  box: '[data-wf="box"]',
  icon: '[data-wf="icon"]',
  text: '[data-wf="text"]',
};
const toolIc: Record<string, string | null> = {};

function toolIcon(type: string) {
  if (type in toolIc) return toolIc[type];
  const svg = document.querySelector(`${TOOL_OF[type] || `.tools [data-add="${type}"]`} svg`);
  if (!svg) return (toolIc[type] = null);
  const k = svg.cloneNode(true);
  if (!(k instanceof Element)) return (toolIc[type] = null);
  k.removeAttribute('width');
  k.removeAttribute('height');
  return (toolIc[type] = k.outerHTML); // only the outer size: the shapes inside keep theirs
}

// the icons drawn once the icon set has loaded
export function initLayerIcons() {
  LICON = {
    path: Icon('path'),
    section: Icon('section'),
    note: Icon('note'),
    todo: Icon('checklist'),
    title: Icon('title'),
    text: Icon('text'),
    image: Icon('image'),
    audio: Icon('mic'),
    ink: Icon('draw'),
    frame: Icon('screen'),
    box: Icon('rectangle'),
    font: Icon('font'),
    coll: Icon('collection'),
    group: Icon('group'),
    shape: Icon('shapes'),
    icon: Icon('smiley'),
  };
}
