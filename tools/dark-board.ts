// The board tools/dark-sweep.ts opens: every card the app can make offline, a coloured copy of each, three due notes, a
// styled note, a line, a video, a screen with two pieces on it, and a chat with a line each way.
import { PIECES } from '../src/web/wireframe/pieces.ts';
import { everyOfflineCard } from '../tests/fixtures/boards.ts';

const local = (ms: number) => {
  const t = new Date(Date.now() + ms);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${two(t.getMonth() + 1)}-${two(t.getDate())}T${two(t.getHours())}:${two(t.getMinutes())}`;
};

export function sweepBoard() {
  const every = everyOfflineCard();
  // the same cards in a colour, since a rule for "every doc" or "every link" can matter only on a card that is not white
  const tinted = every.cards
    .filter(c =>
      ['note', 'todo', 'doc', 'link', 'audio', 'canvas', 'swatch', 'image', 'font', 'vnote'].includes(c.type),
    )
    .map((c, i) => ({ ...c, id: `${c.id}-sky`, color: 'sky', x: c.x + 1400, y: c.y + i * 4 }));
  const base = { ...every, cards: [...every.cards, ...tinted] };
  const dueNote = (id: string, x: number, due: string) => ({ ...base.cards[1], id, x, y: 900, due });
  const more = { r: 0, color: 'white' };
  const wf = {
    ...more,
    id: 'wf',
    type: 'frame',
    x: 2900,
    y: 0,
    w: 393,
    h: 852,
    device: 'iPhone',
    radius: 44,
    name: 'Sign in',
    fill: '#ffffff',
  };
  const piece = (id: string, name: string, x: number, y: number, w: number, o = {}) =>
    (PIECES[name]?.make(w, o) ?? []).map(({ x: ix, y: iy, ...it }, i) => ({
      ...more,
      ...it,
      id: `${id}${i}`,
      x: wf.x + x + ix,
      y: wf.y + y + iy,
      group: id,
      onFrame: wf.id,
    }));
  return {
    ...base,
    cards: [
      ...base.cards,
      // a note with every style on, for the bar's pressed buttons, a line, a recorded video with its words showing, and a
      // screen with two pieces on it
      {
        ...more,
        id: 'notefmt',
        type: 'note',
        x: 0,
        y: 1300,
        w: 200,
        h: 100,
        text: 'Styled',
        bold: true,
        italic: true,
        under: true,
        strike: true,
      },
      { ...more, id: 'line', type: 'shape', shape: 'line', x: 1000, y: 1300, w: 200, h: 60 },
      {
        ...more,
        id: 'video',
        type: 'video',
        x: 300,
        y: 1300,
        w: 360,
        h: 246,
        src: 'sweep.webm',
        dur: 12,
        text: 'What was said',
        txShown: true,
      },
      {
        ...more,
        id: 'lay',
        type: 'coll',
        x: 1000,
        y: 1700,
        w: 420,
        h: 260,
        text: 'Backlog',
        kanban: true,
        cols: 3,
        colNames: ['To do', 'Doing', 'Done'],
        colLimit: [0, 0, 0],
        colOf: { lay1: 0, lay2: 0 },
        kids: ['lay1', 'lay2'],
      },
      { ...more, id: 'lay1', type: 'note', x: 0, y: 0, w: 220, h: 140, text: 'Write the brief' },
      { ...more, id: 'lay2', type: 'note', x: 0, y: 0, w: 220, h: 140, text: 'Book the room' },
      wf,
      ...piece('wfh', 'Heading', 24, 96, 345, { text: 'Welcome back', sub: '' }),
      ...piece('wfi', 'Input', 24, 170, 345, { label: 'Email', text: 'you@example.com' }),
      dueNote('due-later', 0, local(40 * 864e5)),
      dueNote('due-soon', 260, local(36e5)),
      dueNote('due-over', 520, local(-864e5)),
    ],
    chat: [
      { who: 'me', text: 'What should this board show?', t: 1 },
      {
        who: 'myra',
        text: 'A first screen, I think.',
        t: 2,
        acts: [
          { kind: 'next', text: 'Find onboarding screens' },
          { kind: 'source', card: 'note' },
        ],
      },
    ],
  };
}

// done undoes what a scene set up by hand, once the sweep has read it
