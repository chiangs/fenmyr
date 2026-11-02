// The Mac's font list. The rest of the Mac build needs a Mac to check.
import assert from 'node:assert';
import { parseMacFonts } from '../src/host/macFonts.ts';

const sample = JSON.stringify({
  SPFontsDataType: [
    { typefaces: [{ family: 'Helvetica' }, { family: '.SF NS' }] },
    { typefaces: [{ family: 'Menlo' }] },
    { name: 'no typefaces' },
    'not a font',
  ],
});
assert.deepStrictEqual(parseMacFonts(sample), ['Helvetica', 'Menlo']);
assert.deepStrictEqual(parseMacFonts('not json'), []);
assert.deepStrictEqual(parseMacFonts('{}'), []);
console.log('MAC OK');
