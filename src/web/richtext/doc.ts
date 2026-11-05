export const BOLD = 1;
export const ITALIC = 2;
export const STRIKE = 4;
export const UNDER = 8;

export const MARKS_OUTERMOST_FIRST = [
  { bit: BOLD, tag: 'strong' },
  { bit: ITALIC, tag: 'em' },
  { bit: STRIKE, tag: 's' },
  { bit: UNDER, tag: 'u' },
] as const;

export type Run = { readonly text: string; readonly marks: number };
export type Depth = 1 | 2 | 3;
type Item =
  | { readonly kind: 'item'; readonly list: 'bullet'; readonly depth: Depth; readonly runs: readonly Run[] }
  | {
      readonly kind: 'item';
      readonly list: 'number';
      readonly n: number;
      readonly depth: Depth;
      readonly runs: readonly Run[];
    };
export type ListKind = Item['list'];
export type Line =
  | { readonly kind: 'text'; readonly runs: readonly Run[] }
  | Item
  | { readonly kind: 'continuation'; readonly runs: readonly Run[] };
export type Doc = readonly Line[];

export const depthOf = (n: number): Depth => (n <= 1 ? 1 : n === 2 ? 2 : 3);

export function addRun(runs: Run[], text: string, marks: number) {
  if (!text) return;
  const last = runs.at(-1);
  if (last?.marks === marks) runs[runs.length - 1] = { text: last.text + text, marks };
  else runs.push({ text, marks });
}

export const wordsOf = (runs: readonly Run[]) => runs.map(r => r.text).join('');

// Markdown reads ** * ~~ only against a word, so bold, italic and strike never start or end on a space. Underline is
// a tag, so it may.
function marksOffEdgeSpaces(runs: readonly Run[]): Run[] {
  const chars = runs.flatMap(r => Array.from(r.text)),
    marks = runs.flatMap(r => Array.from(r.text, () => r.marks)),
    space = (i: number) => /\s/.test(chars[i] ?? '');
  for (const bit of [BOLD, ITALIC, STRIKE])
    for (let from = 0; from < marks.length; ) {
      if (!((marks[from] ?? 0) & bit)) {
        from++;
        continue;
      }
      let to = from;
      while (to < marks.length && (marks[to] ?? 0) & bit) to++;
      for (let i = from; i < to && space(i); i++) marks[i] = (marks[i] ?? 0) & ~bit;
      for (let i = to - 1; i >= from && space(i); i--) marks[i] = (marks[i] ?? 0) & ~bit;
      from = to;
    }
  const out: Run[] = [];
  chars.forEach((c, i) => {
    addRun(out, c, marks[i] ?? 0);
  });
  return out;
}

export function normalise(lines: readonly Line[]): Line[] {
  const out: Line[] = [];
  let depth = 0;
  const lastNumber: (number | undefined)[] = [];
  for (const line of lines) {
    const runs = marksOffEdgeSpaces(line.runs);
    if (line.kind === 'item') {
      const d = depthOf(Math.min(line.depth, depth + 1));
      lastNumber.length = d + 1;
      if (line.list === 'number') {
        const before = lastNumber[d],
          n = before === undefined ? line.n : before + 1;
        out.push({ kind: 'item', list: 'number', n, depth: d, runs });
        lastNumber[d] = n;
      } else {
        out.push({ kind: 'item', list: 'bullet', depth: d, runs });
        lastNumber[d] = undefined;
      }
      depth = d;
    } else if (line.kind === 'continuation' && depth) out.push({ kind: 'continuation', runs });
    else {
      out.push({ kind: 'text', runs });
      depth = 0;
      lastNumber.length = 0;
    }
  }
  const only = out.length === 1 ? out[0] : undefined;
  return only?.kind === 'text' && !only.runs.length ? [] : out;
}

export function collapseBlankLines(lines: readonly Line[]): Line[] {
  const kept: Line[] = [];
  for (const line of lines) {
    const blank = !wordsOf(line.runs).trim();
    if (blank && line.kind === 'continuation') continue;
    if (!blank || line.kind !== 'text') kept.push(line);
    else if (kept.length && (kept.at(-1)?.runs.length ?? 0)) kept.push({ kind: 'text', runs: [] });
  }
  if (kept.at(-1)?.kind === 'text' && !kept.at(-1)?.runs.length) kept.pop();
  return kept;
}

export const textDoc = (s: string) =>
  normalise(s.split('\n').map((t): Line => ({ kind: 'text', runs: t ? [{ text: t, marks: 0 }] : [] })));

export const hasFormatting = (doc: Doc) => doc.some(l => l.kind !== 'text' || l.runs.some(r => r.marks));

export function indentLevels(doc: Doc) {
  let itemDepth = 0;
  return doc.map(line => {
    if (line.kind === 'continuation') return itemDepth;
    itemDepth = line.kind === 'item' ? line.depth : 0;
    return Math.max(itemDepth - 1, 0);
  });
}
