import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { DOMParser } from 'linkedom';
import { serialise } from '../src/web/richtext/dialect.ts';
import { hasFormatting } from '../src/web/richtext/doc.ts';
import { domToSubset } from '../src/web/richtext/fromDom.ts';
import { markdownToSubset } from '../src/web/richtext/fromMarkdown.ts';
import { fromClipboard } from '../src/web/richtext/paste.ts';

// linkedom's DOMParser doesn't add the <html> and <body> that a browser's does.
const body = (html: string) =>
  new DOMParser().parseFromString(
    /<body[\s>]/i.test(html) ? html : `<!doctype html><html><body>${html}</body></html>`,
    'text/html',
  ).body;
const fromHtml = (html: string) => domToSubset(body(html), 'paste');
const pasted = (html: string | null, plain: string) => {
  const doc = fromClipboard(html === null ? null : body(html), plain);
  return doc && serialise(doc);
};

const html: [string, string, string][] = [
  [
    '<p><b>b</b> <strong>s</strong> <span style="font-weight:700">w</span> <span style="font-weight:500">m</span></p>',
    '**b** **s** **w** m',
    'bold from tags and from a weight of 600 or more',
  ],
  [
    '<b style="font-weight:normal;" id="docs-internal-guid-1"><span style="font-weight:400">plain </span><span style="font-weight:700">bold</span></b>',
    'plain **bold**',
    "Google Docs' wrapper is not bold; its heavy spans are",
  ],
  ['<i>i</i> <em>e</em> <span style="font-style: italic">s</span>', '*i* *e* *s*', 'italic from tags and style'],
  [
    '<u>u</u> <span style="text-decoration: underline">d</span> <a href="https://x.org" style="text-decoration:underline">site</a>',
    '<u>u</u> <u>d</u> [site](https://x.org)',
    "underline from tags and style, but not a link's own",
  ],
  [
    '<s>a</s> <del>b</del> <strike>c</strike> <span style="text-decoration-line:line-through">d</span>',
    '~~a~~ ~~b~~ ~~c~~ ~~d~~',
    'strike from tags and style',
  ],
  [
    '<ul><li>a<ul><li>b<ol><li>c<ul><li>d</li></ul></li></ol></li></ul></li></ul>',
    '- a\n  - b\n    1. c\n    - d',
    'lists deeper than three levels flatten to the third',
  ],
  [
    '<p>one</p><p>two</p><div>three<br>four</div>',
    'one\n\ntwo\n\nthree\nfour',
    'a gap after a paragraph is a blank line; divs and breaks are just lines',
  ],
  [
    '<p style="margin: 0px 0px 28px">a</p><h2 style="margin-top:0;margin-bottom:0">b</h2>',
    'a\n\n**b**',
    "a page's own margins decide the gap",
  ],
  [
    '<p style="margin-top:0pt;margin-bottom:0pt">a</p><p style="margin-top:0pt;margin-bottom:0pt">b</p>',
    'a\nb',
    'lines drawn with no gap stay line by line, as Google Docs draws them',
  ],
  ['<ul><li><p>a</p></li><li><p>b</p></li></ul><p>c</p>', '- a\n- b\n\nc', 'no blank lines inside a list'],
  ['<h2>Title</h2><p>body</p>', '**Title**\n\nbody', 'a heading is a bold line'],
  ['<h3><span style="font-weight:400">Docs title</span></h3>', '**Docs title**', 'even when its spans are light'],
  [
    '<a href="https://example.com/">https://example.com/</a> <a href="mailto:me@x.org">write</a> <a href="javascript:alert(1)">click</a>',
    '[https://example.com/](https://example.com/) [write](mailto:me@x.org) click',
    'links stay links, a label that is the address included; other schemes keep only the label',
  ],
  [
    '<a href="https://x.org/a(b)"><b>bold</b> <i>label</i></a> <a href="https://x.org/pic"><img src="p.png"></a>',
    '[**bold** *label*](https://x.org/a\\(b\\)) [https://x.org/pic](https://x.org/pic)',
    'a label keeps its emphasis, and a link with no words shows its address',
  ],
  [
    '<style>p{color:red}</style><script>alert(1)</script><p style="color:red;font-family:Comic Sans;font-size:30px">words<img src="x.png" onerror="alert(1)"></p>',
    'words',
    'scripts, styles, colours, fonts, sizes and images go; the words stay',
  ],
  ['<pre><code>let x = 1;\n  x++;</code></pre>', 'let x = 1;\n  x++;', 'code keeps its words and lines, not its look'],
  [
    '<table><tr><th>a</th><th>b</th></tr><tr><td><p>1</p></td><td>2</td></tr></table>',
    'a | b\n1 | 2',
    'a table is one line per row',
  ],
  [
    '<p><br></p><p>a</p><p><br></p><p><br></p><p><br></p><p>b</p><p><br></p>',
    'a\n\nb',
    'empty paragraphs collapse to one blank line, and none at either end',
  ],
  ['<ul>\n  <li>  one  </li>\n  <li>two</li>\n</ul>', '- one\n- two', 'layout whitespace collapses'],
  [
    '<ul><li><input type="checkbox" checked>done</li><li><input type="checkbox">to do</li></ul>',
    '- ☑ done\n- ☐ to do',
    'checkboxes become ☑ and ☐',
  ],
  ['<p>a * b and **c**</p>', 'a \\* b and \\*\\*c\\*\\*', "a page's own asterisks stay asterisks"],
  ['<ol start="3"><li>three</li><li>four</li></ol>', '3. three\n4. four', 'a list keeps the number it starts at'],
  [
    '<p>see <a href="https://x.org/a\n- b">here</a></p>',
    'see [here](https://x.org/a-b)',
    'an address never breaks the line',
  ],
  [
    '<ul><li><p>a</p><p><br></p><p><br></p><p>b</p><p><br></p></li></ul>',
    '- a\n  b',
    'empty paragraphs inside an item go',
  ],
];
for (const [input, expected, why] of html) assert.strictEqual(fromHtml(input), expected, why);

const markdown: [string, string | null, string][] = [
  ['- a\n* b\n+ c', '- a\n- b\n- c', 'any Markdown bullet'],
  ['1. a\n2) b', '1. a\n2. b', 'numbered with a dot or a bracket'],
  ['- a\n    - b\n\t- c\n  - d', '- a\n  - b\n  - c\n  - d', 'nesting by tabs or by two to four spaces'],
  ['**b** __b__ *i* _i_ ~~s~~ <u>u</u>', '**b** **b** *i* *i* ~~s~~ <u>u</u>', 'every emphasis Markdown has'],
  ['**b**<u>u</u> and <u>u</u>*i*', '**b**<u>u</u> and <u>u</u>*i*', 'emphasis right up against underline'],
  ['# Heading\ntext', '**Heading**\ntext', 'a heading is a bold line'],
  ['## Learn C#\n## Closed ##', '**Learn C#**\n**Closed**', 'closing hashes need a space before them'],
  ['- [ ] task\n- [x] done', '- ☐ task\n- ☑ done', 'task boxes'],
  ['[site](https://x.org) [[Page]] [[Page|label]]', '[site](https://x.org) Page label', 'links and wiki links'],
  [
    '[**b** l](https://x.org/Foo_(bar)) <mailto:me@x.org> [](https://x.org)',
    '[**b** l](https://x.org/Foo_\\(bar\\)) [mailto:me@x.org](mailto:me@x.org) [https://x.org](https://x.org)',
    'a label keeps its emphasis, and an address with no label is its own label',
  ],
  ['![[photo.png]]\n- a', '- a', 'embeds are dropped'],
  ['`co*de*` and *x*', 'co\\*de\\* and *x*', 'code keeps its characters'],
  ['> - quoted\n> **line**', '- quoted\n  **line**', 'quote marks go, the words stay'],
  [
    '1. Preheat the oven\n\n2. Mix the flour\n\n3. Bake',
    '1. Preheat the oven\n2. Mix the flour\n3. Bake',
    'blank lines between items keep the list and its numbers',
  ],
  ['- Fruit\n\n  - Apple\n\n- Veg\n\nAfter', '- Fruit\n  - Apple\n- Veg\n\nAfter', 'and its nesting'],
  ['3. Mix the flour\n4. Bake', '3. Mix the flour\n4. Bake', 'a list starts at its own first number'],
  ['- [ ]\n* * *', '- ☐\n\\* \\* \\*', 'an empty task box, and a rule that is not a list'],
  [
    'see https://docs.python.org/3/x.html#object.__init__, and *this*',
    'see https://docs.python.org/3/x.html#object.__init__, and *this*',
    'an address is never emphasis',
  ],
  ['[label](javascript:alert(1)) [file](ftp://x.org/f) **b**', 'label file **b**', 'other schemes keep only the label'],
  ['5 * 3 = 15 and 2*3*4', null, 'arithmetic is not Markdown'],
  ['a - b - c, then snake_case_name and file_name.txt', null, 'dashes and underscores inside prose are not'],
  ['Price: *50% off', null, 'a lone asterisk is not'],
  ['#tag and #another', null, 'a tag is not a heading'],
  ['cp *.txt backup/*.bak', null, 'nor is a shell pattern'],
];
for (const [input, expected, why] of markdown) assert.strictEqual(markdownToSubset(input), expected, why);
assert.strictEqual(
  markdownToSubset('- a\nafter\n\n- b', 'strict'),
  '- a\nafter\n\n- b',
  'text written in the dialect ends a list at an unindented line or a blank one',
);

const pdf: [string, string, string][] = [
  ['• one\n• two\n◦ sub', '- one\n- two\n- sub', 'PDF bullets'],
  ['– dash\n‣ tri\n▪ square', '- dash\n- tri\n- square', 'more PDF bullets'],
  [
    'Steps\n1) Open the lid\n2) Rinse the filter under\nwarm water\n3) Refit',
    'Steps\n1. Open the lid\n2. Rinse the filter under\n  warm water\n3. Refit',
    'a wrapped line stays a line of its own, inside its item',
  ],
];
for (const [input, expected, why] of pdf) assert.strictEqual(markdownToSubset(input), expected, why);

assert.strictEqual(pasted('<p>a <b>bold</b> word</p>', 'a bold word'), 'a **bold** word', 'HTML with formatting wins');
assert.strictEqual(
  pasted('<h2>1. Introduction</h2><p>This is <b>important</b>.</p>', '1. Introduction\n\nThis is important.'),
  '**1. Introduction**\n\nThis is **important**.',
  'even when its words read as Markdown',
);
assert.strictEqual(pasted('<p>- a</p><p>- b</p>', '- a\n- b'), '- a\n- b', 'HTML with nothing more yields to Markdown');
assert.strictEqual(pasted('<p>just words</p>', 'just words'), null, 'and plain words paste as before');
assert.strictEqual(pasted(null, 'just words'), null, 'as do plain words with no HTML');
const linkOnly = fromClipboard(
  body('<p>Read the <a href="https://example.org/guide">install guide</a> first.</p>'),
  'Read the install guide first.',
);
assert.strictEqual(
  linkOnly && serialise(linkOnly),
  'Read the [install guide](https://example.org/guide) first.',
  'a link stays a link',
);
assert.ok(linkOnly && hasFormatting(linkOnly), 'so the note is rich, the only kind that keeps a link');

const slow = (what: string, convert: () => unknown) => {
  const started = performance.now();
  convert();
  assert.ok(performance.now() - started < 1000, `${what} converts in linear time`);
};
slow('50,000 open brackets', () => markdownToSubset('['.repeat(50_000)));
slow('unclosed wiki links', () => markdownToSubset('[[a|'.repeat(12_500)));
slow('a heading full of spaces', () => markdownToSubset(`# a${' '.repeat(50_000)}b`));
slow('50,000 backticks', () => markdownToSubset('`'.repeat(50_000)));
slow('25,000 lines', () => fromHtml('<p>line</p>'.repeat(25_000)));

const FIXTURES = path.join(import.meta.dirname, 'fixtures', 'richtext');
const read = (file: string) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);
const names = fs
  .readdirSync(FIXTURES)
  .filter(f => f.endsWith('.expected'))
  .map(f => f.slice(0, -'.expected'.length));
for (const name of names) {
  const at = path.join(FIXTURES, name),
    copied = read(`${at}.html`),
    expected = read(`${at}.expected`)?.replace(/\n$/, '') ?? '',
    pastesAsPlainText = expected === '';
  assert.strictEqual(pasted(copied, read(`${at}.txt`) ?? ''), pastesAsPlainText ? null : expected, name);
}
assert.ok(names.length, 'the fixtures were found');

console.log(`RICHPASTE OK (${names.length} clipboard fixtures)`);
