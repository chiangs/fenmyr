import type { Card } from '../../shared/model.ts';

/** What the empty chat knows about the board when it offers things to ask. */
export type StarterInput = {
  cards: readonly Card[];
  /** ideas waiting in Unsorted */
  unsorted: number;
  selected: number;
  prototype: boolean;
  mobbin: boolean;
  /** YYYY-MM-DD; a due date compares by its first 10 characters */
  today: string;
  /** YYYY-MM-DD a week from today */
  dueBy: string;
};

type Facts = {
  cards: number;
  looseNotes: number;
  openTasks: number;
  dueSoon: number;
  overdue: number;
  kanbans: number;
  docs: number;
  links: number;
  pictures: number;
  frames: number;
  selected: number;
  unsorted: number;
  mobbin: boolean;
};

type Starter = { when: (f: Facts) => boolean; text: (f: Facts) => string };

const DAY = /^\d{4}-\d{2}-\d{2}/;

function factsOf(input: StarterInput): Facts {
  const { cards } = input,
    inColl = new Set(cards.flatMap(c => (c.type === 'coll' ? c.kids : []))),
    count = (type: Card['type']) => cards.filter(c => c.type === type).length,
    // a checklist with every item ticked is finished, whatever its date says
    dues = cards.flatMap(c =>
      (c.type === 'note' || (c.type === 'todo' && !(c.items?.length && c.items.every(i => i.done)))) &&
      DAY.test(c.due ?? '')
        ? [(c.due ?? '').slice(0, 10)]
        : [],
    );
  return {
    cards: cards.length,
    looseNotes: cards.filter(c => c.type === 'note' && !inColl.has(c.id)).length,
    openTasks: cards.reduce((n, c) => n + (c.type === 'todo' ? (c.items ?? []).filter(i => !i.done).length : 0), 0),
    dueSoon: dues.filter(d => d <= input.dueBy).length,
    overdue: dues.filter(d => d < input.today).length,
    kanbans: cards.filter(c => c.type === 'coll' && c.kanban).length,
    docs: count('doc'),
    links: count('link'),
    pictures: count('image'),
    frames: count('frame'),
    selected: input.selected,
    unsorted: input.unsorted,
    mobbin: input.mobbin,
  };
}

const say = (text: string) => () => text;

// These are the person's words, sent as their question, in priority order.
const BOARD: readonly Starter[] = [
  { when: f => f.selected >= 3, text: f => `Group these ${f.selected} cards by theme` },
  { when: f => f.selected === 2, text: say('Compare these 2 cards') },
  { when: f => f.selected === 1, text: say('What could I add to this?') },
  { when: f => f.looseNotes >= 5 && f.selected < 2, text: f => `Group my ${f.looseNotes} notes by theme` },
  {
    when: f => f.unsorted >= 1,
    text: f =>
      f.unsorted === 1
        ? 'Find a place for the idea in Unsorted'
        : `Find places for the ${f.unsorted} ideas in Unsorted`,
  },
  { when: f => f.dueSoon >= 1, text: f => (f.overdue ? 'What’s due or overdue?' : 'What’s due this week?') },
  {
    when: f => f.kanbans >= 1,
    text: f => (f.kanbans === 1 ? 'What should move next on my kanban?' : 'What should move next on my kanbans?'),
  },
  { when: f => f.openTasks >= 3, text: f => `Which of my ${f.openTasks} open tasks comes first?` },
  { when: f => f.docs >= 1, text: f => (f.docs === 1 ? 'Sum up my doc' : `Sum up my ${f.docs} docs`) },
  { when: f => f.links >= 3, text: f => `Group my ${f.links} links by topic` },
  { when: f => f.pictures >= 3, text: say('Make a mood board from my pictures') },
  { when: f => f.frames >= 1, text: say('Wireframe the next screen') },
  { when: f => f.cards > 0 && f.cards < 3, text: say('What should I add next?') },
  { when: f => f.cards >= 3, text: say('What am I missing?') },
  { when: f => f.cards >= 3, text: say('Make a checklist from this board') },
  { when: f => f.cards === 0, text: say('Help me plan a project') },
  { when: f => f.cards === 0, text: say('Brainstorm ideas with me') },
  { when: f => f.cards === 0, text: say('Set up a kanban for this week') },
  { when: f => f.mobbin && (f.cards === 0 || f.frames >= 1), text: say('Find onboarding screens on Mobbin') },
];

// A prototype board starts from the wireframes and notes the person brings.
const PROTOTYPE: readonly Starter[] = [
  { when: f => f.selected === 1, text: say('Sum up what this card says') },
  { when: f => f.selected >= 2, text: say('Sum up what these cards say') },
  { when: f => f.cards >= 1 && f.selected === 0, text: say('Sum up what’s on the board') },
  { when: () => true, text: say('What should the first screen show?') },
  { when: f => f.frames >= 1, text: say('Build the first screen from my wireframes') },
  { when: f => f.cards >= 1, text: say('What am I missing?') },
  { when: f => f.mobbin, text: say('Find onboarding screens on Mobbin') },
];

/** Up to four things to ask, the first that apply to this board, never the same line twice. */
export function starters(input: StarterInput): string[] {
  const f = factsOf(input),
    lines = (input.prototype ? PROTOTYPE : BOARD).filter(s => s.when(f)).map(s => s.text(f));
  return [...new Set(lines)].slice(0, 4);
}
