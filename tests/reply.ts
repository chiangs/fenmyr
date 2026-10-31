// A malformed reply from Myra loses only its bad fields.
import assert from 'node:assert';
import { parseReply } from '../src/shared/myraReply.ts';

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
console.log('REPLY OK');
