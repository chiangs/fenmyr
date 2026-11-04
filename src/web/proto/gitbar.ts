import type { Board } from '../../shared/model.ts';
import type { GitStatus } from '../../shared/ops.ts';
import { inCommit } from '../../shared/repos.ts';
import { $ } from '../core/dom.ts';
import { session } from '../core/state.ts';
import { rootOf } from '../repo/codeFolder.ts';
import { closestTo, esc } from '../ui/dom.ts';
import { gitAction } from './gitActions.ts';

// The git bar always says which repo this prototype uses, its branch, what this computer hasn't committed yet, and
// whether GitHub has every commit. The two are separate questions, so each says plainly which one it answers.
type Repo = Extract<GitStatus, { kind: 'repo' }>;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// where the commits stand against GitHub
function syncOf(s: Repo) {
  if (!s.hasCommits) return { text: 'No commits yet', icon: '', tip: 'Commit to start this repo’s history.' };
  if (!s.remotes.length) return { text: 'Not on GitHub', icon: '', tip: 'This repo is only on this computer.' };
  if (!s.upstream) return { text: 'Not pushed yet', icon: 'cloud-up', tip: 'GitHub doesn’t have this branch yet.' };
  const parts = [s.ahead ? `${plural(s.ahead, 'commit')} to push` : '', s.behind ? `${s.behind} to pull` : ''].filter(
    Boolean,
  );
  return parts.length
    ? {
        text: parts.join(' · '),
        icon: 'cloud-up',
        tip: 'Commits that GitHub and this computer don’t share yet.',
      }
    : {
        text: 'GitHub has every commit',
        icon: 'cloud-check',
        tip: 'Changes you haven’t committed stay on this computer.',
      };
}

// files change outside Fenmyr too (an editor, a terminal commit), so coming back to the window reads the repo again
let watching = false;

export async function renderGitBar(b: Board) {
  if (!watching) {
    watching = true;
    addEventListener('focus', () => {
      if (session.board?.kind === 'prototype') renderGitBar(session.board);
    });
  }
  const el = $('prGit'),
    root = rootOf(b);
  if (!root) {
    el.innerHTML = '<span class="pg-warn">This prototype’s project isn’t linked to a repo.</span>';
    return;
  }
  const s = await Fenmyr.gitStatus(root).catch(() => null);
  if (s?.kind !== 'repo') {
    const where = esc(root);
    el.innerHTML = `<span class="pg-warn">Git can’t read the repo at ${where}.</span>`;
    return;
  }
  const own = b.kind === 'prototype' ? s.changed.filter(c => inCommit(b.proto.dir, c.path)).length : 0,
    elsewhere = s.changed.length - own,
    sync = syncOf(s);
  const repo = esc(s.root.split('/').pop() ?? s.root),
    where = esc(s.root),
    branch = esc(s.branch ?? 'no branch'),
    branchIcon = Icon('git-branch', { size: 13 }),
    changes = own ? `${plural(own, 'change')} not committed` : 'Everything committed',
    changesTip = esc(
      elsewhere
        ? `Files in this prototype that changed since its last commit. ${plural(elsewhere, 'other file')} changed elsewhere in the repo.`
        : 'Files in this prototype that changed since its last commit.',
    ),
    syncText = esc(sync.text),
    syncTip = esc(sync.tip),
    syncIcon = sync.icon ? Icon(sync.icon, { size: 14 }) : '',
    commitIcon = Icon('git-commit', { size: 14 }),
    pushIcon = Icon('cloud-up', { size: 14 }),
    pullIcon = Icon('cloud-down', { size: 14 }),
    behind = s.behind,
    pull = behind ? `<button class="pv-btn" data-git="pull">${pullIcon}Pull ${behind} from GitHub</button>` : '';
  el.innerHTML = `<b class="pg-repo" title="${where}">${repo}</b><span class="pg-chip">${branchIcon}${branch}</span><span title="${changesTip}">${changes}</span><span class="pg-sync" title="${syncTip}">${syncIcon}${syncText}</span>${pull}<button class="pv-btn" data-git="commit">${commitIcon}Commit</button><button class="pv-btn" data-git="push">${pushIcon}Push</button>`;
  el.onclick = e => {
    const a = closestTo(e.target, '[data-git]')?.dataset.git;
    if (a) gitAction(a);
  };
}
