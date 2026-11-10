import type { ChatAction } from '../../shared/chat.ts';
import type { Board, Card } from '../../shared/model.ts';
import { readSources } from '../../shared/repos.ts';
import { uid } from '../core/base.ts';
import { save } from '../core/history.ts';
import { session } from '../core/state.ts';
import type { Act } from '../myra/acts.ts';
import { addMsg, chatLog } from '../myra/chatLog.ts';
import { type SayAction, say } from '../myra/say.ts';
import { type Job, startJob } from '../myra/status.ts';
import { rootOf } from '../repo/codeFolder.ts';
import { renderCode } from './code.ts';
import { askCommit } from './gitActions.ts';
import { renderGitBar } from './gitbar.ts';
import { picturesOf } from './pictures.ts';
import { previewErrors, renderPreview } from './preview.ts';
import { cardButtons, cardsLine, keepSources } from './sources.ts';
import { beforeBuild } from './sync.ts';

// Myra's "build": the host writes the code with Claude Code while the chat shows what's being written, then the code,
// the preview and the git bar catch up and her explanation arrives with an Undo.
type Prototype = Extract<Board, { kind: 'prototype' }>;
let running: { id: string; build: string; proto: Prototype; root: string; request: string; job: Job } | null = null;

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
  if (running) return say('I’m still writing the last change. I’ll start on this once it’s done.', 6000);
  if (!synced) return beforeBuild(b, request, () => startBuild(request, cards, true));
  // kept before anything is awaited, while this prototype is surely the open board
  const build = uid();
  b.proto = { ...b.proto, build };
  save();
  const sel = new Set(cards === null ? session.sel : 'brought' in cards ? cards.brought : cards),
    picked = b.cards.filter(c => sel.has(c.id));
  const chosen = (picked.length || (cards && 'brought' in cards) ? picked : b.cards).slice(0, 80),
    briefs = JSON.stringify(chosen.map(brief)),
    pictures = await picturesOf(chosen);
  const { dir, stack, purpose = '', device = '' } = b.proto;
  const job = startJob({ kind: 'building', file: null });
  try {
    const { id } = await Fenmyr.protoBuild({
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
    running = { id, build, proto: b, root, request, job };
  } catch (e) {
    job.end();
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
  say('It’s back to how it was before that change ✦', 5000);
}

const undoView = (root: string, dir: string, snapshot: string): SayAction => ({
  label: 'Undo',
  ghost: true,
  run: () => undo(root, dir, snapshot),
});
const commitView = (b: Prototype, message: string): SayAction => ({
  label: 'Commit',
  cls: 'next',
  run: () => askCommit(b, message),
});

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
  return undoView(root, b.proto.dir, a.snapshot);
}

export function commitButton(a: Extract<ChatAction, { kind: 'commit' }>): SayAction | null {
  const b = openProto(a.board);
  return b && commitView(b, a.message);
}

// the host's protoBuild events, for the build that's running
export function buildEvent(data: unknown) {
  if (!running || typeof data !== 'object' || data === null) return;
  const e: Record<string, unknown> = { ...data };
  if (e.id !== running.id) return;
  if (e.type === 'edit') return running.job.show({ kind: 'building', file: String(e.file).split('/').at(-1) ?? null });
  const { root, build, proto, request, job } = running;
  running = null;
  job.end();
  if (e.type === 'error') return say(`I couldn’t finish that. ${String(e.text)}`, 10000);
  const snapshot = String(e.snapshot),
    strays = Array.isArray(e.outside) ? e.outside.map(String) : [],
    board = proto.id,
    here = session.board?.id === board,
    // the commit message she suggests: the first line of what she was asked to do
    message = request.split(/[\n.]/)[0]?.trim().slice(0, 72) ?? '';
  // Kept with her line when it lands in the prototype's own chat. Her line lands in whichever board is open, and its
  // buttons there must still act on this prototype, so those stay closures.
  const acts: Act[] = here
    ? [
        { kind: 'commit', board, message },
        { kind: 'buildUndo', board, snapshot, build },
      ]
    : [commitView(proto, message), undoView(root, proto.proto.dir, snapshot)];
  if (here) refresh();
  addMsg('myra', String(e.text), acts);
  const used = here ? keepSources(readSources(e.sources)) : [];
  if (used.length) addMsg('myra', cardsLine(used), cardButtons(used));
  if (strays.length)
    say(
      `I also changed files outside this prototype: ${strays.join(', ')}. Undo only puts this prototype back, so check those in the git bar.`,
      0,
      [],
      true,
    );
}
