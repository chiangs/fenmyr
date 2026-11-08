// A malformed reply from Myra loses only its bad fields.
import assert from 'node:assert';
import { parseReply, webPagesOf } from '../src/shared/myraReply.ts';

assert.deepStrictEqual(parseReply({ say: 'hi', add: [{ text: 'x' }], animate: 'hop' }), {
  say: 'hi',
  add: [{ text: 'x' }],
  animate: 'hop',
});
const bad = parseReply({ say: 42, add: 'not a list', move: [{ id: 'a' }] });
assert.strictEqual(bad.say, undefined);
assert.strictEqual(bad.add, undefined);
assert.deepStrictEqual(bad.move, [{ id: 'a' }]);
assert.deepStrictEqual(parseReply('words'), {});
assert.deepStrictEqual(parseReply({ openRepo: 'Acme', gitSetup: true }), { openRepo: 'Acme', gitSetup: true });
assert.strictEqual(parseReply({ newPrototype: { name: 'Sign up', stack: 'react' } }).newPrototype?.name, 'Sign up');
const wrong = parseReply({ openRepo: 7, gitSetup: 'yes' });
assert.ok(wrong.openRepo === undefined && wrong.gitSetup === undefined, 'repo buttons of the wrong kind are dropped');
const pages = parseReply({
  say: 'Read up.',
  pages: [
    { url: 'https://example.com/a', title: ' Planning ' },
    { url: 'javascript:alert(1)', title: 'Script' },
    'not a page',
    { url: 'https://example.com/a', title: 'Again' },
    { url: 'http://example.org/b' },
    { url: 7, title: 'No address' },
    { url: 'ftp://example.com/c', title: 'Not the web' },
  ],
});
assert.strictEqual(pages.say, 'Read up.', 'odd pages leave the rest of the reply alone');
assert.deepStrictEqual(
  webPagesOf(pages),
  [
    { url: 'https://example.com/a', title: 'Planning' },
    { url: 'http://example.org/b', title: 'example.org' },
  ],
  'only http and https pages, once each, named by their title or else their site',
);
assert.strictEqual(
  webPagesOf(parseReply({ pages: Array.from({ length: 9 }, (_, i) => ({ url: `https://e.com/${i}`, title: 'P' })) }))
    .length,
  6,
  'at most six',
);
assert.deepStrictEqual(webPagesOf(parseReply({ pages: 'https://e.com' })), [], 'pages that are not a list are dropped');
console.log('REPLY OK');
