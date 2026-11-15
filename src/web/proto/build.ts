import { type BuildEvent, readBuildEvent } from '../../shared/build.ts';
import type { ChatAction, ChatMsg } from '../../shared/chat.ts';
import type { Board, Card } from '../../shared/model.ts';
import { uid } from '../core/base.ts';
import { save } from '../core/history.ts';
import { appState, session } from '../core/state.ts';
import { changeBoard } from '../library/boardWrites.ts';
import { chatLog, pushMsg, renderChat } from '../myra/chatLog.ts';
import { type SayAction, say } from '../myra/say.ts';
import { type Job, noteStatus, startJob } from '../myra/status.ts';
import { rootOf } from '../repo/codeFolder.ts';
import { renderCode } from './code.ts';
import { askCommit } from './gitActions.ts';
import { renderGitBar } from './gitbar.ts';
import { picturesOf } from './pictures.ts';
import { previewErrors, renderPreview } from './preview.ts';
import { cardButtons, cardsLine, keepSources } from './sources.ts';
import { beforeBuild } from './sync.ts';

// Myra's "build": the host writes the code with Claude Code while the status line shows what's being written, then her
// explanation lands in the prototype's own chat with Undo this build, and the code, the preview and the git bar catch up.
type Prototype = Extract<Board, { kind: 'prototype' }>;
// board and name: the prototype it builds, which may not be the open board by the time it ends
type Running = { id: string; build: string; board: string; name: string; request: string; job: Job };
// 'starting' from the moment a build is asked for until the host answers, so one asked for meanwhile waits
let running: Running | 'starting' | null = null;

const WAIT = 'I’m still writing the last change. I’ll start on this once it’s done.';

// a build is being written, so one asked for now wouldn't start
export const building = () => running !== null;

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
  if (running) return say(WAIT, 6000);
  if (!synced) return beforeBuild(b, request, () => startBuild(request, cards, true));
  running = 'starting';
  // kept before anything is awaited, while this prototype is surely the open board
  const build = uid(),
    was = b.proto.build;
  b.proto = { ...b.proto, build };
  save();
  const sel = new Set(cards === null ? session.sel : 'brought' in cards ? cards.brought : cards),
    picked = b.cards.filter(c => sel.has(c.id));
  const chosen = (picked.length || (cards && 'brought' in cards) ? picked : b.cards).slice(0, 80),
    briefs = JSON.stringify(chosen.map(brief)),
    pictures = await picturesOf(chosen);
  const { dir, stack, purpose = '', device = '' } = b.proto;
  const job = startJob({ kind: 'building', board: b.id, name: b.name, file: null });
  const back = () => {
    running = null;
    job.end();
    // a build that never started isn't the board's newest, so the last one keeps its Undo
    b.proto = { ...b.proto, build: was };
    save();
  };
  try {
    const r = await Fenmyr.protoBuild({
      root,
      dir,
      stack,
      request,
      purpose,
      device,
      cards: briefs,
      errors: previewErrors(),
      pictures,
    });
    if (r.kind === 'busy') {
      back();
      return say(WAIT, 6000);
    }
    running = { id: r.id, build, board: b.id, name: b.name, request, job };
  } catch (e) {
    back();
    say(e instanceof Error ? e.message : String(e), 8000);
  }
}

async function refresh() {
  if (session.board?.kind !== 'prototype') return;
  await Promise.all([renderCode(session.board), renderGitBar(session.board), renderPreview(session.board)]);
}

async function undo(root: string, dir: string, snapshot: string) {
  await Fenmyr.protoUndo({ root, dir, snapshot });
  await refresh();
  say('It’s back to how it was before that build ✦', 5000);
}

const openProto = (board: string) => {
  const b = session.board;
  return b?.id === board && b.kind === 'prototype' ? b : null;
};

type BuildUndo = Extract<ChatAction, { kind: 'buildUndo' }>;
const newestUndo = (board: string) =>
  chatLog()
    .flatMap(m => m.acts ?? [])
    .findLast((a): a is BuildUndo => a.kind === 'buildUndo' && a.board === board);

// A board from before builds were named goes by the newest Undo in its chat.
const isLatest = (b: Prototype, a: BuildUndo) =>
  b.proto.build ? a.build === b.proto.build : newestUndo(a.board)?.snapshot === a.snapshot;

export function buildUndoButton(a: BuildUndo): SayAction | null {
  const b = openProto(a.board),
    root = b && rootOf(b);
  if (!b || !root || !isLatest(b, a)) return null;
  return { label: 'Undo this build', ghost: true, run: () => undo(root, b.proto.dir, a.snapshot) };
}

export function commitButton(a: Extract<ChatAction, { kind: 'commit' }>): SayAction | null {
  const b = openProto(a.board);
  return b && { label: 'Commit', cls: 'next', run: () => askCommit(b, a.message) };
}

const line = (text: string, acts: ChatAction[] = []): ChatMsg =>
  acts.length ? { who: 'myra', text, t: Date.now(), acts } : { who: 'myra', text, t: Date.now() };

// Her lines for how a build ended, added to its prototype's chat with buttons that are kept, so they work whenever
// that prototype is open. A failed build that changed files can be undone too.
function landEnd(b: Prototype, e: Extract<BuildEvent, { type: 'done' | 'error' }>, build: string, request: string) {
  const board = b.id;
  if (e.type === 'error') {
    const undo: ChatAction[] =
      e.snapshot && e.files.length ? [{ kind: 'buildUndo', board, snapshot: e.snapshot, build }] : [];
    return pushMsg(b, line(`I couldn’t finish that. ${e.text}`, undo));
  }
  // the commit message she suggests: the first line of what she was asked to do
  const message = request.split(/[\n.]/)[0]?.trim().slice(0, 72) ?? '';
  pushMsg(
    b,
    line(e.text, [
      { kind: 'commit', board, message },
      { kind: 'buildUndo', board, snapshot: e.snapshot, build },
    ]),
  );
  const used = keepSources(b, e.sources);
  if (used.length) pushMsg(b, line(cardsLine(b, used), cardButtons(b, used)));
  if (e.outside.length)
    pushMsg(
      b,
      line(
        `I also changed files outside this prototype: ${e.outside.join(', ')}. Undo this build only puts this prototype back, so check those in the git bar.`,
      ),
    );
}

// The host's protoBuild events, for the build that's running; its end repeats the snapshot its start carries, so the
// start changes nothing here. The end lands in the build's own prototype whichever board is open, and another board
// only hears of it on the status line.
export function buildEvent(data: unknown) {
  const e = readBuildEvent(data);
  if (!running || running === 'starting' || e?.id !== running.id || e.type === 'start') return;
  const { build, board, name, request, job } = running;
  if (e.type === 'edit') return job.show({ kind: 'building', board, name, file: e.file.split('/').at(-1) ?? null });
  running = null;
  job.end();
  if (session.board?.id !== board) noteStatus(e.type === 'done' ? `${name} is built` : `${name}’s build stopped`);
  void changeBoard(board, b => {
    if (b.kind !== 'prototype') return false;
    landEnd(b, e, build, request);
    return true;
  }).then(() => {
    if (session.board?.id !== board) return;
    appState.histOpen = false;
    renderChat();
    void refresh();
  });
}
