import { ASCII_PUNCTUATION, serialise } from './dialect.ts';
import {
  addRun,
  BOLD,
  collapseBlankLines,
  type Doc,
  depthOf,
  ITALIC,
  type Line,
  linkAddress,
  normalise,
  type Run,
  STRIKE,
  UNDER,
} from './doc.ts';

const ITEM = /^([ \t]*)(?:([-*+–](?=[ \t]))|([•◦▪‣])|(\d{1,9})[.)](?=[ \t]))[ \t]*(.*)$/;
const TASK = /^\[([ xX])\](?:[ \t]+|$)/;
const HEADING = /^ {0,3}#{1,6}(?:[ \t]+(.*))?$/;
const THEMATIC_BREAK = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}>[ \t]?/;
const FENCE = /^ {0,3}(```|~~~)/;
const INDENTED = /^( {2,}|\t)/;
// Lengths are capped so a paste of thousands of unclosed brackets stays linear.
const LINK =
  /\[([^\]\n]{0,999})\]\([ \t]{0,9}<?((?:[^()\s<>]|\([^()\s]{0,99}\)){1,2000})>?(?:[ \t]{1,9}"[^"\n]{0,999}")?[ \t]{0,9}\)/y;
const WIKI = /\[\[([^\]|\n]{0,999})(?:\|([^\]\n]{0,999}))?\]\]/y;
const EMBED = /!\[\[[^\]\n]{0,999}\]\]/y;
const AUTOLINK = /<((?:https?|mailto):[^>\s]{1,2000})>/iy;
const BARE_URL = /https?:\/\/[^\s<>]{1,2000}/y;
// GitHub's rule for where a bare address ends: these characters at its end belong to the sentence.
const URL_END_PUNCTUATION = '?!.,:;*_~\'")';

type Cell = { readonly c: string; readonly literal: boolean; readonly href?: string };
type Delim = {
  readonly at: number;
  readonly len: number;
  readonly c: string;
  readonly open: boolean;
  readonly close: boolean;
  left: number;
};
type Span = { readonly from: number; readonly to: number; readonly bit: number };

const space = (c: string) => !c || /\s/u.test(c);
const punct = (c: string) => /[\p{P}\p{S}]/u.test(c);
const word = (c: string) => /[\p{L}\p{N}]/u.test(c);

const matchAt = (re: RegExp, s: string, i: number) => {
  re.lastIndex = i;
  return re.exec(s);
};

function cellsOf(s: string): { cells: Cell[]; found: boolean } {
  const cells: Cell[] = [];
  let found = false;
  const put = (text: string, literal: boolean, href?: string) => {
    for (const c of text) cells.push(href ? { c, literal, href } : { c, literal });
  };
  for (let i = 0; i < s.length; ) {
    const c = s[i] ?? '',
      tag = s.startsWith('<u>', i) ? '<u>' : s.startsWith('</u>', i) ? '</u>' : '';
    let m: RegExpExecArray | null = null;
    if (c === '\\' && ASCII_PUNCTUATION.test(s[i + 1] ?? '')) {
      put(s[i + 1] ?? '', true);
      i += 2;
    } else if (c === '`') {
      let n = 1;
      while (s[i + n] === '`') n++;
      const end = s.indexOf('`'.repeat(n), i + n);
      if (end < 0) put('`'.repeat(n), true);
      else put(s.slice(i + n, end).replace(/^ (.*) $/s, '$1'), true);
      found ||= end >= 0;
      i = end < 0 ? i + n : end + n;
    } else if (tag) {
      cells.push({ c: tag, literal: false });
      i += tag.length;
    } else if (c === '!' && (m = matchAt(EMBED, s, i))) {
      found = true;
      i += m[0].length;
    } else if (c === '!' && (m = matchAt(LINK, s, i + 1))) {
      put(m[1] ?? '', true);
      found = true;
      i += m[0].length + 1;
    } else if (c === '[' && (m = matchAt(WIKI, s, i))) {
      put(m[2] ?? m[1] ?? '', true);
      found = true;
      i += m[0].length;
    } else if (c === '[' && (m = matchAt(LINK, s, i))) {
      const label = m[1] ?? '',
        href = linkAddress(m[2] ?? '');
      if (href && !label.trim()) put(href, true, href);
      else put(label, false, href);
      found = true;
      i += m[0].length;
    } else if (c === '<' && (m = matchAt(AUTOLINK, s, i))) {
      const href = linkAddress(m[1] ?? '');
      if (href) put(href, true, href);
      found = true;
      i += m[0].length;
    } else if (c === 'h' && !word(s[i - 1] ?? '') && (m = matchAt(BARE_URL, s, i))) {
      let end = m[0].length;
      while (end && URL_END_PUNCTUATION.includes(m[0][end - 1] ?? '')) end--;
      put(m[0].slice(0, end), true);
      i += end;
    } else {
      put(c, false);
      i++;
    }
  }
  return { cells, found };
}

// Flanking as defined in https://spec.commonmark.org/0.31.2/#left-flanking-delimiter-run
function delimsOf(cells: readonly Cell[]): Delim[] {
  const out: Delim[] = [];
  for (let i = 0; i < cells.length; ) {
    const cell = cells[i];
    if (!cell || cell.literal || !'*_~'.includes(cell.c)) {
      i++;
      continue;
    }
    let len = 1;
    while (cells[i + len]?.c === cell.c && !cells[i + len]?.literal) len++;
    // a <u> or </u> next to a delimiter counts as its angle bracket, as raw HTML does in CommonMark
    const before = (cells[i - 1]?.c ?? '').replace(/^<\/?u>$/, '>'),
      after = (cells[i + len]?.c ?? '').replace(/^<\/?u>$/, '<'),
      leftFlank = !space(after) && (!punct(after) || space(before) || punct(before)),
      rightFlank = !space(before) && (!punct(before) || space(after) || punct(after)),
      shellGlob = cell.c === '*' && after === '.',
      open = leftFlank && !word(before) && !shellGlob,
      close = rightFlank && !word(after);
    if ((open || close) && (cell.c !== '~' || len === 2)) out.push({ at: i, len, c: cell.c, open, close, left: len });
    i += len;
  }
  return out;
}

function matchNearestOpener(cells: readonly Cell[]) {
  const spans: Span[] = [],
    used = new Set<number>(),
    openers: Delim[] = [];
  for (const d of delimsOf(cells)) {
    while (d.close && d.left) {
      const k = openers.findLastIndex(o => o.c === d.c && o.left);
      const o = openers[k];
      if (!o) break;
      const take = d.c === '~' ? 2 : o.left >= 2 && d.left >= 2 ? 2 : 1,
        from = o.at + o.left,
        to = d.at + d.len - d.left;
      for (let j = 0; j < take; j++) used.add(from - 1 - j).add(to + j);
      spans.push({ from, to, bit: d.c === '~' ? STRIKE : take === 2 ? BOLD : ITALIC });
      o.left -= take;
      d.left -= take;
      openers.splice(o.left ? k + 1 : k);
    }
    if (d.left && d.open) openers.push(d);
  }
  const under: number[] = [];
  cells.forEach((cell, i) => {
    if (cell.literal) return;
    if (cell.c === '<u>') under.push(i);
    const from = cell.c === '</u>' ? under.pop() : undefined;
    if (from === undefined) return;
    used.add(from).add(i);
    spans.push({ from: from + 1, to: i, bit: UNDER });
  });
  return { spans, used };
}

function runsOf(s: string, extra: number) {
  const { cells, found } = cellsOf(s),
    { spans, used } = matchNearestOpener(cells),
    marks = cells.map(() => extra);
  for (const span of spans) for (let i = span.from; i < span.to; i++) marks[i] = (marks[i] ?? 0) | span.bit;
  const runs: Run[] = [];
  cells.forEach((cell, i) => {
    if (!used.has(i)) addRun(runs, cell.c, marks[i] ?? 0, cell.href);
  });
  return { runs, found: found || spans.length > 0 };
}

function headingText(s: string) {
  const t = s.trimEnd();
  let end = t.length;
  while (end && t[end - 1] === '#') end--;
  const closed = end < t.length && (end === 0 || t[end - 1] === ' ' || t[end - 1] === '\t');
  return closed ? t.slice(0, end).trimEnd() : t;
}

// Pasted Markdown and PDF text carry a list on past a blank line or an unindented row. Text written in the dialect, as
// Myra's is, ends a list at either.
type Lists = 'loose' | 'strict';

export function docFromMarkdown(plain: string, lists: Lists = 'loose'): Doc | null {
  const lines: Line[] = [];
  let found = false,
    fenced = false,
    blanksInList = 0,
    levels: number[] = [];
  const inline = (s: string, extra = 0) => {
    const r = runsOf(s, extra);
    found ||= r.found;
    return r.runs;
  };
  const inList = () => lines.at(-1)?.kind === 'item' || lines.at(-1)?.kind === 'continuation';
  // A blank line between two parts of a list is spacing, so the list and its numbers carry on.
  const endList = () => {
    if (blanksInList) lines.push({ kind: 'text', runs: [] });
    blanksInList = 0;
    levels = [];
  };
  for (const raw of plain.replace(/\r\n?/g, '\n').split('\n')) {
    if (FENCE.test(raw)) {
      endList();
      fenced = !fenced;
      continue;
    }
    if (fenced) {
      lines.push({ kind: 'text', runs: [{ text: raw.trimEnd(), marks: 0 }] });
      continue;
    }
    let line = raw.trimEnd();
    while (QUOTE.test(line)) line = line.replace(QUOTE, '');
    if (!line.trim()) {
      if (inList() && lists === 'loose') blanksInList++;
      else lines.push({ kind: 'text', runs: [] });
      continue;
    }
    const breakLine = THEMATIC_BREAK.test(line),
      item = breakLine ? null : ITEM.exec(line),
      heading = HEADING.exec(line);
    if (item) {
      const indent = (item[1] ?? '').replace(/\t/g, '    ').length;
      while (levels.length && indent < (levels.at(-1) ?? 0)) levels.pop();
      if (!levels.length || indent > (levels.at(-1) ?? 0)) levels.push(indent);
      let body = item[5] ?? '';
      const task = TASK.exec(body);
      if (task) {
        const rest = body.slice(task[0].length);
        body = (task[1] === ' ' ? '☐' : '☑') + (rest ? ` ${rest}` : '');
      }
      const depth = depthOf(levels.length),
        runs = inline(body);
      lines.push(
        item[4]
          ? { kind: 'item', list: 'number', n: Number(item[4]), depth, runs }
          : { kind: 'item', list: 'bullet', depth, runs },
      );
      blanksInList = 0;
      found = true;
    } else if (heading) {
      endList();
      lines.push({ kind: 'text', runs: inline(headingText(heading[1] ?? ''), BOLD) });
      found = true;
    } else if (breakLine) {
      endList();
      lines.push({ kind: 'text', runs: [{ text: line, marks: 0 }] });
    } else if (inList() && ((!blanksInList && lists === 'loose') || INDENTED.test(line))) {
      // with no blank line before it, an unindented line still belongs to the item: a wrapped line in a PDF list
      blanksInList = 0;
      lines.push({ kind: 'continuation', runs: inline(line.trim()) });
    } else {
      endList();
      lines.push({ kind: 'text', runs: inline(line) });
    }
  }
  return found ? normalise(collapseBlankLines(lines)) : null;
}

export function markdownToSubset(plain: string, lists?: Lists) {
  const doc = docFromMarkdown(plain, lists);
  return doc && serialise(doc);
}
