// What a folder holds is walked the same way whatever is done with it: the folder first, then its boards, then the
// folders inside it, each handed the one made for the folder above. Duplicate makes copies with it, the export of a zip
// writes down what it finds, and the import of one places what it reads.
export type FolderTree<F, B> = { boards: (f: F) => B[]; subs: (f: F) => F[] };
export type FolderWalk<F, B, M> = {
  folder: (f: F, above: M | null) => M | Promise<M>;
  board: (b: B, into: M) => unknown;
};

export async function walkFolder<F, B, M>(
  f: F,
  tree: FolderTree<F, B>,
  at: FolderWalk<F, B, M>,
  above: M | null = null,
): Promise<M> {
  const made = await at.folder(f, above);
  for (const b of tree.boards(f)) await at.board(b, made);
  for (const x of tree.subs(f)) await walkFolder(x, tree, at, made);
  return made;
}
