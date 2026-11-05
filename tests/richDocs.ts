// A rich note dropped into a Doc, in the real app. Its emphasis, links, nested lists and a numbered list's first
// number arrive as the Doc's own formatting, on a Doc card and on the open page. A plain note drops as it always has.
import assert from 'node:assert';
import { launch } from './support/launch.ts';

const GUIDE = 'https://example.org/guide';
const note = (id: string, y: number, h: number, name: string, text: string, rich: boolean) => ({
  id,
  type: 'note',
  x: 40,
  y,
  w: 300,
  h,
  r: 0,
  color: 'white',
  name,
  text,
  ...(rich ? { rich: true } : {}),
});
const doc = (id: string, y: number) => ({ id, type: 'doc', x: 420, y, w: 240, h: 52, r: 0, text: id, body: 'Notes' });
const RICH = note(
  'rich',
  20,
  300,
  'Trip',
  [
    'Plan for **Friday** with *care*, <u>under</u> and ~~old~~',
    `Read [the **best** guide](${GUIDE}) and [this](javascript:alert(1))`,
    '- Fruit',
    '  - Apples',
    '    - Cox',
    '  - Pears',
    '- Veg',
    '  greens too',
    '',
    'Steps',
    '3. Third',
    '4. Fourth',
    '  - under four',
  ].join('\n'),
  true,
);
const PLAIN = note(
  'plain',
  360,
  160,
  '',
  'Shopping\n- milk\n- **eggs**\n  - indented\n# Head\n[label](https://x.org/a)',
  false,
);
const board = {
  id: 'into-docs',
  name: 'Into docs',
  cards: [RICH, PLAIN, doc('Rich doc', 40), doc('Plain doc', 140)],
  links: [],
  tray: [],
  view: { x: 160, y: 120, z: 1 },
};

const rec = (x: unknown): Record<string, unknown> =>
  x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x)) : {};
const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);

function inlineOf(x: unknown) {
  const n = rec(x);
  if (n.type === 'hardBreak') return '⏎';
  const marks = list(n.marks)
    .map(rec)
    .map(m => (m.type === 'link' ? `link ${String(rec(m.attrs).href)}` : String(m.type)))
    .sort();
  const text = String(n.text ?? '');
  return marks.length ? `{${marks.join('+')}:${text}}` : text;
}

// What a Doc holds, written compactly: p(…) a paragraph, ul/ol(…) a list, ol@3 one that starts at 3, li(…) an item,
// {bold:word} a word with its marks.
function outline(x: unknown): string {
  const n = rec(x),
    attrs = rec(n.attrs),
    inner = list(n.content).map(outline).join(' ');
  switch (n.type) {
    case 'doc':
      return inner;
    case 'paragraph':
      return `p(${list(n.content).map(inlineOf).join('')})`;
    case 'heading':
      return `h${String(attrs.level)}(${list(n.content).map(inlineOf).join('')})`;
    case 'orderedList':
      return `ol${attrs.start === 1 ? '' : `@${String(attrs.start)}`}(${inner})`;
    case 'bulletList':
      return `ul(${inner})`;
    case 'listItem':
      return `li(${inner})`;
    default:
      return `${String(n.type)}(${inner})`;
  }
}

const RICH_IN_A_DOC = [
  'p({bold:Trip})',
  'p(Plan for {bold:Friday} with {italic:care}, {underline:under} and {strike:old})',
  `p(Read {link ${GUIDE}:the }{bold+link ${GUIDE}:best}{link ${GUIDE}: guide} and [this](javascript:alert(1)))`,
  'ul(li(p(Fruit) ul(li(p(Apples) ul(li(p(Cox)))) li(p(Pears)))) li(p(Veg⏎greens too)))',
  'p(Steps)',
  'ol@3(li(p(Third)) li(p(Fourth) ul(li(p(under four)))))',
].join(' ');
// A plain note drops as it did before rich notes: one flat list, a heading, and a Markdown link left as typed.
const PLAIN_IN_A_DOC =
  'p(Shopping) ul(li(p(milk)) li(p({bold:eggs})) li(p(indented))) h1(Head) p([label](https://x.org/a))';

const l = await launch({ boards: [board], open: 'into-docs' });
const { page } = l;
const docJson = (id: string) =>
  page.evaluate(id => {
    const c = window.__fenmyr.board.cards.find(c => c.id === id);
    return c?.type === 'doc' ? c.doc : undefined;
  }, id);
const at = async (selector: string) => {
  const box = await page.locator(selector).first().boundingBox();
  assert(box, `${selector} is on screen`);
  return box;
};
async function drag(from: string, to: string, down = 0.5) {
  const a = await at(from),
    b = await at(to);
  await page.mouse.move(a.x + 8, a.y + 8);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height * down, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);
}

await drag('#cards [data-id="rich"]', '#cards [data-id="Rich doc"]');
assert.strictEqual(
  outline(await docJson('Rich doc')),
  `p(Notes) ${RICH_IN_A_DOC}`,
  'I-5: a rich note dropped on a Doc card arrives as bold, italic, underline, strike, a link, nested lists and a list starting at 3',
);

await drag('#cards [data-id="plain"]', '#cards [data-id="Plain doc"]');
assert.strictEqual(
  outline(await docJson('Plain doc')),
  `p(Notes) ${PLAIN_IN_A_DOC}`,
  'a plain note drops into a Doc as before',
);

await page.locator('#cards [data-id="Rich doc"]').dblclick();
await page.waitForSelector('.dv-prose', { timeout: 8000 });
await page.waitForTimeout(500);
const shown = await page.evaluate(() => {
  const prose = document.querySelector('.dv-prose'),
    words = (selector: string) => [...(prose?.querySelectorAll(selector) ?? [])].map(e => e.textContent);
  return {
    strong: words('strong'),
    em: words('em'),
    u: words('u'),
    s: words('s'),
    links: [...(prose?.querySelectorAll('a') ?? [])].map(a => [a.getAttribute('href'), a.textContent]),
    deepest: words('ul ul ul li'),
    starts: [...(prose?.querySelectorAll('ol') ?? [])].map(o => o.getAttribute('start')),
    markers: /\*\*|~~|<u>|\]\(https/.test(prose?.textContent ?? ''),
  };
});
assert.deepStrictEqual(
  shown,
  {
    strong: ['Trip', 'Friday', 'best'],
    em: ['care'],
    u: ['under'],
    s: ['old'],
    links: [[GUIDE, 'the best guide']],
    deepest: ['Cox'],
    starts: ['3'],
    markers: false,
  },
  'the open Doc draws the note as formatting, with no Markdown left in its words',
);

// The open editor keeps an empty last line after a list that ends the page. It isn't the note's.
const onPage = async () =>
  outline(await page.evaluate(() => window.__fenmyr.docEditor().getJSON())).replaceAll(' p()', '');
const before = await onPage();
// below the last line, so the copy lands at the end
await drag('#cards [data-id="rich"]', '.dv-page', 0.9);
assert.strictEqual(
  await onPage(),
  `${before} ${RICH_IN_A_DOC}`,
  'dropped on the open page, a rich note arrives with the same formatting',
);

assert.deepStrictEqual(l.errors, [], 'no page errors');
await l.close();
console.log('rich docs: ok');
