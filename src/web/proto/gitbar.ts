import type { Board } from '../../shared/model.ts';
import type { GitStatus } from '../../shared/ops.ts';
import { githubOf, inCommit } from '../../shared/repos.ts';
import { $ } from '../core/dom.ts';
import { appState, session } from '../core/state.ts';
import { boardMenu, type MenuItem, when } from '../features/export.ts';
import { rootOf } from '../repo/codeFolder.ts';
import { closestTo, esc } from '../ui/dom.ts';
import { gitAction } from './gitActions.ts';

// The git bar sits in Myra's chat, above her input. Line one is the branch; line two is what this computer hasn't
// committed yet, then whether GitHub has every commit. The two are separate questions, so each says plainly which one it
// answers. Commit stays on the bar; the repo's name, Push, Pull and GitHub wait in its More menu.
type Repo = Extract<GitStatus, { kind: 'repo' }>;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// where the commits stand against GitHub
function syncOf(s: Repo) {
  if (!s.head) return { text: 'No commits yet', icon: '', tip: 'Commit to start this repo’s history.' };
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

// the repo on GitHub: the project's own link, else where origin points; null when it isn't on GitHub
function onGitHub(s: Repo) {
  const linked = appState.projects.find(p => p.repo?.path === s.root)?.repo?.github,
    origin = s.remotes.find(r => r.name === 'origin')?.url ?? '';
  return linked ?? githubOf(origin);
}

// More opens over the thread, ending just above its button, so the input stays in view. It's laid out at the corner
// first, where nothing squeezes it, so its width is its own.
function openMore(at: Element, items: MenuItem[]) {
  const r = at.getBoundingClientRect();
  boardMenu({ clientX: 0, clientY: 0 }, items);
  const m = $('rowMenu');
  m.style.left = `${Math.max(8, r.right - m.offsetWidth)}px`;
  m.style.top = `${Math.max(8, r.top - m.offsetHeight - 6)}px`;
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
  const name = s.root.split('/').pop() ?? s.root,
    repo = esc(name),
    where = esc(s.root),
    repoTip = esc(`${name} · ${s.root}`),
    branch = esc(s.branch ?? 'no branch'),
    branchIcon = Icon('git-branch', { size: 14 }),
    changes = own ? `${plural(own, 'file')} not committed` : 'Everything committed',
    changesTip = esc(
      elsewhere
        ? `Files in this prototype that changed since its last commit. ${plural(elsewhere, 'other file')} changed elsewhere in the repo.`
        : 'Files in this prototype that changed since its last commit.',
    ),
    syncText = esc(sync.text),
    syncTip = esc(sync.tip),
    syncIcon = sync.icon ? Icon(sync.icon, { size: 13 }) : '',
    commitIcon = Icon('git-commit', { size: 14 }),
    moreIcon = Icon('more', { size: 15 }),
    gh = onGitHub(s),
    hub = gh ? `https://github.com/${gh.owner}/${gh.name}` : '',
    ghName = gh ? esc(`${gh.owner}/${gh.name}`) : '',
    behind = s.behind,
    push = s.branch ? `Push ${branch} to GitHub` : 'Push to GitHub';
  el.innerHTML = `<span class="pg-ic">${branchIcon}</span><b class="pg-branch" title="${repoTip}">${branch}</b><span class="pg-state"><span title="${changesTip}">${changes}</span> · <span title="${syncTip}">${syncIcon}${syncText}</span></span><button class="pv-btn pg-commit" data-git="commit">${commitIcon}Commit</button><button class="pv-btn pg-more" data-git="more" title="More git actions" aria-label="More git actions" aria-haspopup="menu">${moreIcon}</button>`;
  const more: MenuItem[] = [
    { label: `<span class="pg-where"><b>${repo}</b><small>${where}</small></span>`, run: () => {}, disabled: true },
    '-',
    { label: push, run: () => gitAction('push') },
    ...when(behind > 0, [{ label: `Pull ${behind} from GitHub`, run: () => gitAction('pull') }]),
    ...when(!!hub, [{ label: `Open ${ghName} on GitHub`, run: () => Fenmyr.openURL(hub) }]),
  ];
  el.onclick = e => {
    const at = closestTo(e.target, '[data-git]'),
      a = at?.dataset.git;
    if (at && a === 'more') openMore(at, more);
    else if (a) gitAction(a);
  };
}
