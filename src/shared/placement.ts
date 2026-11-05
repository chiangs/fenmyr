import type { Folder, Project } from './model.ts';

// What happens when a board or folder is dragged somewhere, or Myra moves it. Prototype code lives in its project's
// repo, so crossing to another project copies it rather than moving it, and prototypes stay in prototyping folders.
export type Placement =
  | { kind: 'move' }
  | { kind: 'copy'; to: Project }
  | { kind: 'blocked'; why: string; link?: Project };
type Library = { projects: Project[]; folders: Folder[] };

const MOVE: Placement = { kind: 'move' };
const blocked = (why: string, link?: Project): Placement =>
  link ? { kind: 'blocked', why, link } : { kind: 'blocked', why };
const ONLY_PROTOTYPES = 'Prototyping folders hold only prototype boards.';

const projectOf = (lib: Library, f: Folder | null | undefined) =>
  (f?.project && lib.projects.find(p => p.id === f.project)) || null;

const holdsPrototypes = (lib: Library, f: Folder): boolean =>
  f.kind === 'prototyping' || lib.folders.some(x => x.parent === f.id && holdsPrototypes(lib, x));

function across(from: Project | null, to: Project | null): Placement {
  if (!to) return blocked('Prototypes belong to a project with a repo.');
  if (from?.id === to.id) return MOVE;
  if (!to.repo) return blocked(`Link “${to.name}” to a repo first. Its prototypes are saved there.`, to);
  return { kind: 'copy', to };
}

export function placeBoard(lib: Library, board: { kind?: string; folder?: string | null }, to: Folder | null) {
  if (board.kind !== 'prototype') return to?.kind === 'prototyping' ? blocked(ONLY_PROTOTYPES) : MOVE;
  if (to?.kind !== 'prototyping') return blocked('Prototype boards live in prototyping folders.');
  const from = lib.folders.find(f => f.id === board.folder);
  return across(projectOf(lib, from), projectOf(lib, to));
}

// into: the folder it goes inside; otherwise projectId: the project it goes to the top of (null for none)
export function placeFolder(lib: Library, f: Folder, into: Folder | null, projectId: string | null) {
  if (into?.kind === 'prototyping') return blocked(ONLY_PROTOTYPES);
  const target = into ? projectOf(lib, into) : (lib.projects.find(p => p.id === projectId) ?? null);
  if (!holdsPrototypes(lib, f) || target?.id === f.project) return MOVE;
  if (f.kind !== 'prototyping')
    return blocked(
      'This folder holds prototypes. Drag each prototyping folder on its own to copy it to another project.',
    );
  return across(projectOf(lib, f), target);
}
