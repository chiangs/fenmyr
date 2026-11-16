import { type BuildEvent, readBuildEvent } from '../../shared/build.ts';
import type { Board, Card } from '../../shared/model.ts';
import { uid } from '../core/base.ts';
import { appState, session } from '../core/state.ts';
import { changeBoard } from '../library/boardWrites.ts';
import { noteHeard, noteStatus, startJob } from '../myra/status.ts';
import { rootOf } from '../repo/codeFolder.ts';
import { refreshPanes } from './buildButtons.ts';
import { checkComing, checkNewest } from './buildCheck.ts';
import { asked, ended, endedLost, redrawBlock, redrawNewest, started } from './buildRecord.ts';
import {
  building,
  catchUp,
  caughtUp,
  claimSlot,
  dequeue,
  enqueue,
  freeSlot,
  type Running,
  runningBuild,
  type Waiting,
} from './buildSlot.ts';
import { picturesOf } from './pictures.ts';
import { previewErrors } from './preview.ts';
import { beforeBuild } from './sync.ts';

// Myra's "build": a request waits its turn behind any build running or waiting, then the host writes the code with
// Claude Code while the build's block in its prototype's chat grows a line per file, then the block says how it went,
// her explanation follows, and the code, the preview and the git bar catch up.
type End = Extract<BuildEvent, { type: 'done' | 'error' }>;

// what the builder reads from the board: the selected cards, or all of them, without positions or styling
const brief = (c: Card) =>
  Object.fromEntries(
    Object.entries(c).filter(
      ([k, v]) => !['x', 'y', 'w', 'h', 'r', 'rot', 'color'].includes(k) && v !== '' && v != null,
    ),
  );

// `cards`: the selection the request was sent with, or all of them when it was empty; null reads the selection now;
// `brought`: the cards a new prototype brought, and none when it brought none. `synced`: the repo was checked against
// GitHub just now (beforeBuild), so this is the go-ahead. The request waits its turn, so what its build needs from the
// board is read now.
export async function startBuild(
  request: string,
  cards: readonly string[] | { brought: readonly string[] } | null,
  synced = false,
) {
  const b = session.board;
  const root = b ? rootOf(b) : null;
  if (b?.kind !== 'prototype' || !root) return;
  // pulling under a build that runs or waits would change its files
  if (!synced && !building()) return beforeBuild(b, request, () => startBuild(request, cards, true));
  const sel = new Set(cards === null ? session.sel : 'brought' in cards ? cards.brought : cards),
    picked = b.cards.filter(c => sel.has(c.id));
  const chosen = (picked.length || (cards && 'brought' in cards) ? picked : b.cards).slice(0, 80);
  const { dir, stack, purpose = '', device = '' } = b.proto,
    build = uid(),
    briefs = JSON.stringify(chosen.map(brief));
  const w: Waiting = {
    build,
    board: b.id,
    root,
    request,
    cards: chosen.length,
    args: { root, dir, stack, request, purpose, device, cards: briefs, build, board: b.id },
    pictures: picturesOf(chosen),
    waited: building(),
  };
  if (w.waited) noteHeard(waitsWords(b.name));
  enqueue(w);
  void changeBoard(b.id, asked(w));
  void pump();
}

// what a screen reader hears as a request waits its turn, the block showing it as waiting
const waitsWords = (name: string) => `${name}’s build waits its turn`;

// the board as it is now, or null once it has been deleted
const boardNow = (id: string) =>
  session.board?.id === id ? session.board : (appState.boardList.find(x => x.id === id) ?? null);

// The oldest waiting request whose board is still there, with the board's name as it is now. One whose board has gone
// has nothing to build for, and its build would leave files in the repo the other prototypes share.
function nextWaiting() {
  for (let w = dequeue(); w; w = dequeue()) {
    const b = boardNow(w.board);
    if (b) return { w, name: b.name };
  }
  return null;
}

// One build at a time across the app: the oldest waiting request starts once none runs and the open board's preview
// has caught up with the last one, whichever board is open.
async function pump() {
  await caughtUp();
  if (runningBuild()) return;
  const next = nextWaiting();
  if (!next) return;
  const { w, name } = next;
  // A note that the build before ended keeps the line over a build that starts by itself, whose line follows once the
  // note has had its time, but not over one just asked for, which is the news now.
  if (!w.waited) noteStatus('');
  const r = claimSlot({
    build: w.build,
    board: w.board,
    name,
    root: w.root,
    request: w.request,
    cards: w.cards,
    asked: Date.now(),
    id: null,
    start: null,
    was: undefined,
    files: [],
    job: startJob({ kind: 'building', board: w.board, name, file: null }),
  });
  if (w.waited) noteHeard(`${name}’s build has started`);
  try {
    redrawNewest(r);
    // the preview belongs to the open board
    const errors = session.board?.id === w.board ? previewErrors() : '';
    const started = await Fenmyr.protoBuild({ ...w.args, errors, pictures: await w.pictures });
    if (started.kind === 'started') {
      r.id = started.id;
      return;
    }
    // The host is still writing a build this window didn't start, as one left by an earlier window would be, so this
    // waits again, first in line, until that build's end is heard.
    freeSlot(r);
    r.job.end();
    enqueue({ ...w, waited: true }, true);
    noteHeard(waitsWords(name));
    redrawNewest(r);
  } catch (e) {
    turnedAway(r, e instanceof Error ? e.message : String(e));
  }
}

// A request the host failed on before it answered: its block reads "Couldn't start", and her line is `said` as it
// stands.
const turnedAway = (r: Running, said: string) =>
  land(r, { id: '', build: r.build, board: r.board, type: 'error', text: said, snapshot: null, files: [] }, said);

// How it ended lands in the build's own prototype whichever board is open, and the status line says it's building
// until then.
function land(r: Running, e: End, said?: string) {
  const done = () => {
    freeSlot(r);
    r.job.end();
  };
  landOn(r.board, r.name, e, done, b => {
    // the block is drawn from its record from here on
    freeSlot(r);
    return ended(r, e, Date.now(), said)(b);
  });
}

// Another board only hears how it ended, on the status line, by the board's name as it is then. name: the board's
// name for a failure to write it. The next build waits until the open board's preview shows this one's code and has
// been checked, so it is sent all the errors that code logged and not the code's before.
function landOn(board: string, name: string, e: End, done: () => void, change: (b: Board) => boolean) {
  // the board's name as it lands, which stays null when the board was deleted
  let landed: string | null = null;
  catchUp(
    changeBoard(board, b => {
      // a build that changed files is the newest, so it is checked as soon as the preview catches up
      if (b === session.board && e.type === 'done' && e.files.length) checkComing(e.build);
      if (!change(b)) return false;
      landed = b.name;
      return true;
    }).then(
      () => {
        done();
        const open = session.board?.id === board,
          words = e.type === 'done' ? `${landed} is built` : `${landed}’s build stopped`;
        // the open board shows no note, since its block says how it went, but a screen reader hears it
        if (landed !== null) (open ? noteHeard : noteStatus)(words);
        // even when the panes fail to catch up, so the block doesn't go on saying it is being checked
        return open ? refreshPanes().finally(checkNewest) : undefined;
      },
      (err: unknown) => {
        done();
        console.error('A build’s result could not be written to its board', err);
        noteStatus(`Couldn’t save ${landed ?? name}’s build to its chat`);
        if (session.board?.id === board) void checkNewest();
      },
    ),
  );
  void pump();
}

// The host's protoBuild events, for the build that's running: its start, each file as Claude Code writes it, which
// grows its block where its board is open without writing the board, and how it ended. Of a build this window didn't
// start only the end is heard, on the record its board keeps.
export function buildEvent(data: unknown) {
  const e = readBuildEvent(data),
    r = runningBuild();
  if (!e) return;
  if (e.id !== r?.id) {
    if (e.type !== 'done' && e.type !== 'error') return;
    // the host has let go of the repo, so a request it turned away can start, once this end has landed
    if (e.build && e.build !== r?.build) return landOn(e.board, 'a prototype', e, () => {}, endedLost(e));
    return void pump();
  }
  if (e.type === 'start') {
    r.start = { at: Date.now(), snapshot: e.snapshot };
    return void changeBoard(r.board, b => {
      // the status line names the board as it is called now, renamed while closed or not
      r.name = b.name;
      r.job.show({ kind: 'building', board: r.board, name: b.name, file: null });
      return started(r)(b);
    });
  }
  if (e.type === 'edit') {
    if (!r.files.includes(e.file)) r.files.push(e.file);
    r.job.show({ kind: 'building', board: r.board, name: r.name, file: e.file.split('/').at(-1) ?? null });
    return redrawBlock(r.build);
  }
  land(r, e);
}
