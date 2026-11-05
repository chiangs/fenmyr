// Changes go through execCommand because Chromium's undo history skips direct DOM edits.
import { BOLD, ITALIC, type Line, type ListKind, STRIKE } from '../richtext/doc.ts';
import { docFromDom } from '../richtext/fromDom.ts';
import { renderForEditing, runsHtml } from '../richtext/render.ts';
import { typedFormat } from '../richtext/typed.ts';
import { openLinkPop } from './noteLinks.ts';

const FORMATS = {
  bold: { kind: 'mark', command: 'bold' },
  italic: { kind: 'mark', command: 'italic' },
  under: { kind: 'mark', command: 'underline' },
  strike: { kind: 'mark', command: 'strikeThrough' },
  bullets: { kind: 'list', command: 'insertUnorderedList' },
  numbered: { kind: 'list', command: 'insertOrderedList' },
  clear: { kind: 'clear' },
} as const;
export type Format = keyof typeof FORMATS;
const MARKS = [FORMATS.bold, FORMATS.italic, FORMATS.under, FORMATS.strike];

const BY_CHARACTER = new Map<string, Format>([
  ['b', 'bold'],
  ['i', 'italic'],
  ['u', 'under'],
  ['Shift+x', 'strike'],
  ['\\', 'clear'],
]);
const BY_KEY_POSITION = new Map<string, Format>([
  ['Shift+Digit8', 'bullets'],
  ['Shift+Digit7', 'numbered'],
  ['Backslash', 'clear'],
]);
const STARTERS = new Map<string, ListKind>([
  ['-', 'bullet'],
  ['*', 'bullet'],
  ['•', 'bullet'],
  ['1.', 'number'],
]);
const TYPED_MARKS = [
  [BOLD, 'bold'],
  [ITALIC, 'italic'],
  [STRIKE, 'strike'],
] as const;
const MAX_DEPTH = 3;
const graphemes = new Intl.Segmenter();
const wired = new WeakSet<HTMLElement>();

export const isFormat = (f: string | undefined): f is Format => !!f && Object.hasOwn(FORMATS, f);

export function formatOn(f: Format) {
  const format = FORMATS[f];
  return format.kind !== 'clear' && document.queryCommandState(format.command);
}

function clearFormatting() {
  if (!getSelection()?.isCollapsed) {
    document.execCommand('removeFormat');
    return;
  }
  for (const m of MARKS) if (document.queryCommandState(m.command)) document.execCommand(m.command);
}

function shortcutOf(e: KeyboardEvent) {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return undefined;
  const shift = e.shiftKey ? 'Shift+' : '';
  return BY_CHARACTER.get(shift + e.key.toLowerCase()) ?? BY_KEY_POSITION.get(shift + e.code);
}

function itemAtCaret(t: HTMLElement) {
  const n = getSelection()?.anchorNode,
    li = (n instanceof Element ? n : n?.parentElement)?.closest('li');
  return li && t.contains(li) ? li : null;
}

// The dialect nests an item only under one before it.
function canIndent(t: HTMLElement, li: Element) {
  let depth = 0;
  for (let n: Element | null = li; n && n !== t; n = n.parentElement) if (n.matches('ul, ol')) depth++;
  return depth < MAX_DEPTH && !!li.previousElementSibling?.matches('li, ul, ol');
}

function atStartOf(li: Element) {
  const s = getSelection();
  if (!s?.isCollapsed || !s.anchorNode) return false;
  const r = document.createRange();
  r.setStart(li, 0);
  r.setEnd(s.anchorNode, s.anchorOffset);
  return r.toString() === '';
}

// Moving the selection drops the style Chromium keeps for the next characters, such as Ctrl+B with no words selected,
// so a look around the caret puts it back.
function lookAround(s: Selection, look: () => string) {
  const node = s.focusNode,
    offset = s.focusOffset;
  if (!node || !s.isCollapsed) return '';
  const styled = MARKS.map(m => document.queryCommandState(m.command)),
    seen = look();
  s.collapse(node, offset);
  MARKS.forEach((m, i) => {
    if (document.queryCommandState(m.command) !== styled[i]) document.execCommand(m.command);
  });
  return seen;
}

// Chromium's paragraphs are the dialect's lines, a row broken with Shift+Enter included.
export const lineBeforeCaret = (s: Selection) =>
  lookAround(s, () => {
    s.modify('extend', 'backward', 'paragraphboundary');
    return s.toString();
  });

const charAfterCaret = (s: Selection) =>
  lookAround(s, () => {
    s.modify('extend', 'forward', 'character');
    return s.toString();
  });

function pointBefore(t: HTMLElement, node: Text, offset: number, back: number) {
  const walk = document.createTreeWalker(t, NodeFilter.SHOW_TEXT);
  walk.currentNode = node;
  let at: Node | null = node,
    length = offset,
    left = back;
  while (at && left > length) {
    left -= length;
    at = walk.previousNode();
    length = at?.textContent?.length ?? 0;
  }
  return at && { node: at, offset: length - left };
}

type Caret = { readonly node: Node | null; readonly offset: number; readonly html: string };
type Step = { readonly before: Caret; readonly after: Caret };
const stepsIn = new WeakMap<HTMLElement, Step[]>();
const caretIn = (t: HTMLElement, s: Selection): Caret => ({
  node: s.focusNode,
  offset: s.focusOffset,
  html: t.innerHTML,
});

function recordStep(t: HTMLElement, before: Caret, s: Selection) {
  const steps = stepsIn.get(t) ?? [];
  steps.push({ before, after: caretIn(t, s) });
  stepsIn.set(t, steps.slice(-20));
}

// Chromium's undo of our commands selects what they replaced, and its redo leaves the caret where the command put it.
function keepCaretThroughUndo(t: HTMLElement, e: InputEvent) {
  const undo = e.inputType === 'historyUndo';
  if (!undo && e.inputType !== 'historyRedo') return;
  const html = t.innerHTML,
    step = stepsIn.get(t)?.findLast(m => (undo ? m.before : m.after).html === html),
    at = step && (undo ? step.before : step.after);
  if (at?.node && t.contains(at.node)) getSelection()?.collapse(at.node, at.offset);
}

// Chromium leaves the caret at the start of a line it moves into a new list.
function toggleList(t: HTMLElement, command: string) {
  const s = getSelection();
  if (!s?.isCollapsed) {
    document.execCommand(command);
    return;
  }
  const before = caretIn(t, s),
    along = [...graphemes.segment(lineBeforeCaret(s))].length;
  document.execCommand(command);
  s.modify('move', 'backward', 'paragraphboundary');
  for (let i = 0; i < along; i++) s.modify('move', 'forward', 'character');
  recordStep(t, before, s);
}

export function runFormat(t: HTMLElement, f: Format) {
  const format = FORMATS[f];
  switch (format.kind) {
    case 'mark':
      document.execCommand(format.command);
      return;
    case 'list':
      toggleList(t, format.command);
      return;
    case 'clear':
      clearFormatting();
      return;
    default: {
      const unknown: never = format;
      return unknown;
    }
  }
}

// The last * ~ or ) of **word**, ~~word~~ or [label](address) formats what was typed, in one insertHTML so a single
// Ctrl+Z gives the characters back. The words typed next carry on unformatted.
function formatTyped(t: HTMLElement, s: Selection) {
  const node = s.focusNode,
    offset = s.focusOffset;
  if (!(node instanceof Text) || !s.isCollapsed) return;
  const f = typedFormat(lineBeforeCaret(s), charAfterCaret(s)),
    start = f && pointBefore(t, node, offset, f.length),
    from = f && pointBefore(t, node, offset, f.length - f.label[0]),
    to = f && pointBefore(t, node, offset, f.length - f.label[1]);
  if (!f || !start || !from || !to) return;
  const label = document.createRange();
  label.setStart(from.node, from.offset);
  label.setEnd(to.node, to.offset);
  const runs = (docFromDom(label.cloneContents(), 'editor')[0]?.runs ?? []).map(r =>
      f.href ? { ...r, marks: r.marks | f.marks, href: f.href } : { ...r, marks: r.marks | f.marks },
    ),
    before = caretIn(t, s);
  s.setBaseAndExtent(start.node, start.offset, node, offset);
  document.execCommand('insertHTML', false, runsHtml(runs));
  recordStep(t, before, s);
  for (const [bit, format] of TYPED_MARKS) if (f.marks & bit && formatOn(format)) runFormat(t, format);
}

function startList(t: HTMLElement, s: Selection, list: ListKind) {
  // typed first, so Ctrl+Z after the list gives back the characters that made it
  document.execCommand('insertText', false, ' ');
  const before = caretIn(t, s);
  s.modify('extend', 'forward', 'paragraphboundary');
  const runs = docFromDom(s.getRangeAt(0).cloneContents(), 'editor')[0]?.runs ?? [],
    item: Line =
      list === 'number' ? { kind: 'item', list, n: 1, depth: 1, runs } : { kind: 'item', list, depth: 1, runs };
  s.collapseToStart();
  s.modify('move', 'backward', 'paragraphboundary');
  s.modify('extend', 'forward', 'paragraphboundary');
  // a newline left after the list would put a blank line before the words that follow
  if (s.focusNode instanceof Text && s.focusNode.data[s.focusOffset] === '\n')
    s.modify('extend', 'forward', 'character');
  document.execCommand('insertHTML', false, renderForEditing([item]));
  s.modify('move', 'backward', 'paragraphboundary');
  recordStep(t, before, s);
}

export function wireNoteKeys(t: HTMLElement) {
  if (wired.has(t)) return;
  wired.add(t);
  let listJustTyped: Element | null = null;
  t.addEventListener(
    'keydown',
    e => {
      const just = listJustTyped;
      listJustTyped = null;
      if (!t.isContentEditable || e.isComposing) return;
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        e.stopPropagation();
        openLinkPop(t);
        return;
      }
      const format = shortcutOf(e);
      if (format) {
        e.preventDefault();
        e.stopPropagation();
        runFormat(t, format);
        return;
      }
      const li = e.ctrlKey || e.metaKey || e.altKey ? null : itemAtCaret(t);
      if (!li) return;
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.shiftKey) document.execCommand('outdent');
        else if (canIndent(t, li)) document.execCommand('indent');
      } else if (e.key === 'Backspace' && atStartOf(li)) {
        e.preventDefault();
        document.execCommand(just === li ? 'undo' : 'outdent');
      }
    },
    true,
  );
  t.addEventListener('beforeinput', e => {
    const s = getSelection();
    if (e.inputType !== 'insertText' || e.data !== ' ' || !s || itemAtCaret(t)) return;
    const list = STARTERS.get(lineBeforeCaret(s));
    if (!list) return;
    e.preventDefault();
    startList(t, s, list);
    listJustTyped = itemAtCaret(t);
  });
  t.addEventListener('input', e => {
    if (!(e instanceof InputEvent)) return;
    keepCaretThroughUndo(t, e);
    const s = getSelection();
    if (e.inputType === 'insertText' && !e.isComposing && /^[*~)]$/.test(e.data ?? '') && s) formatTyped(t, s);
  });
  t.addEventListener('mousedown', () => {
    listJustTyped = null;
  });
  t.addEventListener('compositionend', () => t.dispatchEvent(new InputEvent('input', { data: null })));
}
