import type { Project } from '../../shared/model.ts';
import type { GitStatus, PackageManager } from '../../shared/ops.ts';
import { repoClash } from '../../shared/repos.ts';
import { appState } from '../core/state.ts';
import { refreshBoards } from '../library/rowMenu.ts';
import { saveLib } from '../library/tree.ts';
import { chirp } from '../settings/licenses.ts';
import { child, closestTo, esc } from '../ui/dom.ts';
import { showDialog } from '../ui/popover.ts';

type Repo = Extract<GitStatus, { kind: 'repo' }>;
// the one screen the dialog shows
type Step =
  | { kind: 'start' }
  | { kind: 'linked'; repo: Repo }
  | { kind: 'gone'; path: string }
  | { kind: 'noGit'; dir: string; install: string | null }
  | { kind: 'notRepo'; dir: string }
  | { kind: 'clash'; other: string }
  // problem: why the last try was refused, shown above the form
  | { kind: 'identity'; root: string; name: string; email: string; problem: string }
  | { kind: 'unlink'; path: string }
  | { kind: 'error'; message: string };

// on a Mac, git comes with Apple's command line tools
const GIT_INSTALL: Record<PackageManager, string> = {
  pacman: 'sudo pacman -S git',
  apt: 'sudo apt install git',
  dnf: 'sudo dnf install git',
  zypper: 'sudo zypper install git',
  brew: 'xcode-select --install',
};

const button = (action: string, label: string, look = '') =>
  `<button class="set-btn ${look}" data-a="${action}">${label}</button>`;
const PICK = button('pick', 'Choose a folder…', 'hot'),
  PICK_OTHER = button('pick', 'Choose another folder…'),
  DONE = button('done', 'Done', 'hot'),
  CANCEL = button('done', 'Cancel');

const row = (label: string, value: string) => `<div class="rl-row"><span>${label}</span><b>${value}</b></div>`;

function linkedScreen(r: Repo) {
  const n = r.changed.length,
    path = esc(r.root),
    branch = esc(r.branch ?? 'none checked out'),
    changes = n ? `${n} since the last commit` : 'None since the last commit',
    remote = r.remotes.find(x => x.name === 'origin') ?? r.remotes[0],
    online = remote ? esc(remote.url) : 'Only on this computer',
    rows = row('Folder', path) + row('Branch', branch) + row('Changes', changes) + row('Online copy', online),
    buttons = button('unlink', 'Unlink', 'danger') + PICK_OTHER + DONE;
  return `<div class="rl-rows">${rows}</div><div class="tdlg-btns">${buttons}</div>`;
}

function screen(s: Step): string {
  switch (s.kind) {
    case 'start': {
      const buttons = CANCEL + PICK;
      return `<p class="set-note">This project's prototypes are saved as code in one folder on this computer. Git keeps every version, so you can always go back. Choose an empty folder, or a git repo you already have.</p><div class="tdlg-btns">${buttons}</div>`;
    }
    case 'linked':
      return linkedScreen(s.repo);
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

const installCommand = async () => {
  const pm = await Fenmyr.packageManager().catch(() => null);
  return pm ? GIT_INSTALL[pm] : null;
};

// The project menu's Repo… dialog: choose a folder, make it a repo if needed, name who commits, and link it.
// Saving reloads the library, so the project is looked up by id each time rather than kept.
export function linkRepo(first: Project) {
  const live = () => appState.projects.find(x => x.id === first.id) ?? first;
  const title = esc(`Repo for “${first.name}”`);
  const d = showDialog(`<div class="tdlg rl" role="dialog"><h3>${title}</h3><div class="rl-body"></div></div>`);
  const body = child(d, '.rl-body');
  let step: Step = { kind: 'start' };
  const show = (s: Step) => {
    step = s;
    body.innerHTML = screen(s);
    body.querySelector('input')?.focus();
  };
  const fail = (e: unknown) => show({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
  const link = async (r: Repo) => {
    const p = live();
    if (p.repo?.path !== r.root) {
      p.repo = { path: r.root };
      await saveLib();
      await refreshBoards();
      chirp(`Linked “${p.name}” to its repo ✦`, 3000);
    }
    show({ kind: 'linked', repo: r });
  };

  const check = async (dir: string) => {
    const st = await Fenmyr.gitStatus(dir);
    switch (st.kind) {
      case 'noGit':
        return show({ kind: 'noGit', dir, install: await installCommand() });
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

  const act = async (a: string) => {
    switch (a) {
      case 'done':
        return d.remove();
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
