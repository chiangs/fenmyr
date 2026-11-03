import type { GhState, GitSetup } from '../../shared/ops.ts';
import { $ } from '../core/dom.ts';
import { chirp } from '../settings/licenses.ts';
import { child, closestTo, esc } from '../ui/dom.ts';
import { installCommand } from './install.ts';

// Settings → Helpers → Git and GitHub: each step checks itself, says what's missing, and offers the one thing to do.
type Found = { setup: GitSetup; gh: GhState; gitCmd: string | null; ghCmd: string | null };
let found: Found | null = null;
// GitHub's one-time code while a sign-in waits for the person to approve it
let signing: { code: string; url: string } | null = null;
let editingName = false;
// what was typed into the name form, kept when a save is refused
let typed: { name: string; email: string } | null = null;
let problem = '';

const button = (action: string, label: string, look = '') =>
  `<button class="set-btn ${look}" data-g="${action}">${label}</button>`;
const note = (words: string) => `<small>${words}</small>`;

function step(n: number, done: boolean, title: string, body: string) {
  const mark = done ? '✓' : String(n),
    state = done ? 'done' : 'todo';
  return `<div class="gs-step ${state}"><span class="gs-n">${mark}</span><div class="gs-body"><b>${title}</b>${body}</div></div>`;
}

function install(cmd: string | null, copy: string) {
  if (!cmd)
    return `${note('Install it with your system’s package manager, then check again.')}${button('check', 'Check again')}`;
  const shown = esc(cmd),
    buttons = button(copy, 'Copy') + button('check', 'Check again');
  return `<small>Run this in a terminal, then check again.</small><div class="rl-cmd"><code>${shown}</code></div><div class="gs-btns">${buttons}</div>`;
}

function nameStep(s: GitSetup) {
  const { name, email } = s.identity,
    known = !!(name && email) && !editingName;
  if (known) {
    const who = esc(`${name} · ${email}`),
      change = button('editName', 'Change');
    return step(2, true, 'Your name and email', `<small>${who}</small><div class="gs-btns">${change}</div>`);
  }
  const typedName = esc(typed?.name ?? name),
    typedEmail = esc(typed?.email ?? email),
    save = button('saveName', 'Save', 'hot');
  return step(
    2,
    false,
    'Your name and email',
    `<small>Git puts these on every version it saves, in every repo on this computer.</small><div class="gs-form"><input id="gsName" placeholder="Name" value="${typedName}"><input id="gsEmail" type="email" placeholder="Email" value="${typedEmail}"></div><div class="gs-btns">${save}</div>`,
  );
}

function signInStep(gh: GhState) {
  if (gh.kind === 'missing') return step(4, false, 'Sign in to GitHub', note('Install gh first.'));
  if (signing) {
    const code = esc(signing.code),
      buttons = button('openGitHub', 'Copy code and open GitHub', 'hot') + button('cancelSignIn', 'Cancel');
    return step(
      4,
      false,
      'Sign in to GitHub',
      `<div class="gs-code">${code}</div><small>Paste this code on GitHub and approve. This page updates when you’re done.</small><div class="gs-btns">${buttons}</div>`,
    );
  }
  if (!gh.accounts.length) {
    const signIn = button('signIn', 'Sign in to GitHub', 'hot');
    return step(4, false, 'Sign in to GitHub', `<div class="gs-btns">${signIn}</div>`);
  }
  const rows = gh.accounts
      .map(a => {
        const login = esc(a.login),
          state = a.ok ? (a.active ? 'in use' : 'signed in') : 'needs signing in again';
        return `<li><b>${login}</b> ${state}</li>`;
      })
      .join(''),
    more = button('signIn', 'Add another account');
  return step(4, true, 'Sign in to GitHub', `<ul class="gs-accts">${rows}</ul><div class="gs-btns">${more}</div>`);
}

function render() {
  const el = $('gitSetup');
  if (!el) return;
  el.onclick = e => {
    const a = closestTo(e.target, '[data-g]')?.dataset.g;
    if (a) act(a).catch(err => show(err instanceof Error ? err.message : String(err)));
  };
  if (!found) {
    el.innerHTML = note('Checking…');
    return;
  }
  const { setup, gh, gitCmd, ghCmd } = found;
  const said = esc(problem),
    gitStep = step(1, setup.git, 'Git', setup.git ? note('Installed.') : install(gitCmd, 'copyGit')),
    ghStep = step(
      3,
      gh.kind === 'ready',
      'GitHub’s gh tool',
      gh.kind === 'ready' ? note('Installed.') : install(ghCmd, 'copyGh'),
    ),
    signedIn = gh.kind === 'ready' && gh.accounts.length > 0,
    setUpButton = button('setupGit', 'Set it up'),
    setUp = signedIn ? `<div class="gs-btns">${setUpButton}</div>` : '',
    explain = note(
      'Lets git push to GitHub with your sign-in. This changes git’s settings for your account on this computer.',
    ),
    useBody = setup.ghForGit ? note('Pushes to GitHub use your sign-in.') : `${explain}${setUp}`,
    steps =
      gitStep +
      nameStep(setup) +
      '<p class="set-note">GitHub is optional. It keeps a copy of your prototypes online and gives you a link to share. Everything else works without it.</p>' +
      ghStep +
      signInStep(gh) +
      step(5, setup.ghForGit, 'Let git use your sign-in', useBody);
  el.innerHTML = `<p class="rl-problem">${said}</p>${steps}`;
}

function show(message: string) {
  problem = message;
  render();
}

export async function renderGitSetup() {
  render();
  const [setup, gh, gitCmd, ghCmd] = await Promise.all([
    Fenmyr.gitSetup(),
    Fenmyr.ghStatus(),
    installCommand('git'),
    installCommand('gh'),
  ]);
  found = { setup, gh, gitCmd, ghCmd };
  render();
}

const copy = (words: string | null | undefined) => navigator.clipboard.writeText(words ?? '').catch(() => {});

async function act(a: string) {
  problem = '';
  switch (a) {
    case 'check':
      return renderGitSetup();
    case 'copyGit':
      return copy(found?.gitCmd);
    case 'copyGh':
      return copy(found?.ghCmd);
    case 'editName':
      editingName = true;
      return render();
    case 'saveName': {
      const el = $('gitSetup'),
        field = (id: string) => child(el, id, HTMLInputElement);
      typed = { name: field('#gsName').value, email: field('#gsEmail').value };
      await Fenmyr.gitSetGlobalIdentity(typed.name, typed.email);
      typed = null;
      editingName = false;
      return renderGitSetup();
    }
    case 'signIn':
      signing = await Fenmyr.ghLogin();
      return render();
    case 'openGitHub':
      await copy(signing?.code);
      return signing && Fenmyr.openURL(signing.url);
    case 'cancelSignIn':
      signing = null;
      await Fenmyr.ghLoginCancel();
      return render();
    case 'setupGit':
      await Fenmyr.ghSetupGit();
      return renderGitSetup();
  }
}

// the host's ghLogin event: gh finished, one way or the other
export function ghLoginEnded(data: unknown) {
  if (!signing) return;
  signing = null;
  const ok = typeof data === 'object' && data !== null && 'ok' in data && data.ok === true,
    message = typeof data === 'object' && data !== null && 'message' in data ? String(data.message) : '';
  if (ok) chirp('Signed in to GitHub ✦', 3000);
  else problem = message;
  renderGitSetup();
}
