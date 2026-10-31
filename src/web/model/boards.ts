// @ts-nocheck
import { sizeOf } from '../../shared/cardTypes.ts';
import { COLOR_NAMES, tilt, uid } from '../core/base.ts';
import { OS } from '../platform/osWords.ts';
// the find bar next to Myra

// ---------- boards ----------
export const TEMPLATES = {
  Moodboard: () => ({
    cards: [
      card('title', { x: 0, y: -40, text: 'Moodboard' }),
      card('note', { x: 0, y: 60, name: 'The feeling', text: 'Three words for how this should feel', color: 'butter' }),
      card('note', {
        x: 250,
        y: 60,
        name: 'Things I love',
        text: 'Drop images here, or paste them in ✦',
        color: 'pink',
      }),
      card('note', { x: 500, y: 60, name: 'Colours', text: 'Pull them straight from an image ✦', color: 'mint' }),
      card('swatch', { x: 0, y: 260, hex: '#f0b04a', label: 'cloudberry' }),
      card('swatch', { x: 130, y: 260, hex: '#7fb86a', label: 'moss' }),
      card('swatch', { x: 260, y: 260, hex: '#6fa3d6', label: 'fjord' }),
      card('todo', {
        x: 500,
        y: 240,
        text: 'Next',
        items: [
          { t: 'Find ten references', done: false },
          { t: 'Pick a pair of fonts', done: false },
          { t: 'Show someone', done: false },
        ],
      }),
      card('note', {
        x: 780,
        y: 60,
        w: 280,
        h: 230,
        r: 1.5,
        name: 'Myra’s how-to',
        text: 'Gather what feels right before you decide anything.\n\nDrop images in, pull colours from them, and write the feeling in three words. Then ask me to find what the pictures have in common.',
        color: 'white',
        myra: true,
      }),
    ],
    tray: [],
  }),
  'App plan': () => ({
    cards: [
      card('title', { x: 0, y: -40, text: 'App plan' }),
      card('note', {
        x: 0,
        y: 60,
        name: 'Who it’s for',
        text: 'The one kind of person you picture using it',
        color: 'sky',
      }),
      card('note', {
        x: 250,
        y: 60,
        name: 'The problem',
        text: 'What is hard for them right now, in their words?',
        color: 'pink',
      }),
      card('note', {
        x: 500,
        y: 60,
        name: 'The one thing',
        text: 'What it does better than anything else',
        color: 'butter',
      }),
      card('todo', {
        x: 0,
        y: 260,
        text: 'Screens',
        items: [
          { t: 'First open', done: false },
          { t: 'Home', done: false },
          { t: 'Settings', done: false },
        ],
      }),
      card('note', {
        x: 280,
        y: 260,
        name: 'Others like it',
        text: 'What they do well, and what they miss',
        color: 'lilac',
      }),
      card('note', {
        x: 780,
        y: 60,
        w: 280,
        h: 230,
        r: 1.5,
        name: 'Myra’s how-to',
        text: 'Start with the person, then the problem, then the one thing. Keep the screens list short: just the ones someone sees in their first minute.\n\nWhen it feels right, turn each screen into a wireframe.',
        color: 'white',
        myra: true,
      }),
    ],
    tray: [],
  }),
  'OKRs and opportunities': () => {
    // a vision, the objective under it, key results, then one result opened up into an opportunity solution tree
    const how =
      'Start at the top: one sentence for where this is all going.\n\nUnder it, this quarter’s objective and three key results you can measure. Then pick ONE key result and grow its tree: the opportunities you heard from people, a few solutions for each, and a small test to run first.\n\nDrag from a card’s edge to draw more lines. Ask me to fill it in for your product and I’ll swap my examples for yours.';
    const C = {},
      n = (key, o) => (C[key] = card('note', { w: 220, ...o }));
    const cards = [
      card('title', { x: 120, y: -40, text: 'Vision to opportunities' }),
      n('v', {
        x: 450,
        y: 60,
        w: 300,
        h: 150,
        name: 'Vision',
        text: 'Anyone who loves picking berries can find their way back to the good spots, every season.',
        color: 'sky',
      }),
      n('o', {
        x: 450,
        y: 260,
        w: 300,
        h: 130,
        name: 'Objective · this quarter',
        text: 'Make the first trip with Bog Notes feel effortless',
        color: 'butter',
      }),
      n('k1', {
        x: 240,
        y: 450,
        name: 'Key result 1',
        text: '70% of new people save a spot on their first trip',
        color: 'mint',
      }),
      n('k2', { x: 480, y: 450, name: 'Key result 2', text: '8 in 10 say the first trip was easy', color: 'mint' }),
      n('k3', {
        x: 720,
        y: 450,
        name: 'Key result 3',
        text: 'Fewer than 5% give up when the signal drops',
        color: 'mint',
      }),
      n('p1', {
        x: 110,
        y: 690,
        name: 'Opportunity',
        text: '“My hands are full, I forget to save the spot”',
        color: 'lilac',
      }),
      n('p2', {
        x: 350,
        y: 690,
        name: 'Opportunity',
        text: '“I can’t tell if a spot is worth saving”',
        color: 'lilac',
      }),
      n('s1', { x: 0, y: 900, name: 'Solution', text: 'Save with one tap, or a shake', color: 'peach' }),
      n('s2', {
        x: 240,
        y: 900,
        name: 'Solution',
        text: 'Save automatically where you stop for a while',
        color: 'peach',
      }),
      n('s3', { x: 480, y: 900, name: 'Solution', text: 'Rate the spot after you pick', color: 'peach' }),
      n('e1', { x: 0, y: 1110, name: 'Test first', text: 'Try auto-save with 5 pickers this weekend', color: 'pink' }),
      card('note', {
        x: 900,
        y: 60,
        w: 280,
        h: 390,
        r: 1.5,
        name: 'Myra’s how-to',
        text: how,
        color: 'white',
        myra: true,
      }),
    ];
    const links = [
      ['v', 'o'],
      ['o', 'k1'],
      ['o', 'k2'],
      ['o', 'k3'],
      ['k1', 'p1'],
      ['k1', 'p2'],
      ['p1', 's1'],
      ['p1', 's2'],
      ['p2', 's3'],
      ['s1', 'e1'],
    ].map(([x, y]) => ({ id: uid(), a: C[x].id, b: C[y].id, arrow: true }));
    return { cards, links, tray: [] };
  },
  'Product kickoff': () => {
    // the questions a team answers together before building anything; the starter prompts are meant to be written over
    const how =
      'Fill the boxes together, one note per thought. Write over my prompts with your own words.\n\nThe top two rows say why this exists and who it’s for. The middle row sets the edges: what’s in, what’s out, and what could go wrong. The bottom row is how you’ll start.\n\nWhen something is unclear, put it in Decisions needed and give it an owner. Ask me to tidy it up or draft a first version from a few sentences.';
    const note = (x, y, name, text, color, o = {}) => card('note', { x, y, w: 230, name, text, color, ...o });
    const coll = (x, y, name, color, texts) => {
      const kids = texts.map(t => card('note', { text: t, color, r: 0 }));
      return [card('coll', { x, y, text: name, color, kids: kids.map(k => k.id), cols: 1, r: 0 }), ...kids];
    };
    const todo = (x, y, text, items) => card('todo', { x, y, text, items: items.map(t => ({ t, done: false })) });
    const cards = [
      card('title', { x: 0, y: -40, text: 'Product kickoff' }),
      note(0, 60, 'Why now', 'What changed that makes this worth doing this quarter?', 'butter'),
      note(260, 60, 'The one-line pitch', 'For [who], who [need], [product] is a [what] that [benefit].', 'sky'),
      note(520, 60, 'What success looks like', 'In six months, what will be true that isn’t today?', 'mint'),
      note(0, 270, 'Who it’s for', 'The one kind of person this is really for.', 'lilac'),
      note(260, 270, 'The problem', 'In their words: what is hard or annoying right now?', 'pink'),
      note(520, 270, 'Goals', 'Three things we want, in order of importance.', 'mint'),
      note(780, 270, 'Not doing', 'What we are deliberately leaving out, and why.', 'peach'),
      ...coll(0, 500, 'In scope', 'mint', ['The smallest version that solves the problem']),
      ...coll(330, 500, 'Out of scope', 'pink', ['Everything we can add later']),
      ...coll(660, 500, 'Risks and open questions', 'butter', [
        'What could make this fail?',
        'What do we still not know?',
      ]),
      todo(0, 800, 'Decisions needed', ['Name the owner for each open question', 'Pick the date for the first review']),
      note(270, 800, 'Team and roles', 'Who does what, and who decides when we disagree?', 'white'),
      todo(540, 800, 'Milestones', ['First clickable version', 'First test with real people', 'Launch']),
      todo(810, 800, 'First tasks', ['Book the next meeting', 'Share this board with the team']),
      card('note', {
        x: 1090,
        y: 60,
        w: 280,
        h: 390,
        r: 1.5,
        name: 'Myra’s how-to',
        text: how,
        color: 'white',
        myra: true,
      }),
    ];
    return { cards, tray: [] };
  },
  // the first board: ideas ripening into a plan, with a few things to try. Short enough that nobody feels they must tidy it up.
  'My first board': () => {
    const n = (text, color, o = {}) => card('note', { text, color, ...o }),
      raw = [
        n('A map of my favourite bogs', 'butter', { r: 0 }),
        n('Which boots stay dry?', 'butter', { r: 0 }),
        n('Photos of the first ripe berries', 'butter', { r: 0 }),
      ],
      ripe = [n('Plan the first trip with Bog Notes', 'mint', { r: 0 })];
    const todo = n('Scout the east bog', 'butter', { r: 0 }),
      doing = n('Mark last year’s good spots', 'sky', { r: 0 }),
      done = n('Pack boots and a mosquito net', 'mint', { r: 0 });
    const coll = (x, y, text, color, kids) =>
      card('coll', { x, y, text, color, kids: kids.map(k => k.id), cols: 1, r: 0 });
    const kb = card('coll', {
      x: 300,
      y: 470,
      text: 'This week',
      color: 'white',
      kanban: true,
      kids: [todo.id, doing.id, done.id],
      colOf: { [todo.id]: 0, [doing.id]: 1, [done.id]: 2 },
      cols: 3,
      colNames: ['To do', 'Doing', 'Done'],
      colLimit: [0, 3, 0],
      r: 0,
    });
    return {
      cards: [
        card('title', { x: 0, y: -40, text: 'My first board' }),
        n(
          'Hi, I’m Myra! This is a board: a place for ideas to ripen. Drag a berry from Unsorted onto it when an idea has found its spot, then group the rest into a plan. Or ask me to do it with you.',
          'butter',
          { x: 0, y: 60, w: 260, h: 230, r: -1.5, name: 'Myra’s how-to', myra: true },
        ),
        coll(300, 60, 'Raw ideas', 'butter', raw),
        ...raw,
        coll(630, 60, 'Ripe', 'mint', ripe),
        ...ripe,
        card('stamp', { x: 905, y: 70, src: 'stamps/myra-love.png', mv: 'pulse', r: 6 }),
        n('Try me: open my chat and ask “Sort my unsorted ideas”.', 'sky', { x: 990, y: 60, name: 'Next', r: 1 }),
        n(
          'Try a template: the button next to the stamps has thinking tools, a Kanban and starter boards. Right-click anything to save your own.',
          'lilac',
          { x: 990, y: 240, name: 'Next', r: -1, h: 200 },
        ),
        kb,
        todo,
        doing,
        done,
      ],
      tray: [
        'call Sam about the east bog',
        'idea: berries by the season',
        'a name for the app?',
        'buy a bigger bucket',
        'plan the spring trip',
      ].map(t => card('note', { text: t })),
    };
  },
  'Brain dump': () => ({
    cards: [
      card('title', { x: 0, y: -40, text: 'Brain dump' }),
      card('note', {
        x: 0,
        y: 60,
        name: 'Myra’s how-to',
        text: `Empty your head into Unsorted with ${OS === 'mac' ? '⌘' : 'Ctrl+'}K: one thought each, no tidying.\n\nWhen you’re done, ask me to sort them into groups ✦`,
        color: 'butter',
        myra: true,
        w: 260,
        h: 170,
      }),
    ],
    tray: [
      'call the printer',
      'idea: a map of my favourite bogs',
      'that font from the cafe menu',
      'reply to Sam',
      'plan the spring trip',
    ].map(t => card('note', { text: t })),
  }),
};

export function card(type, o = {}) {
  const size = sizeOf(type);
  return Object.assign(
    { id: uid(), type, x: 0, y: 0, w: size[0], h: size[1], r: type === 'title' ? 0 : tilt(), color: 'white' },
    o,
  );
}

export function newBoard(name = 'Untitled board', tpl) {
  const b = {
    id: uid(),
    name,
    color: COLOR_NAMES[1 + Math.floor(Math.random() * 6)],
    cards: [],
    links: [],
    tray: [],
    view: { x: 160, y: 140, z: 1 },
  };
  if (tpl) {
    const t = TEMPLATES[tpl]();
    b.cards = t.cards;
    b.links = t.links || [];
    b.tray = t.tray;
    b.name = tpl;
  }
  return b;
}
