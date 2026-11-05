import { esc } from '../ui/dom.ts';
import { parse } from './dialect.ts';
import { type Doc, indentLevels, type ListKind, MARKS_OUTERMOST_FIRST, type Run, textDoc, wordsOf } from './doc.ts';

const LIST_TAG = { bullet: 'ul', number: 'ol' } as const;

type Rows = (readonly Run[])[];
type Entry = { readonly list: ListKind; readonly start: number; readonly depth: number; readonly rows: Rows };
type Block = { readonly kind: 'text'; readonly rows: Rows } | { readonly kind: 'list'; readonly entries: Entry[] };

const wrap = (tag: string, html: string) => `<${tag}>${html}</${tag}>`;

const runHtml = (r: Run) =>
  MARKS_OUTERMOST_FIRST.reduceRight((html, m) => (r.marks & m.bit ? wrap(m.tag, html) : html), esc(r.text));

// pre-wrap doesn't show a newline that ends its box, so an empty last row needs a second one.
function rowsHtml(rows: Rows) {
  const texts = rows.map(r => r.map(runHtml).join(''));
  return texts.join('\n') + (texts.at(-1) === '' ? '\n' : '');
}

function blocks(doc: Doc) {
  const out: Block[] = [];
  for (const line of doc) {
    const last = out.at(-1);
    if (line.kind === 'text') {
      if (last?.kind === 'text') last.rows.push(line.runs);
      else out.push({ kind: 'text', rows: [line.runs] });
    } else if (line.kind === 'item') {
      const start = line.list === 'number' ? line.n : 0,
        entry = { list: line.list, start, depth: line.depth, rows: [line.runs] };
      if (last?.kind === 'list') last.entries.push(entry);
      else out.push({ kind: 'list', entries: [entry] });
    } else if (last?.kind === 'list') last.entries.at(-1)?.rows.push(line.runs);
  }
  return out;
}

function openTag(e: Entry) {
  if (e.list === 'bullet') return '<ul>';
  if (e.start === 1) return '<ol>';
  const start = e.start;
  return `<ol start="${start}">`;
}

function listHtml(entries: readonly Entry[], rowsOf = rowsHtml) {
  const open: ListKind[] = [];
  let html = '';
  const closeTo = (depth: number) => {
    while (open.length > depth) {
      const tag = LIST_TAG[open.pop() ?? 'bullet'];
      html += `</li></${tag}>`;
    }
  };
  for (const e of entries) {
    closeTo(e.depth);
    if (open.length === e.depth && open[e.depth - 1] !== e.list) closeTo(e.depth - 1);
    if (open.length === e.depth) html += '</li>';
    else {
      html += openTag(e);
      open.push(e.list);
    }
    const rows = rowsOf(e.rows);
    html += `<li>${rows}`;
  }
  closeTo(0);
  return html;
}

export const render = (doc: Doc) =>
  blocks(doc)
    .map(b => (b.kind === 'text' ? rowsHtml(b.rows) : listHtml(b.entries)))
    .join('');

// While a note is typed in, every line outside a list is a block of its own: the shape Chromium's list commands keep
// intact. A newline beside a list would join two lines when an item leaves it.
const editRowsHtml = (rows: Rows) => {
  const html = rowsHtml(rows);
  return html === '\n' ? '<br>' : html;
};
function editBlockHtml(b: Block) {
  if (b.kind === 'list') return listHtml(b.entries, editRowsHtml);
  return b.rows
    .map(r => {
      const row = r.map(runHtml).join('') || '<br>';
      return `<div>${row}</div>`;
    })
    .join('');
}

type Note = { readonly text?: string; readonly rich?: boolean };

export const renderForEditing = (doc: Doc) => blocks(doc).map(editBlockHtml).join('');

// pre-wrap hides a plain note's last newline, so the editor leaves it out too.
export const editHtmlOf = (note: Note) =>
  renderForEditing(note.rich ? parse(note.text ?? '') : textDoc((note.text ?? '').replace(/\n$/, '')));

const HTML_BY_TEXT_MAX = 2000;
const htmlByText = new Map<string, string>();

export function htmlOf(note: Note) {
  if (!note.rich) return esc(note.text);
  const text = note.text ?? '';
  let html = htmlByText.get(text);
  if (html === undefined) {
    html = render(parse(text));
    if (htmlByText.size >= HTML_BY_TEXT_MAX) htmlByText.delete(htmlByText.keys().next().value ?? '');
    htmlByText.set(text, html);
  }
  return html;
}

export function plainOf(note: Note) {
  const text = note.text ?? '';
  if (!note.rich) return text;
  const doc = parse(text),
    indents = indentLevels(doc);
  return doc
    .map((line, i) => {
      const marker = line.kind !== 'item' ? '' : line.list === 'number' ? `${line.n}. ` : '• ';
      return '  '.repeat(indents[i] ?? 0) + marker + wordsOf(line.runs);
    })
    .join('\n');
}
