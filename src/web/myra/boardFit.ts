import { type ContextUse, fitRanked, rankCards, roomOf, tokensOf } from '../../shared/contextFit.ts';
import { session } from '../core/state.ts';
import { brief, isLong, snapshot } from './snapshot.ts';

type Board = ReturnType<typeof snapshot>;
const sizeOf = (x: unknown) => JSON.stringify(x).length;

/** The board for a question, fitted to the model's `window`. It goes whole when it fits the room, then with every long
 *  card's words cut short, then with cards left out, the ones ranked lowest first, so a selected card is the last to go.
 *  `use` says what went: nothing, for a board that fitted. Three snapshots at most, and one measure of each card. */
export function fitBoard(selected: ReadonlySet<string>, window: number): { board: Board; use: ContextUse } {
  const room = roomOf(window);
  const used = (board: Board, left: string[], shortened: string[]): ContextUse => {
    const { recentChat, ...rest } = board;
    return {
      window,
      parts: [
        { kind: 'board', tokens: tokensOf(sizeOf(rest)), count: board.cards.length + board.unsorted.length },
        { kind: 'chat', tokens: tokensOf(sizeOf(recentChat)) },
      ],
      left,
      pictures: [],
      shortened,
      unseen: [],
      tooBig: [],
    };
  };

  const whole = snapshot(selected);
  if (tokensOf(sizeOf(whole)) <= room) return { board: whole, use: used(whole, [], []) };

  // what the snapshot sends is what it can be cut from: it leaves out a card the app can't read
  const sent = new Set([...whole.cards, ...whole.unsorted].map(c => c.id)),
    onBoard = session.board.cards.filter(c => sent.has(c.id)),
    tray = session.board.tray.filter(c => sent.has(c.id)),
    short = new Set([...onBoard, ...tray].filter(isLong).map(c => c.id)),
    cut = snapshot(selected, { short, drop: new Set() });
  if (tokensOf(sizeOf(cut)) <= room) return { board: cut, use: used(cut, [], [...short]) };

  // A card costs its shortened entry and a comma. The rest of the cut board, its links too, is what they share the room
  // with.
  const ranked = [...rankCards(onBoard, selected, session.board.links), ...tray],
    entries = ranked.map(c => ({ id: c.id, chars: sizeOf(brief(c, selected, true)) })),
    fixed = tokensOf(sizeOf(cut) - entries.reduce((n, e) => n + e.chars + 1, 0)),
    left = fitRanked(entries, room - fixed, e => tokensOf(e.chars) + 1).left.map(e => e.id),
    dropped = new Set(left),
    board = snapshot(selected, { short, drop: dropped }),
    cutStill = [...short].filter(id => !dropped.has(id));
  return { board, use: used(board, left, cutStill) };
}
