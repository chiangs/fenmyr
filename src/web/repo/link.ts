import type { Project } from '../../shared/model.ts';
import type { GitStatus } from '../../shared/ops.ts';
import { type GitHubRepo, githubOf, repoClash, repoNameFor } from '../../shared/repos.ts';
import { $ } from '../core/dom.ts';
import { appState } from '../core/state.ts';
import { refreshBoards } from '../library/rowMenu.ts';
import { saveLib } from '../library/tree.ts';
import { chirp } from '../myra/say.ts';
import { setTab } from '../settings/colors.ts';
import { child, closestTo, esc } from '../ui/dom.ts';
import { showDialog } from '../ui/popover.ts';
import { installCommand } from './install.ts';
import { adoptPrototypes, newPrototypingFolder } from './prototypes.ts';

type Repo = Extract<GitStatus, { kind: 'repo' }>;
type GitHubLink = NonNullable<NonNullable<Project['repo']>['github']>;
// the one screen the dialog shows
type Step =
  | { kind: 'start' }
  | { kind: 'linked'; repo: Repo; github: GitHubLink | null }
  | { kind: 'gone'; path: string }
  | { kind: 'noGit'; dir: string; install: string | null }
  | { kind: 'notRepo'; dir: string }
  | { kind: 'clash'; other: string }
  // problem: why the last try was refused, shown above the form
  | { kind: 'identity'; root: string; name: string; email: string; problem: string }
  | { kind: 'unlink'; path: string }
  | { kind: 'error'; message: string }
  // existing: the GitHub repo its origin already points at, used instead of making one
  | {
      kind: 'github';
      repo: Repo;
      accounts: string[];
      account: string;
      existing: GitHubRepo | null;
      name: string;
      isPrivate: boolean;
      problem: string;
    }
  | { kind: 'noGitHub' };

const button = (action: string, label: string, look = '') =>
  `<button class="set-btn ${look}" data-a="${action}">${label}</button>`;
const PICK = button('pick', 'Choose a folder…', 'hot'),
  PICK_OTHER = button('pick', 'Choose another folder…'),
  DONE = button('done', 'Done', 'hot'),
  CANCEL = button('done', 'Cancel'),
  BACK = button('back', 'Back');

const row = (label: string, value: string) => `<div class="rl-row"><span>${label}</span><b>${value}</b></div>`;

function linkedScreen(r: Repo, github: GitHubLink | null) {
  const n = r.changed.length,
    path = esc(r.root),
    branch = esc(r.branch ?? 'none checked out'),
    changes = n ? `${n} since the last commit` : 'None since the last commit',
    remote = r.remotes.find(x => x.name === 'origin') ?? r.remotes[0],
    online = github
      ? esc(`github.com/${github.owner}/${github.name} · as ${github.account}`)
      : remote
        ? esc(remote.url)
        : 'Only on this computer',
    rows = row('Folder', path) + row('Branch', branch) + row('Changes', changes) + row('Online copy', online),
    buttons = button('unlink', 'Unlink', 'danger') + button('github', github ? 'GitHub…' : 'Put it on GitHub…') + DONE;
  return `<div class="rl-rows">${rows}</div><div class="tdlg-btns">${buttons}</div>`;
}

function githubScreen(s: Extract<Step, { kind: 'github' }>) {
  const options = s.accounts
      .map(a => {
        const login = esc(a),
          chosen = a === s.account ? ' selected' : '';
        return `<option value="${login}"${chosen}>${login}</option>`;
      })
      .join(''),
    problem = esc(s.problem),
    who = `<p class="rl-problem">${problem}</p><label>GitHub account<select id="rlAcct">${options}</select></label>`;
  if (s.existing) {
    const where = esc(`github.com/${s.existing.owner}/${s.existing.name}`),
      buttons = BACK + button('useGitHub', 'Use it', 'hot');
    return `<p class="set-note">This repo already has a copy on GitHub at <b>${where}</b>.</p>${who}<div class="tdlg-btns">${buttons}</div>`;
  }
  const name = esc(s.name),
    checked = s.isPrivate ? ' checked' : '',
    buttons = BACK + button('createGitHub', 'Create on GitHub', 'hot');
  return `<p class="set-note">GitHub keeps a copy of this repo online, so it's backed up and you can share a link. Pushing sends your commits there.</p>${who}<label>Name on GitHub<input id="rlRepoName" value="${name}"></label><label class="vg-sw"><span>Private<small>Only you and people you invite can see it.</small></span><input type="checkbox" class="tgl" id="rlPrivate"${checked}></label><div class="tdlg-btns">${buttons}</div>`;
}

function screen(s: Step): string {
  switch (s.kind) {
    case 'start': {
      const buttons = CANCEL + PICK;
      return `<p class="set-note">This project's prototypes are saved as code in one folder on this computer. Git keeps every version, so you can always go back. Choose an empty folder, or a git repo you already have.</p><div class="tdlg-btns">${buttons}</div>`;
    }
    case 'linked':
      return linkedScreen(s.repo, s.github);
    case 'github':
      return githubScreen(s);
    case 'noGitHub': {
      const buttons = BACK + button('openHelpers', 'Open Settings', 'hot');
      return `<p class="set-note">Set up GitHub first, in Settings → Helpers. It takes a few minutes, once per computer.</p><div class="tdlg-btns">${buttons}</div>`;
    }
    case 'gone': {
      const path = esc(s.path),
        buttons = button('unlink', 'Unlink', 'danger') + PICK;
      return `<p class="set-note">The folder at <span class="rl-path">${path}</span> isn't there any more. Choose where it is now, or unlink it.</p><div class="tdlg-btns">${buttons}</div>`;
    }
    case 'noGit': {
      const cmd = esc(s.install ?? ''),
        copy = button('copy', 'Copy'),
        how = s.install
          ? `<div class="rl-cmd"><code>${cmd}</code>${copy}</div><p class="set-note">Run this in a terminal, then check again.</p>`
          : '<p class="set-note">Install git with your system’s package manager, then check again.</p>',
        buttons = CANCEL + button('recheck', 'Check again', 'hot');
      return `<p class="set-note">Git isn't installed on this computer yet. Fenmyr uses it to keep every version of your prototypes.</p>${how}<div class="tdlg-btns">${buttons}</div>`;
    }
    case 'notRepo': {
      const path = esc(s.dir),
        buttons = PICK_OTHER + button('init', 'Make it a repo', 'hot');
      return `<p class="set-note"><span class="rl-path">${path}</span> isn't a git repo yet. Making it one lets git keep every version of your prototypes. Nothing in the folder changes except a hidden <code>.git</code> folder.</p><div class="tdlg-btns">${buttons}</div>`;
    }
    case 'clash': {
      const other = esc(s.other),
        buttons = CANCEL + PICK_OTHER;
      return `<p class="set-note">“${other}” already uses this repo, or one inside or around it. Two projects in one repo would commit each other's work, so choose another folder.</p><div class="tdlg-btns">${buttons}</div>`;
    }
    case 'identity': {
      const buttons = CANCEL + button('identity', 'Save and link', 'hot'),
        name = esc(s.name),
        email = esc(s.email),
        problem = esc(s.problem);
      return `<p class="set-note">Git puts a name and email on every version it saves. They stay on this computer unless you send the repo to GitHub.</p><p class="rl-problem">${problem}</p><label>Name<input id="rlName" autocomplete="name" value="${name}"></label><label>Email<input id="rlEmail" type="email" autocomplete="email" value="${email}"></label><label class="vg-sw"><span>Use them for every repo on this computer</span><input type="checkbox" class="tgl" id="rlEvery"></label><div class="tdlg-btns">${buttons}</div>`;
    }
    case 'unlink': {
      const path = esc(s.path),
        buttons = button('back', 'Cancel') + button('unlinkYes', 'Unlink', 'danger solid');
      return `<p class="set-note">Unlink this project from its repo? Nothing is deleted. The files stay in <span class="rl-path">${path}</span>.</p><div class="tdlg-btns">${buttons}</div>`;
    }
    case 'error': {
      const message = esc(s.message),
        buttons = CANCEL + PICK_OTHER;
      return `<p class="set-note">${message}</p><div class="tdlg-btns">${buttons}</div>`;
    }
    default: {
      const unhandled: never = s;
      return unhandled;
    }
  }
}

// The project menu's Repo… dialog: choose a folder, make it a repo if needed, name who commits, and link it.
// Saving reloads the library, so the project is looked up by id each time rather than kept. then: what comes next
// once it's linked, such as naming a new prototype; Done goes on to it.
export function linkRepo(first: Project, then?: () => unknown) {
  const live = () => appState.projects.find(x => x.id === first.id) ?? first;
  const title = esc(`Repo for “${first.name}”`);
  const d = showDialog(`<div class="tdlg rl" role="dialog"><h3>${title}</h3><div class="rl-body"></div></div>`);
  const body = child(d, '.rl-body');
  let step: Step = { kind: 'start' };
  const show = (s: Step) => {
    step = s;
    body.innerHTML = screen(s);
    // focus inside the dialog, so Escape reaches it on screens with nothing to type
    body.querySelector<HTMLElement>('input, select, .set-btn.hot, .set-btn')?.focus();
  };
  const fail = (e: unknown) => show({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
  const link = async (r: Repo) => {
    const p = live();
    if (p.repo?.path !== r.root) {
      p.repo = { path: r.root };
      await saveLib();
      await refreshBoards();
      chirp(`Linked “${p.name}” to its repo ✦`, 3000);
      // a linked project is ready for prototypes, so it gets somewhere to keep them
      if (!appState.folders.some(f => f.project === p.id && f.kind === 'prototyping')) await newPrototypingFolder(p);
      await adoptPrototypes(live());
    }
    show({ kind: 'linked', repo: r, github: live().repo?.github ?? null });
  };

  const check = async (dir: string) => {
    const st = await Fenmyr.gitStatus(dir);
    switch (st.kind) {
      case 'noGit':
        return show({ kind: 'noGit', dir, install: await installCommand('git') });
      case 'missing':
        return show({ kind: 'gone', path: dir });
      case 'folder': {
        const other = repoClash(appState.projects, first.id, dir);
        return show(other ? { kind: 'clash', other: other.name } : { kind: 'notRepo', dir });
      }
      case 'repo': {
        const other = repoClash(appState.projects, first.id, st.root);
        if (other) return show({ kind: 'clash', other: other.name });
        if (!st.identity.name || !st.identity.email)
          return show({ kind: 'identity', root: st.root, ...st.identity, problem: '' });
        return link(st);
      }
      default: {
        const unhandled: never = st;
        return unhandled;
      }
    }
  };

  const openGitHub = async (repo: Repo) => {
    const gh = await Fenmyr.ghStatus();
    const ready = gh.kind === 'ready' ? gh.accounts.filter(x => x.ok) : [];
    if (!ready[0]) return show({ kind: 'noGitHub' });
    const origin = repo.remotes.find(x => x.name === 'origin'),
      saved = live().repo?.github;
    show({
      kind: 'github',
      repo,
      accounts: ready.map(x => x.login),
      account: saved?.account ?? (ready.find(x => x.active) ?? ready[0]).login,
      existing: origin ? githubOf(origin.url) : null,
      name: repoNameFor(first.name),
      isPrivate: true,
      problem: '',
    });
  };

  const saveGitHub = async (s: Extract<Step, { kind: 'github' }>, create: boolean) => {
    const account = child(d, '#rlAcct', HTMLSelectElement).value;
    let made = s.existing;
    if (create) {
      const name = child(d, '#rlRepoName', HTMLInputElement).value.trim(),
        isPrivate = child(d, '#rlPrivate', HTMLInputElement).checked;
      try {
        made = await Fenmyr.ghRepoCreate({ path: s.repo.root, account, name, private: isPrivate });
      } catch (e) {
        return show({ ...s, account, name, isPrivate, problem: e instanceof Error ? e.message : String(e) });
      }
    }
    const p = live();
    if (!made || !p.repo) return;
    p.repo = { path: p.repo.path, github: { ...made, account } };
    await saveLib();
    await refreshBoards();
    chirp(`“${p.name}” is on GitHub as ${made.owner}/${made.name} ✦`, 3500);
    return check(s.repo.root);
  };

  const act = async (a: string) => {
    switch (a) {
      case 'done': {
        d.remove();
        if (live().repo) then?.();
        return;
      }
      case 'pick': {
        const dir = await Fenmyr.repoPick();
        return dir ? check(dir) : show(step);
      }
      case 'recheck':
        return step.kind === 'noGit' ? check(step.dir) : undefined;
      case 'copy':
        return navigator.clipboard.writeText(step.kind === 'noGit' ? (step.install ?? '') : '');
      case 'init': {
        if (step.kind !== 'notRepo') return;
        await Fenmyr.gitInit(step.dir);
        return check(step.dir);
      }
      case 'identity': {
        if (step.kind !== 'identity') return;
        const field = (id: string) => child(d, id, HTMLInputElement),
          typed = { root: step.root, name: field('#rlName').value, email: field('#rlEmail').value };
        try {
          await Fenmyr.gitSetIdentity({ path: typed.root, ...typed, everywhere: field('#rlEvery').checked });
        } catch (e) {
          return show({ kind: 'identity', ...typed, problem: e instanceof Error ? e.message : String(e) });
        }
        return check(typed.root);
      }
      case 'unlink':
        return show({ kind: 'unlink', path: live().repo?.path ?? '' });
      case 'github':
        return step.kind === 'linked' ? openGitHub(step.repo) : undefined;
      case 'useGitHub':
      case 'createGitHub':
        return step.kind === 'github' ? saveGitHub(step, a === 'createGitHub') : undefined;
      case 'openHelpers':
        d.remove();
        $('gearBtn').click();
        return setTab('helpers');
      case 'back': {
        const repo = live().repo;
        return repo ? check(repo.path) : show({ kind: 'start' });
      }
      case 'unlinkYes': {
        const p = live(),
          path = p.repo?.path ?? '';
        delete p.repo;
        await saveLib();
        await refreshBoards();
        d.remove();
        return chirp(`“${p.name}” is unlinked. Its files are still in ${path}`, 4000);
      }
    }
  };

  d.onclick = e => {
    if (e.target === d) return d.remove();
    const a = closestTo(e.target, '[data-a]')?.dataset.a;
    if (!a) return;
    for (const b of body.querySelectorAll('button')) b.disabled = true;
    act(a).catch(fail);
  };
  d.onkeydown = e => {
    e.stopPropagation();
    if (e.key === 'Escape') d.remove();
  };
  const linked = live().repo;
  if (linked) check(linked.path).catch(fail);
  else show(step);
}
