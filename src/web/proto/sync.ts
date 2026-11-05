import type { Board } from '../../shared/model.ts';
import { appState, session } from '../core/state.ts';
import { askGit } from '../repo/askGit.ts';
import { rootOf } from '../repo/codeFolder.ts';
import { say } from '../settings/licenses.ts';
import { startBuild } from './build.ts';
import { renderCode } from './code.ts';
import { renderGitBar } from './gitbar.ts';
import { renderPreview } from './preview.ts';

// Keeping a prototype's repo in step with GitHub: a fetch when its board opens, then every hour, and before Myra
// builds. Fetching only reads; pulling is asked for, and a clash never leaves files half-merged.
type Prototype = Extract<Board, { kind: 'prototype' }>;
const HOUR = 60 * 60 * 1000;
let hourly: ReturnType<typeof setInterval> | undefined;

const account = (root: string) => appState.projects.find(p => p.repo?.path === root)?.repo?.github?.account ?? '';
const failed = (e: unknown) => say(e instanceof Error ? e.message : String(e), 8000);

async function catchUp(b: Prototype) {
  if (session.board?.id !== b.id || session.board.kind !== 'prototype') return;
  await Promise.all([renderGitBar(session.board), renderCode(session.board), renderPreview(session.board)]);
}

async function fetchNow(b: Prototype) {
  const root = rootOf(b);
  if (!root) return null;
  const s = await Fenmyr.gitFetch({ root, account: account(root) }).catch(() => null);
  if (session.board?.id === b.id) renderGitBar(b);
  return s?.kind === 'repo' ? s : null;
}

export function startSync(b: Board) {
  clearInterval(hourly);
  if (b.kind !== 'prototype') return;
  fetchNow(b);
  hourly = setInterval(() => {
    if (session.board?.kind === 'prototype') fetchNow(session.board);
  }, HOUR);
}

function clash(b: Prototype, root: string, files: string[], redo: string) {
  const branch = `prototype/${b.proto.dir.split('/').pop() ?? 'work'}-${new Date().toISOString().slice(0, 10)}`;
  askGit(
    `${files.join(', ')} changed both here and on GitHub, so git can't combine them. I've left everything as it was.`,
    'Keep your version on a new branch so nothing is lost, or take GitHub’s version and I’ll make my last change again on top of it.',
    [
      {
        label: 'Keep mine on a new branch',
        cls: 'next',
        run: () =>
          Fenmyr.gitKeepMine({ root, branch, account: account(root) })
            .then(() => say(`Your version is on ${branch}, on GitHub too ✦`, 6000))
            .then(() => catchUp(b))
            .catch(failed),
      },
      {
        label: 'Take GitHub’s version',
        cls: 'danger',
        run: () =>
          Fenmyr.gitTakeTheirs({ root })
            .then(() => catchUp(b))
            .then(() => (redo ? startBuild(redo, true) : say('This is GitHub’s version now ✦', 5000)))
            .catch(failed),
      },
    ],
  );
}

// Pulls, and says how it went; true when the files are up to date.
export async function pullNow(b: Prototype, redo = '') {
  const root = rootOf(b);
  if (!root) return false;
  try {
    const r = await Fenmyr.gitPull({ root, account: account(root) });
    if (r.kind === 'conflict') {
      clash(b, root, r.files, redo);
      return false;
    }
    say('Pulled. This is the latest from GitHub ✦', 4000);
    await catchUp(b);
    return true;
  } catch (e) {
    failed(e);
    return false;
  }
}

// Before Myra builds: when GitHub has commits this computer doesn't, she asks to pull them first.
export async function beforeBuild(b: Prototype, request: string, go: () => void) {
  const s = await fetchNow(b);
  if (!s?.behind) return go();
  const n = s.behind === 1 ? '1 commit' : `${s.behind} commits`;
  askGit(
    `GitHub has ${n} this computer doesn't have. Pull them before I start?`,
    'Someone changed this repo somewhere else. Pulling first means I build on the latest version instead of an old one.',
    [
      { label: 'Pull first', cls: 'next', run: () => pullNow(b, request).then(ok => ok && go()) },
      { label: 'Build anyway', ghost: true, run: go },
    ],
  );
}
