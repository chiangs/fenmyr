import type { ChatAction, ChatMsg } from '../../src/shared/chat.ts';
import type { Card } from '../../src/shared/model.ts';

// A prototype's chat after one build, kept as the build's block keeps it, for the visual check: built with a clean
// preview or one that logged errors, failed, or cut off by Fenmyr closing. The board names BUILD as its newest, so Undo
// this build, Commit and Fix the errors show. The snapshot is never put back, so any 40 hex characters do.
export const BUILD = 'vbuild1';
const SNAPSHOT = 'a'.repeat(40);
const T = Date.UTC(2026, 10, 2, 9, 30);
const REQUEST = 'Make the checkout form, with the total first.';

const note = (id: string, x: number, text: string): Card => ({ id, type: 'note', x, y: 40, w: 220, h: 120, text });
export const protoBuildCards: Card[] = [
  note('c1', 40, 'Checkout: show the total first'),
  note('c2', 300, 'Card number, expiry and CVC'),
  note('c3', 560, 'One button: Pay now'),
];

const askedFor = (): ChatMsg[] => [
  { who: 'me', text: REQUEST, t: T },
  { who: 'myra', text: 'Writing it now.', t: T + 1000 },
];
type End = Extract<ChatAction, { kind: 'build' }>['end'];
const block = (board: string, end?: End): ChatMsg => ({
  who: 'myra',
  text: '',
  t: T + 2000,
  acts: [
    {
      kind: 'build',
      board,
      build: BUILD,
      request: REQUEST,
      cards: 3,
      start: { at: T + 2000, snapshot: SNAPSHOT },
      ...(end ? { end } : {}),
    },
  ],
});
const undo = (board: string): ChatAction => ({ kind: 'buildUndo', board, snapshot: SNAPSHOT, build: BUILD });

type Check = Extract<NonNullable<End>, { kind: 'built' }>['check'];
const built = (board: string, check: Check): ChatMsg[] => [
  ...askedFor(),
  block(board, {
    kind: 'built',
    at: T + 50000,
    files: [
      { kind: 'text', path: 'src/App.tsx', added: 3, removed: 1 },
      { kind: 'text', path: 'src/Form.tsx', added: 24, removed: 0 },
    ],
    outside: [],
    from: ['c1'],
    check,
  }),
  {
    who: 'myra',
    text: 'I put the total at the top and added the card fields from your notes, with one Pay now button under them.',
    t: T + 50000,
    acts: [
      undo(board),
      { kind: 'commit', board, message: 'Make the checkout form, with the total first', build: BUILD },
      { kind: 'next', text: 'Add a coupon field' },
      { kind: 'next', text: 'Show a receipt' },
    ],
  },
];

export const builtChat = (board: string) => built(board, { kind: 'ran', count: 0, errors: [] });

export const errorsChat = (board: string) =>
  built(board, {
    kind: 'ran',
    count: 2,
    errors: [
      "TypeError: Cannot read properties of undefined (reading 'total') (line 12)",
      'Uncaught RangeError: Invalid currency code : £',
    ],
  });

export const failedChat = (board: string): ChatMsg[] => [
  ...askedFor(),
  block(board, { kind: 'failed', at: T + 14000, files: [{ kind: 'text', path: 'src/App.tsx', added: 5, removed: 2 }] }),
  {
    who: 'myra',
    text: 'I couldn’t finish that. Claude Code stopped before it finished.',
    t: T + 14000,
    acts: [undo(board)],
  },
];

export const stoppedChat = (board: string): ChatMsg[] => [...askedFor(), block(board)];
