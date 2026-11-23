import type { StoredBoard } from '../../shared/model.ts';
import { uid } from '../core/base.ts';

// The canvas cards of a board, in its Unsorted tray too, that point at a board.
const canvases = (b: StoredBoard) =>
  [...(b.cards ?? []), ...(b.tray ?? [])].flatMap(c => (c.type === 'canvas' && c.board ? [c] : []));

// A board and the boards inside it through canvas cards, each once however many cards point at it. A card whose board
// can't be loaded is counted, and keeps its place.
export async function boardTree(rootId: string, load: (id: string) => Promise<StoredBoard | null>) {
  const boards: StoredBoard[] = [],
    seen = new Set<string>(),
    gone = new Set<string>();
  let missing = 0;
  const visit = async (id: string) => {
    if (gone.has(id)) missing++;
    if (seen.has(id) || gone.has(id)) return;
    seen.add(id);
    const b = await load(id);
    if (!b) {
      gone.add(id);
      missing++;
      return;
    }
    boards.push(b);
    for (const k of canvases(b)) if (k.board) await visit(k.board);
  };
  await visit(rootId);
  return { boards, missing };
}

// Copies of those boards under new ids, so a copy never shares a canvas with what it was made from: the root takes
// `into`, every canvas lands in the root's folder under the first board that holds it, and a canvas card whose board
// isn't among them loses its pointer rather than keep one into somewhere else, and is counted. A board nothing leads to
// is left out.
export function renewed(
  boards: readonly StoredBoard[],
  rootId: string,
  into: { name?: string; folder?: string | null; parent?: string },
) {
  const byId = new Map(boards.map(b => [b.id, b])),
    holder = new Map<string, string>(),
    reached: StoredBoard[] = [];
  const walk = (b: StoredBoard) => {
    reached.push(b);
    for (const k of canvases(b)) {
      const kid = k.board ? byId.get(k.board) : undefined;
      if (kid && kid.id !== rootId && !holder.has(kid.id)) {
        holder.set(kid.id, b.id);
        walk(kid);
      }
    }
  };
  const first = byId.get(rootId);
  if (first) walk(first);
  const fresh = new Map(reached.map(b => [b.id, uid()]));
  let orphaned = 0;
  const copies = reached.map(b => {
    const c = structuredClone(b);
    c.id = fresh.get(b.id) ?? c.id;
    for (const k of canvases(c)) {
      const kid = k.board ? fresh.get(k.board) : undefined;
      if (kid) k.board = kid;
      else {
        delete k.board;
        orphaned++;
      }
    }
    return c;
  });
  const root = copies[0];
  if (root) Object.assign(root, into);
  reached.forEach((b, i) => {
    const c = copies[i];
    if (!c || i === 0) return;
    c.parent = fresh.get(holder.get(b.id) ?? '');
    c.folder = root?.folder ?? null;
  });
  return { boards: copies, orphaned };
}
