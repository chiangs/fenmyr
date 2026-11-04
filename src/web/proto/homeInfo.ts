import type { BoardSummary } from '../../shared/ops.ts';
import { protoSlug } from '../../shared/repos.ts';
import { ago } from '../library/homeTiles.ts';
import { rootOf } from '../repo/codeFolder.ts';

// On a prototyping folder's home, each prototype's tile says its branch and its last commit, after the tile appears.
export async function showLastChange(tile: HTMLElement, b: BoardSummary) {
  const board = await Fenmyr.load(b.id).catch(() => null),
    root = board ? rootOf(board) : null;
  if (board?.kind !== 'prototype' || !root) return;
  const c = await Fenmyr.protoLastChange({ root, dir: board.proto.dir }).catch(() => null);
  const sub = tile.querySelector('.tile-meta small');
  if (!c || !sub) return;
  const branch = c.branch || 'no branch',
    last = c.when ? `“${c.subject}” ${ago(c.when)}` : 'not committed yet',
    // kept apart after a rename the person declined: the folder says where its code is
    dir = board.proto.dir === `prototypes/${protoSlug(board.name ?? '')}` ? '' : ` · ${board.proto.dir}`;
  sub.textContent = `${branch} · ${last}${dir}`;
}
