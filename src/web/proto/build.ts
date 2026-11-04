import type { Card } from '../../shared/model.ts';
import { $ } from '../core/dom.ts';
import { session } from '../core/state.ts';
import { addMsg } from '../myra/chatLog.ts';
import { rootOf } from '../repo/codeFolder.ts';
import { say } from '../settings/licenses.ts';
import { renderCode } from './code.ts';
import { gitAction } from './gitActions.ts';
import { renderGitBar } from './gitbar.ts';
import { previewErrors, renderPreview } from './preview.ts';

// Myra's "build": the host writes the code with Claude Code while the chat shows what's being written, then the code,
// the preview and the git bar catch up and her explanation arrives with an Undo.
let running: { id: string; board: string; root: string; dir: string; request: string } | null = null;

// what the builder reads from the board: the selected cards, or all of them, without positions or styling
const brief = (c: Card) =>
  Object.fromEntries(
    Object.entries(c).filter(
      ([k, v]) => !['x', 'y', 'w', 'h', 'r', 'rot', 'color'].includes(k) && v !== '' && v != null,
    ),
  );

const status = (words: string) => {
  $('mcStatus').textContent = words;
};

export async function startBuild(request: string) {
  const b = session.board;
  const root = b ? rootOf(b) : null;
  if (b?.kind !== 'prototype' || !root) return;
  if (running) return say('I’m still writing the last change. I’ll start on this once it’s done.', 6000);
  const picked = b.cards.filter(c => session.sel.has(c.id));
  const cards = JSON.stringify((picked.length ? picked : b.cards).slice(0, 80).map(brief));
  const { dir, stack, purpose = '', device = '' } = b.proto;
  status('Writing code…');
  try {
    const { id } = await Fenmyr.protoBuild({
      root,
      dir,
      stack,
      request,
      purpose,
      device,
      cards,
      errors: previewErrors(),
    });
    running = { id, board: b.id, root, dir, request };
  } catch (e) {
    status('');
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

// the host's protoBuild events, for the build that's running
export function buildEvent(data: unknown) {
  if (!running || typeof data !== 'object' || data === null) return;
  const e: Record<string, unknown> = { ...data };
  if (e.id !== running.id) return;
  if (e.type === 'edit') return status(`Writing ${String(e.file)}…`);
  const { root, dir, board, request } = running;
  running = null;
  status('');
  if (e.type === 'error') return say(`I couldn’t finish that. ${String(e.text)}`, 10000);
  const snapshot = String(e.snapshot),
    strays = Array.isArray(e.outside) ? e.outside.map(String) : [];
  const undoIt = { label: 'Undo', ghost: true, run: () => undo(root, dir, snapshot) };
  if (session.board?.id === board) refresh();
  // the commit message she suggests: the first line of what she was asked to do
  const message = request.split(/[\n.]/)[0]?.trim().slice(0, 72) ?? '';
  addMsg('myra', String(e.text), [{ label: 'Commit…', cls: 'next', run: () => gitAction('commit', message) }, undoIt]);
  if (strays.length)
    say(
      `I also changed files outside this prototype: ${strays.join(', ')}. Undo only puts this prototype back, so check those in the git bar.`,
      0,
      [],
      true,
    );
}
