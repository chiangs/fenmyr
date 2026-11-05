import { BOLD, ITALIC, linkAddress, STRIKE } from './doc.ts';
import { delimiterRun } from './fromMarkdown.ts';

// What the words typed so far on a line turn into as their last character goes in: the last `length` characters are
// replaced by the ones between `label[0]` and `label[1]` of them, with `marks` added and, for a link, its address.
export type Typed = {
  readonly length: number;
  readonly label: readonly [number, number];
  readonly marks: number;
  readonly href?: string;
};

const STARS = [0, ITALIC, BOLD, BOLD | ITALIC];
// Lengths are capped, as the importer's are, so a long line stays quick to check on every bracket.
const TYPED_LINK = /\[([^[\]\n]{1,999})\]\(((?:[^()\s]|\([^()\s]{0,99}\)){1,2000})\)$/;

function typedLink(typed: string): Typed | null {
  const m = TYPED_LINK.exec(typed),
    label = m?.[1] ?? '',
    href = linkAddress(m?.[2] ?? '');
  if (!m || !href || !label.trim()) return null;
  return { length: m[0].length, label: [1, 1 + label.length], marks: 0, href };
}

// The same flanking rules as pasted Markdown, and the opening run as long as the closing one, so that **a* waits for
// its second star.
function typedMarks(typed: string, after: string): Typed | null {
  const c = typed.at(-1) ?? '';
  let n = 0;
  while (typed[typed.length - 1 - n] === c) n++;
  const closeAt = typed.length - n,
    marks = c === '~' ? (n === 2 ? STRIKE : 0) : (STARS[n] ?? 0);
  if (!marks || !delimiterRun(c, typed[closeAt - 1] ?? '', after).close) return null;
  for (let end = closeAt - 1; end >= 0; end--) {
    if (typed[end] !== c) continue;
    let from = end;
    while (typed[from - 1] === c) from--;
    const opens = delimiterRun(c, typed[from - 1] ?? '', typed[end + 1] ?? '').open;
    if (end - from + 1 === n && opens && end + 1 < closeAt)
      return { length: typed.length - from, label: [n, closeAt - from], marks };
    end = from;
  }
  return null;
}

export function typedFormat(typed: string, after: string): Typed | null {
  const last = typed.at(-1);
  if (last === ')') return typedLink(typed);
  return last === '*' || last === '~' ? typedMarks(typed, after) : null;
}
