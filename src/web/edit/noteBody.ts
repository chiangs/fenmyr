import type { CardOf } from '../../shared/model.ts';
import { say } from '../myra/say.ts';
import { serialise } from '../richtext/dialect.ts';
import { type Doc, hasFormatting, textDoc, wordsOf } from '../richtext/doc.ts';
import { docFromDom } from '../richtext/fromDom.ts';
import { docFromMarkdown } from '../richtext/fromMarkdown.ts';
import { fromClipboard } from '../richtext/paste.ts';
import { renderForEditing } from '../richtext/render.ts';
import { lineBeforeCaret } from './noteKeys.ts';

type Note = CardOf<'note'>;
type Paste = { readonly kind: 'rich'; readonly doc: Doc } | { readonly kind: 'plain'; readonly words: string };

const LIMIT = 50_000;

function setNoteText(c: Note, text: string, rich: boolean) {
  c.text = text;
  if (rich) c.rich = true;
  else delete c.rich;
}

const wordsIn = (doc: Doc) => doc.map(l => wordsOf(l.runs)).join('\n');

export function keepEditedText(c: Note, t: HTMLElement) {
  const doc = docFromDom(t, 'editor'),
    rich = !!c.rich || hasFormatting(doc);
  setNoteText(c, rich ? serialise(doc) : wordsIn(doc), rich);
}

// Myra answers in Markdown, where a star with no word against it is just a star, so her words go through the importer.
// A note she gives no formatting keeps the kind it was.
export function keepMyraText(c: Note, words: string) {
  const doc = docFromMarkdown(words, 'strict');
  if (doc && hasFormatting(doc)) setNoteText(c, serialise(doc), true);
  else setNoteText(c, c.rich ? serialise(textDoc(words)) : words, !!c.rich);
}

function readPaste(clip: DataTransfer, asPlain: boolean): Paste {
  const plain = clip.getData('text/plain').replace(/\r\n?/g, '\n'),
    html = clip.getData('text/html'),
    doc = asPlain ? null : fromClipboard(html ? new DOMParser().parseFromString(html, 'text/html').body : null, plain);
  if (!doc) return { kind: 'plain', words: plain };
  if (hasFormatting(doc)) return { kind: 'rich', doc };
  return { kind: 'plain', words: wordsIn(doc) };
}

// A rich paste is cut between lines, so no formatting is cut in half. One whose first line alone is too long keeps its
// words without their formatting.
function withinLimit(p: Paste): Paste {
  if (p.kind === 'rich') {
    let left = LIMIT,
      kept = 0;
    for (const line of p.doc) {
      left -= wordsOf(line.runs).length + 1;
      if (left < 0) break;
      kept++;
    }
    if (kept === p.doc.length) return p;
    return kept ? { kind: 'rich', doc: p.doc.slice(0, kept) } : withinLimit({ kind: 'plain', words: wordsIn(p.doc) });
  }
  if (p.words.length <= LIMIT) return p;
  const at = Math.max(p.words.lastIndexOf('\n', LIMIT), p.words.lastIndexOf(' ', LIMIT));
  return { kind: 'plain', words: p.words.slice(0, at > 0 ? at : LIMIT) };
}

function pasted(clip: DataTransfer, asPlain: boolean) {
  const p = readPaste(clip, asPlain),
    kept = withinLimit(p);
  if (kept !== p) say('That paste is over 50,000 characters, so I kept the first part of it.', 7000);
  return kept;
}

// Words typed into an empty note sit outside any block, and Chromium joins them to the first item of a list pasted
// straight after them once that item leaves the list, unless a break ends their line.
function breakBefore(t: HTMLElement, doc: Doc) {
  const s = getSelection(),
    n = s?.anchorNode,
    block = (n instanceof Element ? n : n?.parentElement)?.closest('div, li');
  return doc[0]?.kind === 'item' && s && block === t && lineBeforeCaret(s) ? '<br>' : '';
}

// Inserted the way typing is, so the editor's own undo takes the paste back out.
export function pasteIntoNote(t: HTMLElement, clip: DataTransfer, asPlain: boolean) {
  const p = pasted(clip, asPlain),
    doc = p.kind === 'rich' ? p.doc : textDoc(p.words),
    html = renderForEditing(doc);
  if (html) document.execCommand('insertHTML', false, breakBefore(t, doc) + html);
}

export function pastedNote(clip: DataTransfer): { text: string; rich?: true } {
  const p = pasted(clip, false);
  return p.kind === 'rich' ? { text: serialise(p.doc), rich: true } : { text: p.words.trim() };
}
