import { type Doc, hasFormatting, wordsOf } from './doc.ts';
import { docFromDom, type WalkNode } from './fromDom.ts';
import { docFromMarkdown } from './fromMarkdown.ts';

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const WRAPPED_IN_DELIMITERS = /^(\*\*|__|~~|\*|_|`).+\1$/s;

// Editors such as VS Code copy Markdown source as coloured HTML and draw `**Bold**` in bold, delimiters and all.
const isStyledSource = (doc: Doc) =>
  doc.some(l => l.runs.some(r => r.marks && WRAPPED_IN_DELIMITERS.test(r.text.trim())));

export function fromClipboard(html: WalkNode | null, plain: string): Doc | null {
  const fromHtml = html ? docFromDom(html, 'paste') : null;
  if (fromHtml && !isStyledSource(fromHtml)) {
    const words = fromHtml.map(l => wordsOf(l.runs)).join('\n');
    if (hasFormatting(fromHtml) || squash(words) !== squash(plain)) return fromHtml;
  }
  return docFromMarkdown(plain);
}
