import { type BuildRecord, buildHead, buildState, fileLines } from '../../shared/build.ts';
import { session } from '../core/state.ts';
import type { Button, Mark, Piece } from '../myra/acts.ts';
import { noteHeard } from '../myra/status.ts';
import { stoppedUndo } from './buildButtons.ts';
import { focusBlock } from './buildRecord.ts';
import { cancel, liveOf } from './buildSlot.ts';
import { sourceButton } from './sources.ts';

// A build's block in its prototype's chat, drawn from its record and, while it waits or runs here, how far it has got:
// the head, a moving bar while it runs, how many cards it read, a line per file, and the cards its code came from.
const MAX_FROM = 4;

const cardsRead = (n: number) => (n ? `Read ${n} ${n === 1 ? 'card' : 'cards'}` : 'No cards to read');

// A function declaration: VIEW in myra/acts.ts reads it while the modules of the import cycle load.
export function buildPieces(a: BuildRecord): Piece[] {
  const s = buildState(a, liveOf(a.build)),
    files = fileLines(s);
  // the first line is always there, so a block with no files yet still draws (a box with no lines draws nothing)
  const box = (lines: readonly string[], marks?: readonly Mark[], busy?: true): Piece => ({
    slot: 'summary',
    cls: 'build',
    head: buildHead(s, !!a.undone),
    lines: [cardsRead(a.cards), ...lines],
    ...(marks ? { marks: ['done', ...marks] } : {}),
    ...(busy ? { busy } : {}),
  });
  switch (s.phase) {
    case 'queued': {
      // nothing is stored for a cancel: a request that isn't waiting and never started reads not started
      const stop: Button = {
        label: 'Cancel',
        ghost: true,
        after: 'stay',
        // The chat draws the block again after the press, reading not started with no button, so focus stays on the
        // block, where Tab goes on to the next Cancel.
        run: () => {
          if (!cancel(a.build)) return;
          noteHeard(`${session.board?.name ?? 'This prototype'}’s build is cancelled`);
          focusBlock(a.build);
        },
      };
      return [box([a.request.split('\n')[0] ?? ''], ['wait']), { slot: 'other', button: stop }];
    }
    case 'starting':
      return [box([], [], true)];
    case 'writing':
      return [
        box(
          files,
          files.map((_, i) => (i === files.length - 1 ? 'now' : 'done')),
          true,
        ),
      ];
    case 'built': {
      const outside = s.end.outside.length
          ? [`Also changed outside this prototype: ${s.end.outside.join(', ')}. Undo this build won’t put that back.`]
          : [],
        marks = [...files.map((): Mark => 'done'), ...outside.map((): Mark => 'bad')];
      // a click on a card mustn't take the record with it
      const links = s.end.from.slice(0, MAX_FROM).flatMap((id): Button[] => {
        const b = sourceButton(id);
        return b ? [{ ...b, after: 'stay' }] : [];
      });
      const made: Piece[] = links.length ? [{ slot: 'sources', head: 'Made from', links }] : [];
      return [box([...files, ...outside], marks), ...made];
    }
    case 'failed':
      return [box(files)];
    case 'early':
    case 'unstarted':
      return [box([])];
    case 'stopped': {
      const undo = stoppedUndo(a),
        button: Piece[] = undo ? [{ slot: 'other', button: { ...undo, after: 'stay' } }] : [];
      return [box([]), ...button];
    }
    default: {
      const never: never = s;
      throw new Error(`unknown build state ${String(never)}`);
    }
  }
}
