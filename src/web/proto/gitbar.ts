import type { Board } from '../../shared/model.ts';
import { $ } from '../core/dom.ts';
import { rootOf } from '../repo/codeFolder.ts';
import { closestTo, esc } from '../ui/dom.ts';
import { gitAction } from './gitActions.ts';

// The git bar always says which repo this prototype uses, its branch, what's changed and whether GitHub is up to date.
export async function renderGitBar(b: Board) {
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
  const n = s.changed.length,
    repo = esc(s.root.split('/').pop() ?? s.root),
    branch = esc(s.branch ?? 'no branch'),
    changes = n ? `${n} change${n === 1 ? '' : 's'}` : 'No changes',
    sync = !s.hasCommits
      ? 'No commits yet'
      : !s.remotes.length
        ? 'Only on this computer'
        : !s.upstream
          ? 'Not pushed yet'
          : s.ahead || s.behind
            ? `↑${s.ahead} ↓${s.behind}`
            : 'Up to date',
    where = esc(s.root),
    behind = s.behind,
    pull = behind ? `<button class="pv-btn" data-git="pull">Pull ${behind} from GitHub</button>` : '';
  el.innerHTML = `<b class="pg-repo" title="${where}">${repo}</b><span class="pg-chip">${branch}</span><span>${changes}</span><span class="pg-sync">${sync}</span>${pull}<button class="pv-btn" data-git="commit">Commit…</button><button class="pv-btn" data-git="push">Push</button>`;
  el.onclick = e => {
    const a = closestTo(e.target, '[data-git]')?.dataset.git;
    if (a) gitAction(a);
  };
}
