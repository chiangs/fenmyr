import { session } from '../core/state.ts';
import { say } from '../myra/say.ts';
import { askGit } from '../repo/askGit.ts';
import { rootOf } from '../repo/codeFolder.ts';
import { renderPreview } from './preview.ts';

// Myra's "install": packages a prototype needs beyond React and Tailwind, installed into prototypes/ only after the
// person says yes to the names.
export function askInstall(packages: string[]) {
  const b = session.board,
    root = b ? rootOf(b) : null;
  const names = packages.map(p => p.trim()).filter(Boolean);
  if (b?.kind !== 'prototype' || !root || !names.length) return;
  const list = names.join(', '),
    repo = root.split('/').pop() ?? root;
  askGit(
    `Install ${list} into ${repo}/prototypes with npm install --ignore-scripts?`,
    'This downloads the code from npm and adds it to prototypes/package.json, so every prototype in this repo can use it. Its install scripts don’t run.',
    [
      {
        label: `Install ${list}`,
        cls: 'danger',
        run: () =>
          Fenmyr.protoInstall({ root, packages: names })
            .then(() => {
              say(`Installed ${list} ✦`, 4000);
              if (session.board?.id === b.id) renderPreview(session.board);
            })
            .catch(e => say(e instanceof Error ? e.message : String(e), 8000)),
      },
      { label: 'Not now', ghost: true, run: () => {} },
    ],
  );
}
