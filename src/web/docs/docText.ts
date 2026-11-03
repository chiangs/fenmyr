import { isRecord } from '../../shared/model.ts';
import { esc } from '../ui/dom.ts';

import { settings } from '../settings/settings.ts';
import { type DocCard } from './editor.ts';

export const DOC_FONT = 'Figtree';
export const docDefault = () => (settings.defaultFont || '').trim() || DOC_FONT;
export const SIZES = [9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 60, 72];

export const BLOCKS: [key: string, name: string, size: number][] = [
  ['title', 'Title', 36],
  ['heading', 'Heading', 26],
  ['sub', 'Subheading', 20],
  ['body', 'Body', 16],
  ['lead', 'Lead', 19],
  ['caption', 'Caption', 13],
  ['quote', 'Quote', 18],
  ['code', 'Code', 14],
];

export const TEXT_COLORS = [
  '#2b2630',
  '#6b6370',
  '#a39aa8',
  '#d9771f',
  '#e8590c',
  '#c99a00',
  '#1f9d63',
  '#1f7ae0',
  '#6b4fe0',
  '#c0392b',
];

export const HIGHLIGHTS = ['#fff1a8', '#ffd3e5', '#cdf2df', '#d4e8ff', '#e5dbff', '#ffe0c9', '#e9e4ec'];

// all on Google Fonts, so they show up on any computer (the Mac list's Helvetica Neue, Avenir Next, Futura, Gill Sans, Baskerville,
// Palatino, Didot and Menlo are Apple's own; these are their closest free cousins)
export const SUGGESTED_FONTS = [
  'Figtree',
  'Inter',
  'Nunito Sans',
  'Jost',
  'Lato',
  'Gelasio',
  'Libre Baskerville',
  'EB Garamond',
  'Tinos',
  'Bodoni Moda',
  'Playfair Display',
  'Lora',
  'Fraunces',
  'Merriweather',
  'Space Grotesk',
  'IBM Plex Mono',
  'JetBrains Mono',
  'Shantell Sans',
];
export const fontName = (f: unknown) =>
  (
    String(f || '')
      .replace(/["']/g, '')
      .split(',')[0] ?? ''
  ).trim();

// plain text or Myra's light markdown → editor HTML (headings, lists, checklists, quotes, dividers, **bold**, *italic*, `code`)
export function mdToHTML(src: unknown) {
  const inl = (s: string | undefined) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>');
  const lines = String(src || '')
    .replace(/\r/g, '')
    .split('\n');
  let out = '',
    list: string | null = null;
  const close = () => {
    if (list) {
      out += `</${list === 'task' ? 'ul' : list}>`;
      list = null;
    }
  };
  const open = (k: string) => {
    if (list !== k) {
      close();
      out += k === 'task' ? '<ul data-type="taskList">' : `<${k}>`;
      list = k;
    }
  };
  for (const raw of lines) {
    const l = raw.trimEnd();
    let m: RegExpMatchArray | null;
    if (!l.trim()) {
      close();
      continue;
    }
    if ((m = l.match(/^(#{1,3})\s+(.*)/))) {
      close();
      const level = (m[1] ?? '#').length;
      out += `<h${level}>${inl(m[2])}</h${level}>`;
    } else if ((m = l.match(/^\s*(?:(?:[-*]\s+)?\[( |x|X)\]|([☐☑]))\s*(.*)/))) {
      open('task');
      const on = (m[1] || '').toLowerCase() === 'x' || m[2] === '☑';
      out += `<li data-type="taskItem" data-checked="${on}"><p>${inl(m[3])}</p></li>`;
    } else if ((m = l.match(/^\s*[-*•]\s+(.*)/))) {
      open('ul');
      out += `<li><p>${inl(m[1])}</p></li>`;
    } else if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) {
      open('ol');
      out += `<li><p>${inl(m[1])}</p></li>`;
    } else if ((m = l.match(/^>\s?(.*)/))) {
      close();
      out += `<blockquote><p>${inl(m[1])}</p></blockquote>`;
    } else if (/^(-{3,}|\*{3,})$/.test(l.trim())) {
      close();
      out += '<hr>';
    } else {
      close();
      out += `<p>${inl(l)}</p>`;
    }
  }
  close();
  return out || '<p></p>';
}

export const docHTML = (c: DocCard) => {
  const b = window.FenmyrEditor;
  return c.doc && b ? b.generateHTML(c.doc, b.extensions()) : mdToHTML(c.body);
};

// load any web fonts a doc uses, so it looks right on this computer
export function fontsIn(json: unknown) {
  const out = new Set<string>();
  const list = (x: unknown) => (Array.isArray(x) ? x : []);
  (function walk(n: unknown) {
    if (!isRecord(n)) return;
    for (const m of list(n.marks))
      if (isRecord(m) && m.type === 'textStyle' && isRecord(m.attrs) && m.attrs.fontFamily)
        out.add(fontName(m.attrs.fontFamily));
    list(n.content).forEach(walk);
  })(json);
  return [...out];
}
