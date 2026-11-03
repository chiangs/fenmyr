// ---------- design thinking templates: a ready-made layout with one or two examples, plus Myra's how-to note (delete it anytime) ----------
// items: title / note / coll (a collection with example notes) / how (Myra's note). keys + links draw arrows between items.
export type FrameworkNote = { text: string; color?: string };
type At = { x: number; y: number };
type FrameworkItem =
  | (At & { t: 'title'; text: string })
  | (At & { t: 'note'; text: string; name?: string; color?: string; key?: string })
  | (At & { t: 'how'; text: string })
  | (At & { t: 'coll'; name: string; color?: string; notes: FrameworkNote[] })
  | (At & {
      t: 'kanban';
      name: string;
      color?: string;
      cols: { name: string; limit?: number; notes?: FrameworkNote[] }[];
    });
type Framework = { emoji: string; name: string; line: string; items: FrameworkItem[]; links?: [string, string][] };

export const FRAMEWORKS: Record<string, Framework> = {
  affinity: {
    emoji: '🧩',
    name: 'Affinity map',
    line: 'Cluster notes into themes',
    items: [
      { t: 'title', x: 0, y: 0, text: 'Affinity map' },
      {
        t: 'coll',
        x: 0,
        y: 90,
        name: 'Raw notes',
        color: 'white',
        notes: [
          { text: '“I never know which bog has berries this week”' },
          { text: '“I lose signal halfway up the hill”' },
          { text: 'Skipped the tutorial, then got lost' },
          { text: '“I forget where my good spot was”' },
        ],
      },
      {
        t: 'coll',
        x: 330,
        y: 90,
        name: 'People can’t find their way back',
        color: 'pink',
        notes: [
          { text: '“I lose signal halfway up the hill”', color: 'pink' },
          { text: '“I forget where my good spot was”', color: 'pink' },
        ],
      },
      {
        t: 'coll',
        x: 660,
        y: 90,
        name: 'Name a theme',
        color: 'mint',
        notes: [{ text: 'Drag notes that feel alike in here', color: 'mint' }],
      },
      {
        t: 'how',
        x: 990,
        y: 90,
        text: 'Write one observation per note, in Raw notes. Then drag the ones that feel alike into a group.\n\nName each group as an insight, like “People can’t find their way back”, not just “Navigation”.\n\nStuck? Ask me to group them by theme.',
      },
    ],
  },
  opportunity: {
    emoji: '🌳',
    name: 'Opportunity map',
    line: 'Outcome → opportunities → solutions',
    items: [
      { t: 'title', x: 0, y: 0, text: 'Opportunity map' },
      {
        t: 'note',
        key: 'o',
        x: 330,
        y: 90,
        name: 'Outcome',
        text: 'More first trips end with a saved spot',
        color: 'sky',
      },
      {
        t: 'note',
        key: 'p1',
        x: 120,
        y: 300,
        name: 'Opportunity',
        text: '“My hands are full, I forget to save the spot”',
        color: 'butter',
      },
      {
        t: 'note',
        key: 'p2',
        x: 540,
        y: 300,
        name: 'Opportunity',
        text: '“I can’t tell if a spot is worth saving”',
        color: 'butter',
      },
      { t: 'note', key: 's1', x: 0, y: 510, name: 'Solution', text: 'Save with one tap, or a shake', color: 'mint' },
      {
        t: 'note',
        key: 's2',
        x: 240,
        y: 510,
        name: 'Solution',
        text: 'Save automatically where you stop for a while',
        color: 'mint',
      },
      { t: 'note', key: 's3', x: 540, y: 510, name: 'Solution', text: 'Rate the spot after you pick', color: 'mint' },
      {
        t: 'note',
        key: 'e1',
        x: 0,
        y: 720,
        name: 'Test',
        text: 'Try auto-save with 5 pickers this weekend',
        color: 'lilac',
      },
      {
        t: 'how',
        x: 900,
        y: 90,
        text: 'Start at the top with the outcome you want.\n\nUnder it, add opportunities: needs and pains you heard from real people, in their words.\n\nUnder each one, a few solutions, then a small test to try first.\n\nDrag from a card’s edge to draw the lines, so you always know why you’re building something.',
      },
    ],
    links: [
      ['o', 'p1'],
      ['o', 'p2'],
      ['p1', 's1'],
      ['p1', 's2'],
      ['p2', 's3'],
      ['s1', 'e1'],
    ],
  },
  matrix: {
    emoji: '⚖️',
    name: 'Impact / effort',
    line: 'Sort ideas into four boxes',
    items: [
      { t: 'title', x: 0, y: 0, text: 'Impact / effort' },
      {
        t: 'coll',
        x: 0,
        y: 90,
        name: '⚡ Quick wins',
        color: 'mint',
        notes: [{ text: 'A “save this spot” button', color: 'mint' }],
      },
      {
        t: 'coll',
        x: 330,
        y: 90,
        name: '🚀 Big bets',
        color: 'sky',
        notes: [{ text: 'Maps that work offline', color: 'sky' }],
      },
      {
        t: 'coll',
        x: 0,
        y: 360,
        name: '🧺 Fill-ins',
        color: 'butter',
        notes: [{ text: 'Berry stamps for the map', color: 'butter' }],
      },
      {
        t: 'coll',
        x: 330,
        y: 360,
        name: '💤 Skip for now',
        color: 'pink',
        notes: [{ text: 'Custom map themes', color: 'pink' }],
      },
      {
        t: 'how',
        x: 660,
        y: 90,
        text: 'Write every idea on its own note, then drop each one into a box.\n\nQuick wins: big impact, little effort. Big bets: big impact, lots of effort. Fill-ins: small and easy. Skip for now: small and hard.\n\nDo the quick wins first. Plan the big bets. Fill-ins are for slow days. Be honest about the last box.\n\nNot sure where one goes? Compare it to its neighbors, not to a perfect score.',
      },
    ],
  },
  empathy: {
    emoji: '💭',
    name: 'Empathy map',
    line: 'What they say, think, do and feel',
    items: [
      { t: 'title', x: 0, y: 0, text: 'Empathy map' },
      { t: 'note', x: 245, y: 90, name: 'Who', text: 'Liv, who picks cloudberries every August', color: 'lilac' },
      {
        t: 'coll',
        x: 0,
        y: 270,
        name: 'Says',
        color: 'sky',
        notes: [{ text: '“I just want to find my spot again”', color: 'sky' }],
      },
      {
        t: 'coll',
        x: 330,
        y: 270,
        name: 'Thinks',
        color: 'lilac',
        notes: [{ text: 'Will the berries still be there?', color: 'lilac' }],
      },
      {
        t: 'coll',
        x: 0,
        y: 520,
        name: 'Does',
        color: 'butter',
        notes: [{ text: 'Takes photos of trees as landmarks', color: 'butter' }],
      },
      {
        t: 'coll',
        x: 330,
        y: 520,
        name: 'Feels',
        color: 'pink',
        notes: [{ text: 'Anxious when the signal drops', color: 'pink' }],
      },
      {
        t: 'how',
        x: 660,
        y: 90,
        text: 'Pick one real person (or a clear type of person) and write who they are up top.\n\nFill each box from interviews and research, not guesses. Quotes go in Says.\n\nThe gold is where Says and Thinks don’t match. That gap is usually the real problem.',
      },
    ],
  },
  journey: {
    emoji: '🗺️',
    name: 'Journey map',
    line: 'Steps, feelings and pain points',
    items: [
      { t: 'title', x: 0, y: 0, text: 'Journey map' },
      {
        t: 'coll',
        x: 0,
        y: 90,
        name: '1 · Hears berries are ripe',
        color: 'sky',
        notes: [
          { text: 'A friend posts a full bucket', color: 'white' },
          { text: '😊 Excited', color: 'mint' },
        ],
      },
      {
        t: 'coll',
        x: 300,
        y: 90,
        name: '2 · Plans the trip',
        color: 'lilac',
        notes: [
          { text: 'Checks three forums', color: 'white' },
          { text: '😩 “Which bog is best?”', color: 'pink' },
        ],
      },
      {
        t: 'coll',
        x: 600,
        y: 90,
        name: '3 · On the bog',
        color: 'butter',
        notes: [{ text: 'Picks until the bucket is full', color: 'white' }],
      },
      {
        t: 'coll',
        x: 900,
        y: 90,
        name: '4 · Back home',
        color: 'mint',
        notes: [{ text: 'Wants to remember the spot', color: 'white' }],
      },
      {
        t: 'how',
        x: 1200,
        y: 90,
        text: 'One column per step, in order. In each, add what they do (Snow), how they feel (Moss = good, Lingonberry = rough) and what gets in the way.\n\nThe pink notes are your opportunities.\n\nRename the steps to fit your product.',
      },
    ],
  },
  hmw: {
    emoji: '💡',
    name: 'How might we',
    line: 'Turn problems into questions',
    items: [
      { t: 'title', x: 0, y: 0, text: 'How might we…' },
      {
        t: 'coll',
        x: 0,
        y: 90,
        name: 'Problems we heard',
        color: 'pink',
        notes: [{ text: 'People lose their good spots between seasons', color: 'pink' }],
      },
      {
        t: 'coll',
        x: 330,
        y: 90,
        name: 'How might we…',
        color: 'butter',
        notes: [
          { text: 'HMW help people remember a spot without stopping to pick up the phone?', color: 'butter' },
          { text: 'HMW make coming back next year feel easy?', color: 'butter' },
        ],
      },
      {
        t: 'how',
        x: 660,
        y: 90,
        text: 'Write each problem on its own note. Then flip it into a question that starts with “How might we…”.\n\nGood ones are wide enough to have many answers, but narrow enough to start on today.\n\nWrite a few versions of each, then vote with stamps.',
      },
    ],
  },
  kanban: {
    emoji: '🗂️',
    name: 'Kanban',
    line: 'Cards move from to do to done',
    items: [
      {
        t: 'kanban',
        x: 0,
        y: 0,
        name: 'Berry season',
        color: 'white',
        cols: [
          {
            name: 'To do',
            notes: [
              { text: 'Scout the east bog', color: 'butter' },
              { text: 'Buy a second bucket', color: 'white' },
            ],
          },
          { name: 'Doing', limit: 3, notes: [{ text: 'Mark last year’s good spots', color: 'sky' }] },
          { name: 'Done', notes: [{ text: 'Pack boots and mosquito net', color: 'mint' }] },
        ],
      },
      {
        t: 'how',
        x: 880,
        y: 0,
        text: 'Each column is a step. Drag a card from one to the next as it moves along.\n\nRight-click a column name to rename it, move it, add a column, or set a limit. Drop a card just to the right of the last column to add another.\n\nKeep “Doing” short: a limit stops it filling up.',
      },
    ],
  },
  retro: {
    emoji: '🔁',
    name: 'Start, stop, continue',
    line: 'A quick, kind retro',
    items: [
      { t: 'title', x: 0, y: 0, text: 'Start, stop, continue' },
      {
        t: 'coll',
        x: 0,
        y: 90,
        name: '🌱 Start · what to try',
        color: 'mint',
        notes: [{ text: 'Share the research earlier', color: 'mint' }],
      },
      {
        t: 'coll',
        x: 330,
        y: 90,
        name: '✋ Stop · what to drop',
        color: 'peach',
        notes: [{ text: 'Rushed handoffs to engineering', color: 'peach' }],
      },
      {
        t: 'coll',
        x: 660,
        y: 90,
        name: '🫐 Continue · what’s working',
        color: 'pink',
        notes: [{ text: 'Testing every Friday kept us honest', color: 'pink' }],
      },
      {
        t: 'how',
        x: 990,
        y: 90,
        text: 'Everyone writes quietly for 5 minutes: one note per thought.\n\nStart is something new to try, stop is something to let go of, continue is something worth keeping.\n\nThen read them out, group the alike ones, and pick one thing to start next.',
      },
    ],
  },
};
