// Open a Fenmyr zip as a new copy: every board in it gets a new id, so a zip opened twice makes two boards and nothing
// of yours is replaced.
import type { ImportResult } from '../../shared/fenmyrZip.ts';
import type { Folder } from '../../shared/model.ts';
import { placeBoard } from '../../shared/placement.ts';
import { appState } from '../core/state.ts';
import { say } from '../myra/say.ts';
import { renewed } from './boardTree.ts';
import { boardFolder, createBoard, currentPlace, type Place, uniqueName } from './create.ts';
import { plural } from './homeTiles.ts';
import { boardsIn, looseBoards } from './tree.ts';

const sentence = (n: number, noun: string, one: string, many: string) => `${plural(n, noun)} ${n === 1 ? one : many}`;

function report(name: string, got: ImportResult, boards: number, orphaned: number) {
  const { left } = got.manifest,
    inside = boards - 1,
    videos = left.videos + got.missing,
    added = inside ? ` with ${plural(inside, 'board')} inside it` : '',
    more = [
      left.chats && "The chats weren't in the zip.",
      left.vaultText > 0 && `The text of ${plural(left.vaultText, 'vault note')} wasn't in the zip.`,
      videos > 0 && `${sentence(videos, 'video', "wasn't", "weren't")} in the zip.`,
      orphaned > 0 && "Some canvas cards have no board, because theirs wasn't in the zip.",
      got.skipped > 0 &&
        `${sentence(got.skipped, 'card', "couldn't be read and was skipped", "couldn't be read and were skipped")}.`,
    ].filter(Boolean);
  return [`I added “${name}”${added} ✦`, ...more].join(' ');
}

async function land(got: ImportResult, at: Place, into: Folder | undefined) {
  const root = got.boards.find(b => b.id === got.manifest.root.id);
  if (!root) return;
  const name = uniqueName(into ? boardsIn(into.id) : looseBoards(), root.name || 'Untitled board'),
    made = renewed(got.boards, root.id, { name, folder: into?.id ?? null }),
    [top, ...canvases] = made.boards;
  if (!top) return;
  // it is a board of its own wherever it came from, and opens fitted to its cards
  delete top.parent;
  delete top.view;
  for (const b of canvases) await Fenmyr.save(b);
  await createBoard(at, { board: { name, cards: [], links: [], tray: [], ...top }, open: 'board' });
  say(report(name, got, made.boards.length, made.orphaned), 9000);
}

// A board lands where + Board would put it: in the folder, in a project's first folder, or on its own.
export async function importZip(at: Place, file?: File) {
  const into = boardFolder(at),
    verdict = into ? placeBoard(appState, {}, into) : null;
  if (verdict?.kind === 'blocked') return say(verdict.why, 5000);
  let got: ImportResult | null;
  try {
    got = await Fenmyr.zipImport(file);
  } catch (e) {
    return say(e instanceof Error ? e.message : String(e), 6000);
  }
  if (got) await land(got, at, into);
}

// a zip dropped anywhere on the window: on a board, on Home or in the sidebar
export function initZipDrops() {
  const zips = (e: DragEvent) => [...(e.dataTransfer?.items ?? [])].some(i => i.kind === 'file' && /zip/.test(i.type));
  addEventListener(
    'dragover',
    e => {
      if (zips(e)) e.preventDefault();
    },
    true,
  );
  addEventListener(
    'drop',
    e => {
      const file = [...(e.dataTransfer?.files ?? [])].find(f => /\.zip$/i.test(f.name));
      if (!file) return;
      e.preventDefault();
      e.stopPropagation();
      void importZip(currentPlace(), file);
    },
    true,
  );
}
