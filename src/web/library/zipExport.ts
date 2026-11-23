import { type ExportOptions, heldMedia, mediaUsed, noCut, stripBoard } from '../../shared/fenmyrStrip.ts';
import { makeManifest } from '../../shared/fenmyrZip.ts';
import type { StoredBoard } from '../../shared/model.ts';
import type { Board } from '../../shared/ops.ts';
import { saveNow } from '../core/history.ts';
import { session } from '../core/state.ts';
import { say } from '../myra/say.ts';
import { boardTree } from './boardTree.ts';
import { askExport, type Found } from './zipDialog.ts';

// Save a board, and the boards inside it, as a Fenmyr zip: what there is, what the person leaves in, then the host
// writes it. Everything that comes out of the board is cut here, by the table in src/shared/fenmyrStrip.ts.
const cardsOf = (b: StoredBoard) => [...(b.cards ?? []), ...(b.tray ?? [])];
const hasChat = (b: StoredBoard) => !!(b.chat?.length || b.chats?.length);

// the size of a video in the media folder, from the header of the page's own request for it
async function mediaSize(name: string) {
  try {
    const r = await fetch(`fenmyrmedia://media/${name}`);
    void r.body?.cancel();
    return Number(r.headers.get('content-length')) || 0;
  } catch {
    return 0;
  }
}

function survey(boards: StoredBoard[], videoBytes: number): Found {
  const cards = boards.flatMap(cardsOf);
  return {
    boards: boards.length,
    canvases: boards.length - 1,
    pictures: cards.filter(c => c.type === 'image' && c.src).length,
    memos: cards.filter(c => c.type === 'audio' && c.src).length,
    // a video bundled with the app goes as its address, so it isn't one of the videos that are going
    videos: cards.filter(c => c.type === 'video' && heldMedia(c)).length,
    videoBytes,
    chats: boards.some(hasChat),
    vaultNotes: cards.filter(c => c.type === 'vnote' && (c.excerpt || c.props?.length)).length,
  };
}

function cut(boards: StoredBoard[], opts: ExportOptions) {
  const left = noCut();
  const out: Board[] = boards.map(b => ({ ...stripBoard(b, opts, left), id: b.id }));
  return { boards: out, left };
}

export async function exportBoardZip(id: string) {
  // an edit still waiting to save is part of what is exported
  if (session.board?.id === id) await saveNow();
  const tree = await boardTree(id, Fenmyr.load),
    root = tree.boards[0];
  if (!root) return say("I couldn't read that board.", 4000);
  const name = root.name || 'Untitled board',
    names = mediaUsed(tree.boards),
    sizes = Fenmyr.native ? await Promise.all(names.map(mediaSize)) : [],
    videoBytes = sizes.reduce((n, s) => n + s, 0),
    found = survey(tree.boards, videoBytes),
    json = (o: ExportOptions) => cut(tree.boards, o).boards.reduce((n, b) => n + JSON.stringify(b).length, 0),
    opts = await askExport({
      name,
      found,
      native: Fenmyr.native,
      sizeFor: o => json(o) + (o.videos ? videoBytes : 0),
    });
  if (!opts) return;
  const { boards, left } = cut(tree.boards, opts),
    media = opts.videos ? mediaUsed(boards) : [],
    manifest = makeManifest(
      { kind: 'board', id },
      { boards: boards.map(b => b.id), media, left: { ...left, missingCanvases: tree.missing } },
      await Fenmyr.appBuild(),
    );
  try {
    const saved = await Fenmyr.zipExport({ name, manifest, boards });
    if (!saved) return;
    const show = Fenmyr.native ? [{ label: 'Show in folder', run: () => Fenmyr.reveal(saved) }] : [];
    say(`Saved “${name}” ✦`, 9000, show);
  } catch (e) {
    say(e instanceof Error ? e.message : String(e), 6000);
  }
}
