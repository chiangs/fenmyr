import assert from 'node:assert';
import { DOMParser } from 'linkedom';
import { canonical, parse, serialise } from '../src/web/richtext/dialect.ts';
import { BOLD, type Doc, ITALIC, type Line, normalise, type Run, STRIKE, UNDER } from '../src/web/richtext/doc.ts';
import { domToSubset } from '../src/web/richtext/fromDom.ts';
import { plainOf, render } from '../src/web/richtext/render.ts';
import { typedFormat } from '../src/web/richtext/typed.ts';

const body = (html: string) =>
  new DOMParser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, 'text/html').body;
const run = (text: string, marks = 0, href?: string): Run => (href ? { text, marks, href } : { text, marks });
const text = (...runs: Run[]): Line => ({ kind: 'text', runs });
const bullet = (depth: 1 | 2 | 3, ...runs: Run[]): Line => ({ kind: 'item', list: 'bullet', depth, runs });
const numbered = (depth: 1 | 2 | 3, n: number, ...runs: Run[]): Line => ({
  kind: 'item',
  list: 'number',
  n,
  depth,
  runs,
});
const continuation = (...runs: Run[]): Line => ({ kind: 'continuation', runs });

const reads: [string, Doc, string][] = [
  [
    '**bold** and *italic*',
    [text(run('bold', BOLD), run(' and '), run('italic', ITALIC))],
    'bold and italic on single words',
  ],
  ['***both***', [text(run('both', BOLD | ITALIC))], 'three asterisks are bold and italic together'],
  ['~~gone~~ <u>under</u>', [text(run('gone', STRIKE), run(' '), run('under', UNDER))], 'strike and underline'],
  ['snake_case and file_name.txt', [text(run('snake_case and file_name.txt'))], 'an underscore is never italic'],
  ['5 * 3 = 15', [text(run('5 * 3 = 15'))], 'a lone asterisk stays an asterisk'],
  ['<b>raw</b> & <i>tags</i>', [text(run('<b>raw</b> & <i>tags</i>'))], 'HTML other than <u> is just words'],
  ['\\*not italic\\* \\- \\\\', [text(run('*not italic* - \\'))], 'escaped characters are literal'],
  [
    '- a\n  - b\n    - c\n      - d',
    [bullet(1, run('a')), bullet(2, run('b')), bullet(3, run('c')), bullet(3, run('d'))],
    'lists nest three levels deep and no further',
  ],
  ['    - deep', [bullet(1, run('deep'))], 'an item never starts deeper than one below the line before'],
  [
    '1. one\n2. two\n\n1. again',
    [numbered(1, 1, run('one')), numbered(1, 2, run('two')), text(), numbered(1, 1, run('again'))],
    'numbered items, then a blank line, then a new list',
  ],
  [
    '3. three\n9. four\n  - x\n1. five',
    [numbered(1, 3, run('three')), numbered(1, 4, run('four')), bullet(2, run('x')), numbered(1, 5, run('five'))],
    'a list keeps its first number and counts on from it, past a nested list',
  ],
  ['1984. A novel', [numbered(1, 1984, run('A novel'))], 'a number is kept as written'],
  [
    '- item\n  more of it',
    [bullet(1, run('item')), continuation(run('more of it'))],
    'an indented row belongs to the item',
  ],
  ['- item\nnot part of it', [bullet(1, run('item')), text(run('not part of it'))], 'an unindented row ends the list'],
  ['', [], 'an empty body is no lines'],
  [
    '**Friday **at *noon*~~ x~~',
    [text(run('Friday', BOLD), run(' at '), run('noon', ITALIC), run(' '), run('x', STRIKE))],
    'bold, italic and strike never start or end on a space, so Markdown readers see them',
  ],
  ['**a b**', [text(run('a b', BOLD))], 'spaces inside a styled span keep its style'],
  ['<u>a </u>b', [text(run('a ', UNDER), run('b'))], 'underline is a tag, so it may end on a space'],
  [
    '[a **b**](https://x.org/a\\(b\\)) c',
    [text(run('a ', 0, 'https://x.org/a(b)'), run('b', BOLD, 'https://x.org/a(b)'), run(' c'))],
    'a link may hold emphasis, and its address its own escapes',
  ],
  [
    '**a [b](mailto:me@x.org) c**',
    [text(run('a ', BOLD), run('b', BOLD, 'mailto:me@x.org'), run(' c', BOLD))],
    'emphasis may run across a link',
  ],
  [
    '[x](javascript:alert(1)) [y](ftp://x.org) [](https://x.org) \\[z](https://x.org) [w](https://a b)',
    [text(run('[x](javascript:alert(1)) [y](ftp://x.org) [](https://x.org) [z](https://x.org) [w](https://a b)'))],
    'other schemes, an empty label, an escaped bracket and a space in the address are just words',
  ],
  [
    'the guide (https://x.org/guide)',
    [text(run('the guide (https://x.org/guide)'))],
    'a note that kept an address in brackets keeps it as words',
  ],
];
for (const [input, doc, why] of reads) assert.deepStrictEqual(parse(input), doc, why);

const writes: [Doc, string, string][] = [
  [[text(run('a', BOLD), run('b', BOLD | ITALIC))], '**a*b***', 'italic opens inside bold'],
  [[text(run('b', BOLD | ITALIC), run('c', ITALIC))], '***b**c*', 'bold ends while italic carries on'],
  [[text(run('x', BOLD | STRIKE | UNDER))], '**~~<u>x</u>~~**', 'bold outside, then strike, then underline'],
  [[text(run('a*b ~c [d] <e> \\f'))], 'a\\*b \\~c \\[d] \\<e> \\\\f', 'characters the dialect uses are escaped'],
  [[text(run('- not a list'))], '\\- not a list', 'a line that looks like a bullet is escaped'],
  [[text(run('12. not a list'))], '12\\. not a list', 'a line that looks numbered is escaped'],
  [
    [numbered(1, 2, run('a')), bullet(2, run('c')), numbered(1, 3, run('d'))],
    '2. a\n  - c\n3. d',
    'numbered items write their numbers',
  ],
  [[bullet(1, run('a')), text(run(' indented'))], '- a\n\\ indented', 'a line under a list may start with a space'],
  [
    [text(run('a]b*', 0, 'https://x.org/(1)\\'), run('c', 0, 'mailto:me@x.org'))],
    '[a\\]b\\*](https://x.org/\\(1\\)\\\\)[c](mailto:me@x.org)',
    'a label escapes its closing bracket, an address its brackets, and two links side by side stay two',
  ],
  [
    [text(run('a', BOLD), run('b', BOLD | ITALIC, 'https://x.org'), run('c', ITALIC, 'https://x.org'), run('d'))],
    '**a[*b**c*](https://x.org)d',
    'marks that start or stop at a link are written inside its label',
  ],
];
for (const [doc, output, why] of writes) assert.strictEqual(serialise(doc), output, why);

assert.strictEqual(
  render([text(run('a')), text(), bullet(1, run('x')), bullet(2, run('y')), text(run('c'))]),
  'a\n\n<ul><li>x<ul><li>y</li></ul></li></ul>c',
  'lists nest inside their item, with no newline beside a list unless it is a blank line',
);
assert.strictEqual(
  render([numbered(1, 3, run('c')), numbered(1, 4, run('d')), text(), numbered(1, 1, run('e'))]),
  '<ol start="3"><li>c</li><li>d</li></ol>\n<ol><li>e</li></ol>',
  'a list that starts past 1 says where',
);
assert.strictEqual(
  render([text(run('b', BOLD | ITALIC), run(' & <i>', UNDER))]),
  '<strong><em>b</em></strong><u> &amp; &lt;i&gt;</u>',
  'emphasis uses strong, em, s and u, and words are escaped',
);

const unsafe =
  '<img src=x onerror=alert(1)> <script>alert(1)</script> <a href="javascript:alert(1)">x</a> [x](javascript:alert(1))';
const drawn = body(render(parse(unsafe)));
assert.strictEqual(drawn.querySelectorAll('*').length, 0, 'markup from stored text makes no elements');
assert.strictEqual(drawn.textContent, unsafe, 'and shows every character of it');
const quoted = body(render(parse('[x](https://x.org/"onclick="go\\(\\)><script>)')));
assert.deepStrictEqual(
  Array.from(quoted.querySelectorAll('*'), el => [el.nodeName, Array.from(el.attributes, a => a.name)]),
  [['A', ['href']]],
  'an address with quotes and brackets in it is still one link with only its address',
);
assert.strictEqual(
  render([text(run('x', 0, 'javascript:alert(1)'), run(' '), run('y', 0, 'https://x.org/?a=1&b="2"'))]),
  'x <a href="https://x.org/?a=1&amp;b=&quot;2&quot;">y</a>',
  'drawing checks the scheme again and escapes the address',
);
assert.strictEqual(canonical('the guide (https://x.org/guide)'), 'the guide (https://x.org/guide)', 'and keeps it so');

assert.strictEqual(
  plainOf({ text: '**a** *b* \\*\n- c\n  - d\n4. e\n  more\n5. f', rich: true }),
  'a b *\n• c\n  • d\n4. e\n  more\n5. f',
  'plain words keep list markers and drop style markers',
);
assert.strictEqual(plainOf({ text: '**a** - b' }), '**a** - b', 'a note that is not rich reads as it is stored');
assert.strictEqual(
  plainOf({
    text: 'read [the *guide*](https://x.org/g) at [x.org](https://x.org/) or [mail](mailto:a@x.org)',
    rich: true,
  }),
  'read the guide (https://x.org/g) at x.org or mail (mailto:a@x.org)',
  'plain words keep a link’s address, once when the label is the address',
);

const typing: [string, string, ReturnType<typeof typedFormat>, string][] = [
  ['a **word**', '', { length: 8, label: [2, 6], marks: BOLD }, 'typed bold'],
  ['*word*', ' ', { length: 6, label: [1, 5], marks: ITALIC }, 'typed italic, with a space after it'],
  ['~~a b~~', '', { length: 7, label: [2, 5], marks: STRIKE }, 'typed strike'],
  ['***both*** x **c**', '', { length: 5, label: [2, 3], marks: BOLD }, 'only the span the last star closes'],
  ['**word*', '', null, 'one star of two waits for the second'],
  ['5 * 3 *', '', null, 'arithmetic stays as typed'],
  ['2*3*', '', null, 'even with no spaces'],
  ['a ** b **', '', null, 'stars against spaces stay'],
  ['*word*', 's', null, 'a word straight after stops it'],
  ['~word~', '', null, 'strike takes two tildes'],
  [
    'see [the *guide*](https://x.org/a_(b))',
    '',
    { length: 34, label: [1, 12], marks: 0, href: 'https://x.org/a_(b)' },
    'a typed link, its address with brackets in it',
  ],
  ['[x](javascript:alert(1))', '', null, 'a typed link to a script stays words'],
  ['[x](x.org) and [ ](https://x.org)', '', null, 'as does one with no scheme or no label'],
];
for (const [typed, after, want, why] of typing) assert.deepStrictEqual(typedFormat(typed, after), want, why);

const started = performance.now();
render(parse('line\n'.repeat(25_000)));
assert.ok(performance.now() - started < 1000, '25,000 lines draw in linear time');

let seed = 20261105;
const random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(xs: readonly T[]): T => {
  const x = xs[Math.floor(random() * xs.length)];
  if (x === undefined) throw new Error('empty choice');
  return x;
};
const PIECES = [
  ...'ab  *~\\[]()<>&"-.12u/_#•\té😀',
  '- ',
  '1. ',
  '  ',
  '**',
  '<u>',
  '</u>',
  '~~',
  '\\*',
  '](',
  'http:',
];
const ADDRESSES = [
  'https://x.org/a_(b)\\c',
  'mailto:me@x.org',
  'HTTP://x.org/*[]~<u>"&',
  'javascript:alert(1)',
  'ftp://x.org',
  'https://a b',
];
const randomRuns = () =>
  Array.from({ length: Math.floor(random() * 4) }, () =>
    run(
      Array.from({ length: 1 + Math.floor(random() * 4) }, () => pick(PIECES)).join(''),
      Math.floor(random() * 16),
      random() < 0.4 ? pick(ADDRESSES) : undefined,
    ),
  );
const randomLine = (): Line => {
  const kind = pick(['text', 'text', 'bullet', 'number', 'continuation'] as const),
    depth = pick([1, 2, 3, 3] as const),
    runs = randomRuns();
  if (kind === 'bullet') return { kind: 'item', list: 'bullet', depth, runs };
  if (kind === 'number') return { kind: 'item', list: 'number', n: pick([0, 1, 1, 2, 7, 1984]), depth, runs };
  return { kind, runs };
};

const ALLOWED = new Set(['UL', 'OL', 'LI', 'STRONG', 'EM', 'S', 'U', 'A']);
const allowedAttributes = (el: Element) =>
  Array.from(el.attributes).every(
    a =>
      (el.nodeName === 'OL' && a.name === 'start' && /^\d+$/.test(a.value)) ||
      (el.nodeName === 'A' && a.name === 'href' && /^(https?|mailto):\S*$/i.test(a.value)),
  ) &&
  (el.nodeName !== 'A' || el.hasAttribute('href'));
const BODIES = 1000;
let links = 0;
for (let i = 0; i < BODIES; i++) {
  const doc = normalise(Array.from({ length: Math.floor(random() * 9) }, randomLine));
  const stored = serialise(doc);
  assert.deepStrictEqual(parse(stored), doc, `reads back what it wrote: ${JSON.stringify(stored)}`);
  const drawing = body(render(doc));
  assert.strictEqual(domToSubset(drawing, 'editor'), stored, `the drawing reads back: ${JSON.stringify(stored)}`);
  for (const el of drawing.querySelectorAll('*'))
    assert.ok(
      ALLOWED.has(el.nodeName) && allowedAttributes(el),
      `only lists, emphasis and safe links: ${el.outerHTML}`,
    );
  links += drawing.querySelectorAll('a').length;
}
assert.ok(links > BODIES / 2, `the bodies hold links: ${links}`);

console.log(`RICHTEXT OK (${BODIES} random bodies round-trip, with ${links} links)`);
