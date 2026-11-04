import type { Board } from '../../shared/model.ts';
import { appState, session } from '../core/state.ts';
import { askGit } from '../repo/askGit.ts';
import { rootOf } from '../repo/codeFolder.ts';
import { say } from '../settings/licenses.ts';
import { renderGitBar } from './gitbar.ts';
import { pullNow } from './sync.ts';

// What Myra and the git bar may do with git. Nothing runs without the person's say-so: a commit takes one tap, a push a
// button that names where it goes.
type Prototype = Extract<Board, { kind: 'prototype' }>;

const failed = (e: unknown) => say(e instanceof Error ? e.message : String(e), 8000);
const projectOf = (b: Prototype) => {
  const root = rootOf(b);
  return root ? { root, repo: root.split('/').pop() ?? root } : null;
};

async function commit(b: Prototype, root: string, message: string) {
  await Fenmyr.gitCommit({ root, dir: b.proto.dir, message });
  say('Committed. This version is in the history now ✦', 4000);
  if (session.board?.id === b.id) renderGitBar(b);
}

async function askCommit(b: Prototype, message: string) {
  const where = projectOf(b);
  if (!where) return;
  const s = await Fenmyr.gitStatus(where.root).catch(() => null);
  const n = s?.kind === 'repo' ? s.changed.filter(c => c.path.startsWith(`${b.proto.dir}/`)).length : 0;
  if (!n) return say('There’s nothing new in this prototype to commit.', 5000);
  const branch = s?.kind === 'repo' ? (s.branch ?? 'this branch') : 'this branch',
    files = n === 1 ? '1 changed file' : `${n} changed files`;
  askGit(
    `Commit ${files} in ${where.repo}/${b.proto.dir} to ${branch}? Message: “${message}”`,
    'Committing saves this version in the project’s history, so you can always come back to it. It stays on this computer until you push, which sends it to GitHub.',
    [
      {
        label: 'Commit',
        cls: 'next',
        run: () => commit(b, where.root, message).catch(failed),
      },
      { label: 'Not now', ghost: true, run: () => {} },
    ],
  );
}

async function askPush(b: Prototype) {
  const where = projectOf(b);
  if (!where) return;
  const s = await Fenmyr.gitStatus(where.root).catch(() => null);
  if (s?.kind !== 'repo' || !s.branch) return say('There’s no branch to push.', 5000);
  const origin = s.remotes.find(r => r.name === 'origin')?.url;
  if (!origin) return say('This project isn’t on GitHub yet. Its Repo… menu can put it there.', 6000);
  const project = appState.projects.find(p => p.repo?.path === where.root),
    account = project?.repo?.github?.account ?? '',
    branch = s.branch;
  askGit(
    `Push ${branch} of ${where.repo} to ${origin}?`,
    'Pushing sends your commits to GitHub, where the project’s online copy lives. Everyone who can see that repo will see them.',
    [
      {
        label: `Push ${branch} to ${origin.replace(/^https:\/\/|^git@|\.git$/g, '')}`,
        cls: 'danger',
        run: () =>
          Fenmyr.gitPush({ root: where.root, account })
            .then(() => {
              say('Pushed. GitHub has this version now ✦', 4000);
              if (session.board?.id === b.id) renderGitBar(b);
            })
            .catch(failed),
      },
      { label: 'Not now', ghost: true, run: () => {} },
    ],
  );
}

// From the git bar or Myra's "git" reply: the question for that action, about the open prototype.
export function gitAction(action: string, message = '') {
  const b = session.board;
  if (b?.kind !== 'prototype') return;
  if (action === 'commit') return askCommit(b, message.trim() || `Update ${b.name}`);
  if (action === 'pull') return pullNow(b);
  return action === 'push' ? askPush(b) : undefined;
}
