// Myra's prototype offer as the app reads it. From her reply: a malformed offer drops alone and the rest of her answer
// stays, an offer needs a name and a build request, and the cards it is made from are the ones she names, else the
// selection the question went with. From the board file: a stored offer comes back as it was, and a bad one drops alone
// while its message and the other buttons stay.
import assert from 'node:assert';
import { readMsgs } from '../src/shared/chat.ts';
import { offerOf, parseReply } from '../src/shared/myraReply.ts';

const SEL = ['s1', 's2'];
const offer = (o: unknown) => offerOf(parseReply({ offerPrototype: o }), SEL);

const broken = parseReply({ say: 'Here.', add: [{ text: 'Kept' }], offerPrototype: 'a prototype please' });
assert.strictEqual(broken.say, 'Here.', 'a malformed offer leaves her words');
assert.strictEqual(broken.add?.[0]?.text, 'Kept', 'and the cards she adds');
assert.strictEqual(offerOf(broken, SEL), null, 'and no offer');
assert.strictEqual(offer({ name: 'Checkout' }), null, 'an offer needs a build request');
assert.strictEqual(offer({ build: 'Build it', name: '  ' }), null, 'and a name');

assert.deepStrictEqual(
  offer({
    name: ' Check\nout ',
    stack: 'vue',
    device: 'watch',
    purpose: 'Try a shorter checkout',
    project: 'Acme',
    from: ['n1', 'n1', 'n2'],
    build: ' Build the checkout ',
  }),
  {
    name: 'Check out',
    stack: 'react',
    purpose: 'Try a shorter checkout',
    project: 'Acme',
    from: ['n1', 'n2'],
    build: 'Build the checkout',
  },
  'React unless she says plain HTML, a device only when it is one, and each card she names once',
);
assert.deepStrictEqual(
  offer({ name: 'Diary', stack: 'html', device: 'phone', build: 'Build it' }),
  { name: 'Diary', stack: 'html', device: 'phone', from: SEL, build: 'Build it' },
  'made from the selection when she names no cards',
);
assert.deepStrictEqual(offer({ name: 'Diary', from: [], build: 'Build it' })?.from, [], 'or none when she says none');
assert.deepStrictEqual(
  offer({ name: 'Diary', from: 'n1', build: 'Build it' })?.from,
  SEL,
  'a list of cards of the wrong kind drops alone',
);
const long = offer({ name: 'Diary', build: 'x'.repeat(5000) })?.build ?? '';
assert.strictEqual(Array.from(long).length, 4000, 'a build request is clipped');
assert.ok(long.endsWith('…'), 'and says so');

const kept = offer({ name: 'Checkout', device: 'tablet', folder: 'Prototypes', from: ['n1'], build: 'Build it' });
assert.ok(kept);
const msgs = [
  {
    who: 'myra',
    text: 'That needs code.',
    t: 1,
    acts: [
      { kind: 'offer', board: 'one', offer: kept },
      { kind: 'offer', board: 'one', offer: { name: 'No build' } },
      { kind: 'offer', offer: kept },
      { kind: 'next', text: 'Make it a list' },
    ],
  },
];
assert.deepStrictEqual(
  readMsgs(JSON.parse(JSON.stringify(msgs))),
  [
    {
      ...msgs[0],
      acts: [
        { kind: 'offer', board: 'one', offer: kept },
        { kind: 'next', text: 'Make it a list' },
      ],
    },
  ],
  'a stored offer comes back as it was, and a bad one drops alone',
);
console.log('OFFER READ OK');
