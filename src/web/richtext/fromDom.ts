import { serialise } from './dialect.ts';
import {
  addRun,
  BOLD,
  collapseBlankLines,
  type Depth,
  type Doc,
  depthOf,
  ITALIC,
  type Line,
  type ListKind,
  linkAddress,
  normalise,
  type Run,
  STRIKE,
  UNDER,
  wordsOf,
} from './doc.ts';

export type WalkNode = {
  readonly nodeType: number;
  readonly nodeName: string;
  readonly nodeValue: string | null;
  readonly childNodes: ArrayLike<WalkNode>;
  getAttribute?(name: string): string | null;
};

export type Source = 'editor' | 'paste';

type Role = 'skip' | 'break' | 'box' | 'block' | 'list' | 'item' | 'cell' | 'link' | 'inline';

const named = (role: Role, names: string) => names.split(' ').map(n => [n, role] as const);
const ROLES = new Map<string, Role>([
  ...named('skip', 'SCRIPT STYLE HEAD TITLE META LINK TEMPLATE NOSCRIPT IMG PICTURE SVG CANVAS VIDEO AUDIO IFRAME'),
  ...named('skip', 'OBJECT EMBED SOURCE TEXTAREA SELECT BUTTON'),
  ...named('break', 'BR'),
  ...named('box', 'INPUT'),
  ...named('block', 'ADDRESS ARTICLE ASIDE BLOCKQUOTE CAPTION CENTER DD DETAILS DIALOG DIV DL DT FIELDSET FIGCAPTION'),
  ...named('block', 'FIGURE FOOTER FORM H1 H2 H3 H4 H5 H6 HEADER HGROUP HR MAIN NAV P PRE SECTION SUMMARY TABLE'),
  ...named('block', 'TBODY THEAD TFOOT TR'),
  ...named('list', 'UL OL'),
  ...named('item', 'LI'),
  ...named('cell', 'TD TH'),
  ...named('link', 'A'),
]);

const marked = (bit: number, names: string) => names.split(' ').map(n => [n, bit] as const);
const TAG_MARKS = new Map<string, number>([
  ...marked(BOLD, 'B STRONG'),
  ...marked(ITALIC, 'I EM CITE VAR DFN'),
  ...marked(UNDER, 'U INS'),
  ...marked(STRIKE, 'S STRIKE DEL'),
]);

type Ctx = {
  readonly marks: number;
  readonly heading: boolean;
  readonly list: ListKind;
  readonly start: number;
  readonly depth: number;
  readonly item: boolean;
  readonly pre: boolean;
  readonly cell: boolean;
  readonly href: string | undefined;
};

type Head =
  | { readonly kind: 'text' }
  | { readonly kind: 'continuation' }
  | { readonly kind: 'item'; readonly list: 'bullet'; readonly depth: Depth }
  | { readonly kind: 'item'; readonly list: 'number'; readonly n: number; readonly depth: Depth };
type Open = { head: Head; runs: Run[]; keepEmpty: boolean };

function styleOf(node: WalkNode) {
  const style = new Map<string, string>();
  for (const decl of (node.getAttribute?.('style') ?? '').split(';')) {
    const at = decl.indexOf(':');
    if (at > 0)
      style.set(
        decl.slice(0, at).trim().toLowerCase(),
        decl
          .slice(at + 1)
          .replace(/!important/i, '')
          .trim()
          .toLowerCase(),
      );
  }
  return style;
}

function weightIsBold(w: string) {
  if (w === 'bold' || w === 'bolder') return true;
  if (w === 'normal' || w === 'lighter') return false;
  return /^\d+$/.test(w) ? Number(w) >= 600 : null;
}

// Google Docs wraps what it copies in <b style="font-weight:normal">, so an inline weight overrides the tag.
function marksOf(name: string, style: ReadonlyMap<string, string>, marks: number) {
  let m = marks | (TAG_MARKS.get(name) ?? 0);
  const bold = weightIsBold(style.get('font-weight') ?? '');
  if (bold !== null) m = bold ? m | BOLD : m & ~BOLD;
  const fontStyle = style.get('font-style');
  if (fontStyle) m = /italic|oblique/.test(fontStyle) ? m | ITALIC : m & ~ITALIC;
  const decoration = decorationOf(name, style);
  if (decoration.includes('underline')) m |= UNDER;
  if (decoration.includes('line-through')) m |= STRIKE;
  return m;
}

const decorationOf = (name: string, style: ReadonlyMap<string, string>) =>
  name === 'A' ? '' : (style.get('text-decoration-line') ?? style.get('text-decoration') ?? '');

const startOf = (attr: string | null | undefined) => (attr && /^\s*\d{1,9}\s*$/.test(attr) ? Number(attr) : 1);

// Blocks a browser spaces out when the page sets no margin of its own.
const SPACED_BY_DEFAULT = new Set('P H1 H2 H3 H4 H5 H6 UL OL BLOCKQUOTE PRE FIGURE DL HR'.split(' '));
const positive = (length: string | undefined) => (Number.parseFloat(length ?? '') || 0) > 0;

// Whether the source drew a gap above and below a block, from its own margins or a browser's defaults.
function gapsOf(name: string, style: ReadonlyMap<string, string>) {
  let above = SPACED_BY_DEFAULT.has(name),
    below = above;
  const margin = style.get('margin')?.split(/\s+/),
    block = style.get('margin-block')?.split(/\s+/);
  if (margin) {
    above = positive(margin[0]);
    below = positive(margin[2] ?? margin[0]);
  }
  if (block) {
    above = positive(block[0]);
    below = positive(block[1] ?? block[0]);
  }
  const top = style.get('margin-top') ?? style.get('margin-block-start'),
    bottom = style.get('margin-bottom') ?? style.get('margin-block-end');
  if (top !== undefined) above = positive(top);
  if (bottom !== undefined) below = positive(bottom);
  return { above, below };
}

export function docFromDom(root: WalkNode, source: Source): Doc {
  const lines: Line[] = [];
  const fresh = (item: boolean): Open => ({
    head: item ? { kind: 'continuation' } : { kind: 'text' },
    runs: [],
    keepEmpty: false,
  });
  let cur = fresh(false);

  const push = () => {
    if (source === 'paste') trimEnd(cur.runs);
    lines.push({ ...cur.head, runs: cur.runs });
  };
  const lineBreak = (ctx: Ctx) => {
    push();
    cur = fresh(ctx.item);
  };
  const breakIfWords = (ctx: Ctx) => {
    if (cur.runs.length) lineBreak(ctx);
    else if (!cur.keepEmpty) cur = fresh(ctx.item);
  };
  // A gap between two blocks of a pasted page becomes one blank line, but never inside a list or a table.
  let gap = false;
  const gapAt = (ctx: Ctx, drawn: boolean) => {
    if (drawn && source === 'paste' && !ctx.depth && !ctx.cell) gap = true;
  };
  const add = (s: string, ctx: Ctx) => {
    const last = cur.runs.at(-1)?.text ?? '';
    const t = !ctx.pre && (!last || last.endsWith(' ')) ? s.replace(/^ /, '') : s;
    if (!t) return;
    if (gap && !cur.runs.length && lines.length) lines.push({ kind: 'text', runs: [] });
    gap = false;
    addRun(cur.runs, t, ctx.heading ? ctx.marks | BOLD : ctx.marks, ctx.href);
  };
  const text = (s: string, ctx: Ctx) => {
    const words = s.replace(/\r/g, '');
    if (!ctx.pre) add(words.replace(/[ \t\n\f]+/g, ' ').replace(/\u00a0/g, ' '), ctx);
    else
      words
        .replace(/\u00a0/g, ' ')
        .split('\n')
        .forEach((part, i) => {
          if (i) lineBreak(ctx);
          add(part, ctx);
        });
  };
  const kids = (node: WalkNode, ctx: Ctx) => {
    for (const child of Array.from(node.childNodes)) visit(child, ctx);
  };

  const visit = (node: WalkNode, ctx: Ctx) => {
    if (node.nodeType === 3) text(node.nodeValue ?? '', ctx);
    if (node.nodeType !== 1) return;
    const name = node.nodeName.toUpperCase(),
      style = styleOf(node),
      role = ROLES.get(name) ?? 'inline',
      gaps = gapsOf(name, style);
    if (style.get('display') === 'none') return;
    const inner: Ctx = {
      ...ctx,
      marks: marksOf(name, style, ctx.marks),
      heading: ctx.heading || /^H[1-6]$/.test(name),
      pre: ctx.pre || name === 'PRE' || /^pre|^break-spaces/.test(style.get('white-space') ?? ''),
    };
    switch (role) {
      case 'skip':
        break;
      case 'break':
        if (ctx.cell) add(' ', ctx);
        else lineBreak(ctx);
        break;
      case 'box':
        if (node.getAttribute?.('type') === 'checkbox') add(node.getAttribute('checked') === null ? '☐ ' : '☑ ', ctx);
        break;
      case 'block':
        if (ctx.cell) add(' ', ctx);
        else breakIfWords(ctx);
        gapAt(ctx, gaps.above);
        kids(node, inner);
        if (!ctx.cell) breakIfWords(ctx);
        gapAt(ctx, gaps.below);
        break;
      case 'list':
        breakIfWords(ctx);
        gapAt(ctx, gaps.above);
        kids(node, {
          ...inner,
          list: name === 'OL' ? 'number' : 'bullet',
          start: startOf(node.getAttribute?.('start')),
          depth: ctx.depth + 1,
          item: false,
        });
        breakIfWords(ctx);
        gapAt(ctx, gaps.below);
        break;
      case 'item':
        breakIfWords(ctx);
        cur = {
          head:
            ctx.list === 'number'
              ? { kind: 'item', list: 'number', n: ctx.start, depth: depthOf(ctx.depth) }
              : { kind: 'item', list: 'bullet', depth: depthOf(ctx.depth) },
          runs: [],
          keepEmpty: true,
        };
        kids(node, { ...inner, item: true });
        if (cur.runs.length || cur.keepEmpty) push();
        cur = fresh(ctx.item);
        break;
      case 'cell':
        if (cur.runs.length) add(' | ', ctx);
        kids(node, { ...inner, cell: true });
        break;
      case 'link': {
        const line = cur,
          before = wordsOf(cur.runs).length,
          linked = { ...inner, href: linkAddress(node.getAttribute?.('href') ?? '') ?? ctx.href };
        kids(node, linked);
        const label = wordsOf(cur.runs).slice(line === cur ? before : 0);
        // a link with no words, such as one around a picture, shows its address
        if (linked.href && !label.trim()) add(linked.href, linked);
        break;
      }
      case 'inline':
        kids(node, inner);
        break;
      default: {
        const unhandled: never = role;
        return unhandled;
      }
    }
  };

  const top: Ctx = {
    marks: 0,
    heading: false,
    list: 'bullet',
    start: 1,
    depth: 0,
    item: false,
    pre: source === 'editor',
    cell: false,
    href: undefined,
  };
  kids(root, top);
  if (cur.runs.length || cur.keepEmpty) push();
  return normalise(source === 'paste' ? collapseBlankLines(lines) : lines);
}

function trimEnd(runs: Run[]) {
  for (let last = runs.at(-1); last; last = runs.at(-1)) {
    const text = last.text.trimEnd();
    if (text) {
      runs[runs.length - 1] = { ...last, text };
      return;
    }
    runs.pop();
  }
}

export const domToSubset = (root: WalkNode, source: Source) => serialise(docFromDom(root, source));
