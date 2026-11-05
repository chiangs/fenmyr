// The dialect a rich note's `text` is stored in: a small Markdown that older versions and Myra can read as it is.
//   inline  **bold**  *italic*  ~~strike~~  <u>underline</u>
//   block   a line; "- " bullet; "3. " numbered, the first number of a list kept and the rest counted on from it;
//           two spaces of indent per level; a continuation row indented under its item
//   escape  \ before * ~ [ < \; before the "-" or "." of a line that would read as an item;
//           before a space that starts a plain line under a list
// Delimiters toggle, so a change of style between two runs is written as the marks that flip there. Only text this
// file writes needs to round-trip exactly; anything else still parses, with unmatched delimiters kept as text.
import {
  addRun,
  BOLD,
  type Doc,
  depthOf,
  ITALIC,
  indentLevels,
  type Line,
  normalise,
  type Run,
  STRIKE,
  UNDER,
} from './doc.ts';

const ITEM = /^( *)(?:(-)|(\d{1,9})\.) /;
export const ASCII_PUNCTUATION = /^[!-/:-@[-`{-~]$/;
const SPECIAL = /[\\*~[<]/g;
const ASTERISKS = ['', '*', '**', '***'];
const FLIPS = [0, ITALIC, BOLD, BOLD | ITALIC];

type Token =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'flip'; readonly marks: number }
  | { readonly kind: 'under'; readonly on: boolean };

const flipText = (marks: number) =>
  (ASTERISKS[(marks & BOLD ? 2 : 0) + (marks & ITALIC ? 1 : 0)] ?? '') + (marks & STRIKE ? '~~' : '');

function tokens(s: string): Token[] {
  const out: Token[] = [];
  let text = '';
  const flush = () => {
    if (text) out.push({ kind: 'text', text });
    text = '';
  };
  for (let i = 0; i < s.length; ) {
    const c = s[i] ?? '';
    const next = s[i + 1] ?? '';
    if (c === '\\' && (ASCII_PUNCTUATION.test(next) || next === ' ')) {
      text += next;
      i += 2;
    } else if (c === '*' || c === '~') {
      let n = 1;
      while (s[i + n] === c) n++;
      const marks = c === '*' ? FLIPS[n] : n === 2 ? STRIKE : undefined;
      if (marks) {
        flush();
        out.push({ kind: 'flip', marks });
      } else text += s.slice(i, i + n);
      i += n;
    } else if (s.startsWith('<u>', i) || s.startsWith('</u>', i)) {
      const on = next === 'u';
      flush();
      out.push({ kind: 'under', on });
      i += on ? 3 : 4;
    } else {
      text += c;
      i++;
    }
  }
  flush();
  return out;
}

function unmatchedAsText(toks: readonly Token[]): Token[] {
  const literal = new Map<number, number>();
  for (const bit of [BOLD, ITALIC, STRIKE]) {
    const at = toks.flatMap((t, i) => (t.kind === 'flip' && t.marks & bit ? [i] : []));
    const last = at.at(-1);
    if (at.length % 2 && last !== undefined) literal.set(last, (literal.get(last) ?? 0) | bit);
  }
  let open = -1;
  toks.forEach((t, i) => {
    if (t.kind !== 'under') return;
    if (t.on && open < 0) open = i;
    else if (!t.on && open >= 0) open = -1;
    else literal.set(i, UNDER);
  });
  if (open >= 0) literal.set(open, UNDER);
  return toks.flatMap((t, i): Token[] => {
    const bits = literal.get(i);
    if (!bits) return [t];
    if (t.kind === 'under') return [{ kind: 'text', text: t.on ? '<u>' : '</u>' }];
    const kept = t.kind === 'flip' ? t.marks & ~bits : 0;
    const text = flipText(bits);
    return kept
      ? [
          { kind: 'flip', marks: kept },
          { kind: 'text', text },
        ]
      : [{ kind: 'text', text }];
  });
}

function inline(s: string): Run[] {
  const runs: Run[] = [];
  let marks = 0;
  for (const t of unmatchedAsText(tokens(s))) {
    switch (t.kind) {
      case 'text':
        addRun(runs, t.text, marks);
        break;
      case 'flip':
        marks ^= t.marks;
        break;
      case 'under':
        marks = t.on ? marks | UNDER : marks & ~UNDER;
        break;
      default: {
        const unhandled: never = t;
        return unhandled;
      }
    }
  }
  return runs;
}

export function parse(text: string): Doc {
  if (!text) return [];
  const lines: Line[] = [];
  let itemDepth = 0;
  for (const raw of text.split(/\r?\n/)) {
    const m = ITEM.exec(raw);
    if (m) {
      const depth = depthOf(Math.floor((m[1] ?? '').length / 2) + 1),
        runs = inline(raw.slice(m[0].length));
      lines.push(
        m[2]
          ? { kind: 'item', list: 'bullet', depth, runs }
          : { kind: 'item', list: 'number', n: Number(m[3]), depth, runs },
      );
      itemDepth = depth;
    } else if (itemDepth && raw.startsWith('  '.repeat(itemDepth))) {
      lines.push({ kind: 'continuation', runs: inline(raw.slice(itemDepth * 2)) });
    } else {
      lines.push({ kind: 'text', runs: inline(raw) });
      itemDepth = 0;
    }
  }
  return normalise(lines);
}

function boundary(was: number, now: number) {
  const off = was & ~now,
    on = now & ~was;
  return (
    (off & UNDER ? '</u>' : '') +
    (off & STRIKE ? '~~' : '') +
    flipText((was ^ now) & (BOLD | ITALIC)) +
    (on & STRIKE ? '~~' : '') +
    (on & UNDER ? '<u>' : '')
  );
}

function inlineText(runs: readonly Run[]) {
  let out = '',
    was = 0;
  for (const r of runs) {
    out += boundary(was, r.marks) + r.text.replace(SPECIAL, '\\$&');
    was = r.marks;
  }
  return out + boundary(was, 0);
}

function escapeItemMarker(s: string) {
  const m = ITEM.exec(s);
  if (!m) return s;
  const at = m[2] ? (m[1] ?? '').length : m[0].length - 2;
  return `${s.slice(0, at)}\\${s.slice(at)}`;
}

// Leading spaces on a plain line straight under a list would make it a continuation row.
const escapePlainLine = (s: string, underList: boolean) =>
  underList && s.startsWith(' ') ? `\\${s}` : escapeItemMarker(s);

export function keptAddress(label: string, href: string) {
  const address = href.replace(/\s+/g, '');
  if (!/^(https?|mailto):/i.test(address)) return '';
  const bare = (s: string) =>
    s
      .trim()
      .replace(/^(https?:\/\/|mailto:)/i, '')
      .replace(/\/$/, '')
      .toLowerCase();
  if (bare(label) === bare(address)) return '';
  return label.trim() ? ` (${address})` : address;
}

export function serialise(doc: Doc): string {
  const indents = indentLevels(doc);
  return doc
    .map((line, i) => {
      const body = inlineText(line.runs),
        pad = '  '.repeat(indents[i] ?? 0);
      switch (line.kind) {
        case 'item':
          return pad + (line.list === 'number' ? `${line.n}. ` : '- ') + body;
        case 'continuation':
          return pad + escapeItemMarker(body);
        case 'text':
          return escapePlainLine(body, doc[i - 1]?.kind === 'item' || doc[i - 1]?.kind === 'continuation');
        default: {
          const unhandled: never = line;
          return unhandled;
        }
      }
    })
    .join('\n');
}

// Stored text may predate a rule of the dialect; reading and writing it gives the form this file writes now.
export const canonical = (text: string) => serialise(parse(text));
