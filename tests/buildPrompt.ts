// What the builder is told about the repo's design and rules and a prototype's own: its own words come after each of the
// repo's and win where they differ; with Ignore on, the repo's text is replaced by a line saying so and only the
// prototype's own is there; with none of its own, each says none and the repo's text is as it was.
import assert from 'node:assert';
import { buildPrototype } from '../src/host/prompts.ts';

const ask = {
  request: 'Add a total',
  stack: 'react' as const,
  purpose: '',
  device: 'phone',
  cards: '',
  errors: '',
  design: 'REPO DESIGN TEXT',
  myra: 'REPO RULES TEXT',
  boardDesign: '',
  boardRules: '',
  ignoreRepo: { rules: false, design: false },
  packages: '',
  pictures: '',
};
const DESIGN = 'DESIGN (prototypes/design.md, shared by every prototype in the repo):\n';
const OWN_DESIGN = "THIS PROTOTYPE'S OWN DESIGN (from its board; where it differs from DESIGN, this wins):\n";
const RULES = 'HOW TO WORK HERE (prototypes/myra.md):\n';
const OWN_RULES = "THIS PROTOTYPE'S OWN RULES (from its board; where they differ from HOW TO WORK HERE, these win):\n";
const NOT_DESIGN = 'not used for this prototype: its own design below takes its place';
const NOT_RULES = 'not used for this prototype: its own rules below take their place';

// the sections in the order the builder reads them, each with the words under its heading
const sections = (prompt: string) => {
  const at = [DESIGN, OWN_DESIGN, RULES, OWN_RULES].map(h => prompt.indexOf(h));
  assert(at.every(i => i >= 0) && at.every((i, n) => n === 0 || i > (at[n - 1] ?? 0)), 'the four headings, in order');
  const [d = 0, od = 0, r = 0, or = 0] = at;
  const under = (from: number, head: string, to: number) => prompt.slice(from + head.length, to).trim();
  return {
    design: under(d, DESIGN, od),
    ownDesign: under(od, OWN_DESIGN, r),
    rules: under(r, RULES, or),
    ownRules: prompt.slice(or + OWN_RULES.length).trim(),
  };
};

// the instruction names the prototype's own words as winning, wherever the prompt says what to follow
const WINS =
  "Follow DESIGN and HOW TO WORK HERE below wherever they say something, and this prototype's own design and rules after each: where they differ, this prototype's own win.";

// adding: the repo's text, then the board's after it
const adds = buildPrototype({ ...ask, boardDesign: 'BOARD DESIGN TEXT', boardRules: 'BOARD RULES TEXT' });
assert(adds.includes(WINS), 'the builder is told the prototype’s own words win');
assert.deepStrictEqual(
  sections(adds),
  {
    design: 'REPO DESIGN TEXT',
    ownDesign: 'BOARD DESIGN TEXT',
    rules: 'REPO RULES TEXT',
    ownRules: 'BOARD RULES TEXT',
  },
  'each document has the repo’s text and then the prototype’s own',
);

// Ignore on: the repo's text is not there, and a line says its own takes the place; each document has its own switch
const ignoring = buildPrototype({
  ...ask,
  design: '',
  myra: '',
  boardDesign: 'BOARD DESIGN TEXT',
  boardRules: 'BOARD RULES TEXT',
  ignoreRepo: { rules: true, design: true },
});
assert.deepStrictEqual(
  sections(ignoring),
  { design: NOT_DESIGN, ownDesign: 'BOARD DESIGN TEXT', rules: NOT_RULES, ownRules: 'BOARD RULES TEXT' },
  'the repo’s text is replaced by a line, and the prototype’s own stays',
);
assert(!ignoring.includes('REPO'), 'nothing of the repo’s text is in the prompt');
const rulesOnly = sections(
  buildPrototype({ ...ask, myra: '', boardRules: 'BOARD RULES TEXT', ignoreRepo: { rules: true, design: false } }),
);
assert.deepStrictEqual(
  [rulesOnly.design, rulesOnly.rules],
  ['REPO DESIGN TEXT', NOT_RULES],
  'ignoring the rules leaves the design as it was',
);
assert.equal(
  sections(buildPrototype({ ...ask, design: '', ignoreRepo: { rules: false, design: true } })).ownDesign,
  'none',
  'ignoring with nothing of its own says none',
);

// no words of its own at all: the repo's text as it was, and none under each of the prototype's own
assert.deepStrictEqual(
  sections(buildPrototype(ask)),
  { design: 'REPO DESIGN TEXT', ownDesign: 'none', rules: 'REPO RULES TEXT', ownRules: 'none' },
  'with nothing of its own, the repo’s text goes as it was and its own say none',
);
assert.deepStrictEqual(
  sections(buildPrototype({ ...ask, design: '', myra: '' })),
  { design: 'none yet', ownDesign: 'none', rules: 'nothing yet', ownRules: 'none' },
  'and a repo with no files still says so',
);

console.log('BUILD PROMPT OK');
