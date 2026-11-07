// What Myra's input says, for every case of the rules, in Node.
import assert from 'node:assert';
import { askHint, cutName } from '../src/web/myra/chatRules.ts';

assert.strictEqual(cutName('Myra'), 'Myra', 'a short name stays whole');
assert.strictEqual(cutName('Twelve-lette'), 'Twelve-lette', '12 letters stay whole');
assert.strictEqual(cutName('Bartholomew-Smithe'), 'Bartholomew…', 'past 12 letters: 11 and an ellipsis');
assert.strictEqual(cutName('🍓🍓🍓🍓🍓🍓🍓🍓🍓🍓🍓🍓🍓'), '🍓🍓🍓🍓🍓🍓🍓🍓🍓🍓🍓…', 'letters, not code units');

assert.strictEqual(askHint('Myra', 0, false), 'Ask Myra… “group these by theme”');
assert.strictEqual(askHint('Bartholomew-Smithe', 1, false), 'Ask Bartholomew… to change this…', 'one card');
assert.strictEqual(askHint('Pip', 3, false), 'Ask Pip to change these 3…', 'several cards');
assert.strictEqual(askHint('Pip', 0, true), 'Ask Pip about this prototype…', 'a prototype board');

console.log('CHAT RULES OK');
