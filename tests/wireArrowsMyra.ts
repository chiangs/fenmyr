// Myra and a wire's arrow. Her snapshot says which end of each wire has an arrowhead, and keeps a wire with none a pair,
// as it cost her less of her window. Her connect takes the same: an arrow of end or both, and any other value she makes
// up is dropped without losing the wire. The prompt tells her how to read and how to write one.
import assert from 'node:assert';
import { parseReply } from '../src/shared/myraReply.ts';
import { askStandIn } from './support/askStandIn.ts';
import { launch } from './support/launch.ts';
import { still } from './support/settled.ts';
import { check, wireKit } from './support/wireKit.ts';
import { rec } from './support/zipKit.ts';

await check('her reply’s connect takes an arrow of end or both, and drops any other value, keeping the wire', () => {
  const { connect = [] } = parseReply({
    connect: [
      ['a', 'b'],
      { a: 'a', b: 'b', arrow: 'both' },
      { a: 'a', b: 'b', arrow: 'end' },
      { a: 'a', b: 'b', arrow: 'sideways' },
      { a: 'a', b: 'b', arrow: 2 },
      { a: 'a', b: 'b' },
    ],
  });
  assert.deepStrictEqual(
    connect.map(c => (Array.isArray(c) ? 'pair' : (c.arrow ?? 'none'))),
    ['pair', 'both', 'end', 'none', 'none', 'none'],
    'the pair is a pair, both and end are kept, and the rest has none',
  );
});

const note = (id: string, x: number) => ({
  id,
  type: 'note',
  x,
  y: 0,
  w: 200,
  h: 100,
  r: 0,
  text: id,
  color: 'butter',
});
const myra = {
  id: 'myra',
  name: 'Myra',
  cards: ['P', 'Q', 'R', 'S'].map((id, i) => note(id, i * 260)),
  links: [
    { id: 'm1', a: 'P', b: 'Q' },
    { id: 'm2', a: 'Q', b: 'R', arrow: true },
    { id: 'm3', a: 'R', b: 'S', arrow: 'both' },
    { id: 'm4', a: 'S', b: 'P', arrow: false },
  ],
  tray: [],
  view: { x: 300, y: 250, z: 1 },
};
const l = await launch({ boards: [myra], open: 'myra', claude: true });
const { page } = l;
const { sentFor, send, reply } = askStandIn(l);
const { links, ids, heads } = wireKit(page);

const asked = async (q: string) => {
  await send(q);
  const { prompt } = await sentFor(q);
  const line = prompt.split('\n').find(s => s.startsWith('{"today"'));
  assert(line, 'the prompt holds the board');
  const sent: unknown = JSON.parse(line);
  return { prompt, links: rec(sent).links };
};

await check('Myra’s snapshot says which end of a wire has an arrowhead, and keeps a plain wire a pair', async () => {
  await page.click('#mPill');
  await page.waitForFunction(() => document.getElementById('mChat')?.checkVisibility({ visibilityProperty: true }));
  await still(page);
  const sent = await asked('what do the wires say?');
  assert.deepStrictEqual(
    sent.links,
    [['P', 'Q'], { a: 'Q', b: 'R', arrow: 'end' }, { a: 'R', b: 'S', arrow: 'both' }, ['S', 'P']],
    'a wire with no arrow, or false, is a pair; one with an arrow says end, and one with two says both',
  );
  assert.match(
    sent.prompt,
    /"arrow": "end \(an arrowhead at b\) or both \(at a and b\)/,
    'she is told how to write one',
  );
  assert.match(
    sent.prompt,
    /"links" are the wires between cards: a pair \[a, b\] has no arrowhead/,
    'and how to read one',
  );
});

await check('her connect makes wires of the end, of both and of none, and drops a value she made up', async () => {
  reply({
    say: 'Joined.',
    connect: [
      { a: 'P', b: 'R', arrow: 'both' },
      { a: 'Q', b: 'S', arrow: 'end' },
      { a: 'P', b: 'S', arrow: 'sideways' },
      ['Q', 'P'],
      { a: 'P', b: 'nobody', arrow: 'both' },
    ],
  });
  const had = await ids();
  await page.evaluate(() => window.__fenmyr.ask('join them'));
  await still(page);
  const made = (await links()).filter(x => !had.has(x.id));
  assert.deepStrictEqual(
    made.map(x => [x.a, x.b, x.arrow]),
    [
      ['P', 'R', 'both'],
      ['Q', 'S', true],
      ['P', 'S', undefined],
      ['Q', 'P', undefined],
    ],
    'both and end are kept, a made-up value and a pair have none, and a card that is not there makes no wire',
  );
  const [first] = made;
  assert(first, 'the wire of both is there');
  assert.deepStrictEqual(await heads(first.id), ['start', 'end'], 'and is drawn with two heads');
});

assert.deepStrictEqual(l.errors, [], 'the page raised no errors');
await l.close();
console.log('WIRE ARROWS MYRA OK');
