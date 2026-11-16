import { type BuildRecord, checkFailed, checkLine, type PreviewCheck } from '../../shared/build.ts';
import type { Board } from '../../shared/model.ts';
import { session } from '../core/state.ts';
import { changeBoard } from '../library/boardWrites.ts';
import type { Mark } from '../myra/acts.ts';
import { noteHeard } from '../myra/status.ts';
import { checked, recordOf, redrawBlock } from './buildRecord.ts';
import { previewCheck } from './preview.ts';

// Checking the preview after a build. One rule: once the open prototype's preview has rendered, its newest build, if
// it was built, isn't undone and hasn't been checked, is checked and the result kept on its record. That covers the
// refresh right after a build lands and a build that landed while another board was open, checked when its board opens.
// What is being checked lives only here, by build id, so a check cut off by closing is simply done again. coming: a build
// landing on the open board, whose check starts once the panes have begun to catch up with it.
type Checking = { kind: 'coming' } | { kind: 'running'; done: Promise<void> };
const checking = new Map<string, Checking>();

/** A build is landing on the open board: its block says it is being checked from the moment it lands, rather than not
 *  checked yet, until checkNewest starts its check or finds it isn't due. */
export function checkComing(build: string) {
  checking.set(build, { kind: 'coming' });
}

// it will be checked once its preview renders: only the newest build is, since the preview runs the newest code
const due = (b: Board, a: BuildRecord) =>
  b.kind === 'prototype' && b.proto.build === a.build && a.end?.kind === 'built' && !a.end.check && !a.undone;

/** The block's line for its preview check, from the record and whether a check runs now. A kept check shows whatever
 *  the build's state. Null for an unchecked build that won't be checked: one that was undone or isn't the newest. */
export function checkShown(a: BuildRecord): { line: string; mark: Mark } | null {
  const check = a.end?.kind === 'built' ? a.end.check : undefined;
  if (check) return { line: checkLine(check), mark: checkFailed(check) ? 'bad' : 'done' };
  if (checking.has(a.build)) return { line: 'Checking the preview', mark: 'now' };
  return session.board && due(session.board, a) ? { line: 'Preview not checked yet', mark: 'wait' } : null;
}

// what a screen reader hears once the open board's check is kept, as the block shows it
function heard(name: string, c: PreviewCheck) {
  if (c.kind === 'unbuilt') return `${name}’s preview couldn’t be built`;
  return c.count
    ? `${name}’s preview runs with ${c.count} ${c.count === 1 ? 'error' : 'errors'}`
    : `${name}’s preview runs with no errors`;
}

async function check(b: Board, build: string) {
  const c = await previewCheck(b.id);
  checking.delete(build);
  let kept = false;
  if (c)
    await changeBoard(b.id, x => {
      kept = checked(build, c)(x);
      return kept;
    });
  if (c && kept && session.board?.id === b.id) noteHeard(heard(b.name, c));
  // the block stops saying it is being checked
  else redrawBlock(build);
}

/** Checks the open prototype's newest build when it is due, and settles once the result is kept or let go. A build
 *  being checked already isn't checked twice. */
export function checkNewest(): Promise<void> {
  const b = session.board,
    a = b?.kind === 'prototype' && b.proto.build ? recordOf(b.proto.build) : null,
    next = b && a && due(b, a) ? a : null;
  for (const [build, c] of checking)
    if (c.kind === 'coming' && build !== next?.build) {
      checking.delete(build);
      redrawBlock(build);
    }
  if (!b || !next) return Promise.resolve();
  return start(b, next);
}

function start(b: Board, a: BuildRecord) {
  const now = checking.get(a.build);
  if (now?.kind === 'running') return now.done;
  const p = check(b, a.build).catch(e => {
    checking.delete(a.build);
    redrawBlock(a.build);
    console.error('The preview check failed', e);
  });
  checking.set(a.build, { kind: 'running', done: p });
  redrawBlock(a.build);
  return p;
}
