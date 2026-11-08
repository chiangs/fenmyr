import { $ } from '../core/dom.ts';
import { appState } from '../core/state.ts';
import { settings } from '../settings/settings.ts';
import { goo } from './goos.ts';

/** What Myra is busy with. Each writer holds its own job, so an answer that ends can't wipe a build's line. */
export type Busy =
  | { kind: 'thinking' }
  | { kind: 'reading'; notes: number }
  | { kind: 'building'; file: string | null }
  | { kind: 'pictures'; n: number }
  | { kind: 'rewriting' };

export type Job = { show(b: Busy): void; end(): void };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// `say` is announced to screen readers; `more` changes too often to announce, like each file a build writes
type Line = { say: string; more: string };

function busyLine(b: Busy): Line {
  switch (b.kind) {
    case 'thinking':
      return { say: 'Thinking…', more: '' };
    case 'reading':
      return { say: `Reading ${plural(b.notes, 'note', 'notes')}`, more: '' };
    case 'building':
      return { say: 'Building', more: b.file ? ` ${b.file}` : '' };
    case 'pictures':
      return { say: `Making ${plural(b.n, 'picture', 'pictures')}`, more: '' };
    case 'rewriting':
      return { say: 'Rewriting…', more: '' };
    default: {
      const never: never = b;
      throw new Error(`unknown status ${String(never)}`);
    }
  }
}

// a build and a rewrite answer outside the chat, so they show no typing dots there
const answersInChat = (b: Busy) => b.kind !== 'building' && b.kind !== 'rewriting';

// Claude Code turned down the last question for want of signing in; only a later answer shows it is signed in
let signedOut = false;

/** Records whether Claude Code needs signing in, as the last question found. */
export function noteSignIn(needed: boolean) {
  signedOut = needed;
  paintStatus();
}

// at rest the line says whether she can think right now
const restText = () =>
  Fenmyr.web || !settings.ai
    ? 'Thinking is off'
    : appState.haveClaude === false
      ? 'Needs Claude Code'
      : signedOut
        ? 'Not signed in'
        : navigator.onLine
          ? 'Ready'
          : 'Offline';

// in start order; the newest running job is the one the header names
const jobs = new Map<symbol, Busy>();
let posed = false;

/** The only writer of the header's status line, the typing dots and her thinking pose. */
export function paintStatus() {
  const all = [...jobs.values()],
    top = all.at(-1),
    line = top ? busyLine(top) : { say: restText(), more: '' },
    // a build runs in the background, so it shows in the header without dots or the thinking pose
    thinking = all.some(b => b.kind !== 'building'),
    typing = all.some(answersInChat),
    list = $('mcList'),
    dots = list.querySelector(':scope > .typing'),
    say = $('mcStatusSay'),
    more = $('mcStatusMore');
  if (say.textContent !== line.say) say.textContent = line.say;
  if (more.textContent !== line.more) more.textContent = line.more;
  $('mcStatus').classList.toggle('busy', !!top);
  if (thinking !== posed) {
    posed = thinking;
    $('myra').classList.toggle('thinking', thinking);
    goo.think(thinking);
  }
  if (typing && !dots) {
    const d = document.createElement('div');
    d.className = 'mc-msg myra typing';
    d.innerHTML = '<i></i><i></i><i></i>';
    list.appendChild(d);
    list.scrollTop = list.scrollHeight;
  } else if (!typing) dots?.remove();
}

export function startJob(b: Busy): Job {
  const id = Symbol('job');
  jobs.set(id, b);
  paintStatus();
  return {
    // keeps its place in the order; once ended it stays ended
    show: next => {
      if (!jobs.has(id)) return;
      jobs.set(id, next);
      paintStatus();
    },
    end: () => {
      if (jobs.delete(id)) paintStatus();
    },
  };
}

export function initStatus() {
  addEventListener('online', paintStatus);
  addEventListener('offline', paintStatus);
  paintStatus();
}
