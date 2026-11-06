import type { StoredBoard } from '../../shared/model.ts';
import { PROTO_DIR, protoSlug } from '../../shared/repos.ts';
import { save } from '../core/history.ts';
import { appState, session } from '../core/state.ts';
import { say } from '../myra/say.ts';
import { askGit } from './askGit.ts';

type Prototype = Extract<StoredBoard, { kind: 'prototype' }>;

// a prototype's code lives in its project's repo
export const rootOf = (b: { folder?: string | null }) => {
  const f = appState.folders.find(x => x.id === b.folder);
  return appState.projects.find(p => p.id === f?.project)?.repo?.path ?? null;
};

const failed = (e: unknown) => say(e instanceof Error ? e.message : String(e), 6000);

async function setDir(id: string, dir: string) {
  if (session.board?.id === id && session.board.kind === 'prototype') {
    session.board.proto = { ...session.board.proto, dir };
    return save();
  }
  const b = await Fenmyr.load(id);
  if (b?.kind !== 'prototype') return;
  await Fenmyr.save({ ...b, proto: { ...b.proto, dir } });
}

// After a prototype board is renamed: offer to rename its code folder to match. Saying no changes nothing.
export function offerRename(b: StoredBoard) {
  if (b.kind !== 'prototype') return;
  const root = rootOf(b),
    now = b.proto.dir.split('/').pop() ?? '',
    want = protoSlug(b.name ?? '');
  if (!root || now === want || now.startsWith(`${want}-`)) return;
  const { dir } = b.proto;
  askGit(
    `I can rename ${dir} to prototypes/${want} with git mv. Rename it?`,
    'Your code keeps working either way. Renaming only makes the folder name match the board, and the history follows it.',
    [
      {
        label: 'Rename',
        cls: 'next',
        run: () =>
          Fenmyr.protoRename({ root, dir, name: b.name ?? want })
            .then(r => setDir(b.id, r.dir).then(() => say(`Renamed it to ${r.dir} ✦`, 4000)))
            .catch(failed),
      },
      { label: 'Keep the old name', ghost: true, run: () => {} },
    ],
  );
}

async function findIt(b: Prototype, root: string) {
  const picked = await Fenmyr.repoPick();
  if (!picked) return;
  const rel = picked.startsWith(`${root}/`) ? picked.slice(root.length + 1) : '';
  if (!PROTO_DIR.test(rel)) return say(`That folder isn't one of the prototypes in ${root}/prototypes.`, 6000);
  await setDir(b.id, rel);
  say(`Found it. This board uses ${rel} now ✦`, 4000);
}

// When a prototype board opens and its code folder is gone, because it was moved or deleted outside Fenmyr.
export async function checkCode(b: StoredBoard) {
  if (b.kind !== 'prototype') return;
  const root = rootOf(b);
  if (!root || (await Fenmyr.protoExists({ root, dir: b.proto.dir }).catch(() => true))) return;
  const { dir, stack } = b.proto;
  askGit(
    `I can't find ${dir} in ${root}. It may have been moved or deleted outside Fenmyr.`,
    'Show me where it is now, or I can bring it back as it was at the last commit (or as a fresh start if it was never committed).',
    [
      { label: 'Find it…', cls: 'next', run: () => findIt(b, root).catch(failed) },
      {
        label: 'Bring it back',
        run: () =>
          Fenmyr.protoRestore({ root, dir, name: b.name ?? 'Prototype', stack })
            .then(how =>
              say(
                how === 'restored'
                  ? `It's back as it was at the last commit ✦`
                  : 'It was never committed, so I made a fresh start ✦',
                5000,
              ),
            )
            .catch(failed),
      },
    ],
  );
}
