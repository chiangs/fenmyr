import type { CardOf } from '../../shared/model.ts';
import { serialise } from '../richtext/dialect.ts';
import { type Doc, hasFormatting, wordsOf } from '../richtext/doc.ts';
import { domToSubset } from '../richtext/fromDom.ts';
import { fromClipboard } from '../richtext/paste.ts';
import { render } from '../richtext/render.ts';
import { say } from '../settings/licenses.ts';
import { esc } from '../ui/dom.ts';

type Note = CardOf<'note'>;
type Paste = { readonly kind: 'rich'; readonly doc: Doc } | { readonly kind: 'plain'; readonly words: string };

const LIMIT = 50_000;

function setNoteText(c: Note, text: string, rich: boolean) {
  c.text = text;
  if (rich) c.rich = true;
  else delete c.rich;
}

export const keepEditedText = (c: Note, t: HTMLElement) =>
  setNoteText(c, c.rich ? domToSubset(t, 'editor') : t.innerText.replace(/\n$/, ''), !!c.rich);

const wordsIn = (doc: Doc) => doc.map(l => wordsOf(l.runs)).join('\n');

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

// Inserted the way typing is, so the editor's own undo takes the paste back out.
export function pasteIntoNote(c: Note, t: HTMLElement, clip: DataTransfer, asPlain: boolean) {
  const p = pasted(clip, asPlain);
  if (p.kind === 'rich' && !c.rich) setNoteText(c, domToSubset(t, 'editor'), true);
  const html = p.kind === 'rich' ? render(p.doc) : esc(p.words);
  if (html) document.execCommand('insertHTML', false, html);
}

export function pastedNote(clip: DataTransfer): { text: string; rich?: true } {
  const p = pasted(clip, false);
  return p.kind === 'rich' ? { text: serialise(p.doc), rich: true } : { text: p.words.trim() };
}
