import { type BuildEvent, readBuildEvent } from '../../shared/build.ts';
import type { Board, Card } from '../../shared/model.ts';
import { uid } from '../core/base.ts';
import { session } from '../core/state.ts';
import { changeBoard } from '../library/boardWrites.ts';
import { say } from '../myra/say.ts';
import { noteStatus, startJob } from '../myra/status.ts';
import { rootOf } from '../repo/codeFolder.ts';
import { refreshPanes } from './buildButtons.ts';
import { asked, ended, endedLost, redrawBlock, started } from './buildRecord.ts';
import { building, claimSlot, freeSlot, type Running, runningBuild } from './buildSlot.ts';
import { picturesOf } from './pictures.ts';
import { previewErrors } from './preview.ts';
import { beforeBuild } from './sync.ts';

// Myra's "build": the host writes the code with Claude Code while the build's block in its prototype's chat grows a
// line per file, then the block says how it went, her explanation follows, and the code, the preview and the git bar
// catch up.
type End = Extract<BuildEvent, { type: 'done' | 'error' }>;

const WAIT = 'I’m still writing the last change. I’ll start on this once it’s done.';

// what the builder reads from the board: the selected cards, or all of them, without positions or styling
const brief = (c: Card) =>
  Object.fromEntries(
    Object.entries(c).filter(
      ([k, v]) => !['x', 'y', 'w', 'h', 'r', 'rot', 'color'].includes(k) && v !== '' && v != null,
    ),
  );

// `cards`: the selection the request was sent with, or all of them when it was empty; null reads the selection now;
// `brought`: the cards a new prototype brought, and none when it brought none. `synced`: the repo was checked against
// GitHub just now (beforeBuild), so this is the go-ahead.
export async function startBuild(
  request: string,
  cards: readonly string[] | { brought: readonly string[] } | null,
  synced = false,
) {
  const b = session.board;
  const root = b ? rootOf(b) : null;
  if (b?.kind !== 'prototype' || !root) return;
  if (building()) return say(WAIT, 6000);
  if (!synced) return beforeBuild(b, request, () => startBuild(request, cards, true));
  // a note left by an earlier build would come back once this one ends
  noteStatus('');
  const sel = new Set(cards === null ? session.sel : 'brought' in cards ? cards.brought : cards),
    picked = b.cards.filter(c => sel.has(c.id));
  const chosen = (picked.length || (cards && 'brought' in cards) ? picked : b.cards).slice(0, 80);
  const r = claimSlot({
    build: uid(),
    board: b.id,
    name: b.name,
    request,
    cards: chosen.length,
    asked: Date.now(),
    id: null,
    start: null,
    was: undefined,
    files: [],
    job: startJob({ kind: 'building', board: b.id, name: b.name, file: null }),
  });
  void changeBoard(b.id, asked(r));
  const briefs = JSON.stringify(chosen.map(brief)),
    pictures = await picturesOf(chosen);
  const { dir, stack, purpose = '', device = '' } = b.proto;
  try {
    const started = await Fenmyr.protoBuild({
      root,
      dir,
      stack,
      request,
      purpose,
      device,
      cards: briefs,
      errors: previewErrors(),
      pictures,
      build: r.build,
      board: r.board,
    });
    // the host is still writing a build this window didn't start, as one left by an earlier window would be
    if (started.kind === 'busy') return turnedAway(r, WAIT);
    r.id = started.id;
  } catch (e) {
    turnedAway(r, e instanceof Error ? e.message : String(e));
  }
}

// A request the host turned away or failed on before it answered: its block reads "Couldn't start", and her line is
// `said` as it stands.
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
// name for a failure to write it.
function landOn(board: string, name: string, e: End, done: () => void, change: (b: Board) => boolean) {
  // the board's name as it lands, which stays null when the board was deleted
  let landed: string | null = null;
  void changeBoard(board, b => {
    if (!change(b)) return false;
    landed = b.name;
    return true;
  }).then(
    () => {
      done();
      if (session.board?.id === board) void refreshPanes();
      else if (landed !== null) noteStatus(e.type === 'done' ? `${landed} is built` : `${landed}’s build stopped`);
    },
    (err: unknown) => {
      done();
      console.error('A build’s result could not be written to its board', err);
      noteStatus(`Couldn’t save ${landed ?? name}’s build to its chat`);
    },
  );
}

// The host's protoBuild events, for the build that's running: its start, each file as Claude Code writes it, which
// grows its block where its board is open without writing the board, and how it ended. Of a build this window didn't
// start only the end is heard, on the record its board keeps.
export function buildEvent(data: unknown) {
  const e = readBuildEvent(data),
    r = runningBuild();
  if (!e) return;
  if (e.id !== r?.id) {
    if ((e.type === 'done' || e.type === 'error') && e.build && e.build !== r?.build)
      landOn(e.board, 'a prototype', e, () => {}, endedLost(e));
    return;
  }
  if (e.type === 'start') {
    r.start = { at: Date.now(), snapshot: e.snapshot };
    return void changeBoard(r.board, started(r));
  }
  if (e.type === 'edit') {
    if (!r.files.includes(e.file)) r.files.push(e.file);
    r.job.show({ kind: 'building', board: r.board, name: r.name, file: e.file.split('/').at(-1) ?? null });
    return redrawBlock(r.build);
  }
  land(r, e);
}
