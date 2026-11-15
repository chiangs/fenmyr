import { $ } from '../core/dom.ts';
import { appState, session } from '../core/state.ts';
import { settings } from '../settings/settings.ts';
import { goo } from './goos.ts';

/** What Myra is busy with. Each writer holds its own job, so an answer that ends can't wipe a build's line. */
export type Busy =
  | { kind: 'thinking' }
  | { kind: 'reading'; notes: number }
  // board and name: the prototype it builds, named on the status line while another board is open
  | { kind: 'building'; board: string; name: string; file: string | null }
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
      if (session.board?.id !== b.board) return { say: `Building ${b.name}`, more: '' };
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

// a passing note, such as a build that ended on another board, said in place of the resting text
const NOTE_MS = 8000;
let note = '';
let noteT: ReturnType<typeof setTimeout> | undefined;

/** Says `text` on the status line for 8 seconds, in place of the resting text. An empty text takes the note away. */
export function noteStatus(text: string) {
  note = text;
  clearTimeout(noteT);
  noteT = setTimeout(() => {
    note = '';
    paintStatus();
  }, NOTE_MS);
  paintStatus();
}

// words only a screen reader hears, from the status line's live region, such as a build that ended on the open board,
// which shows no note
let heard = '';
let heardT: ReturnType<typeof setTimeout> | undefined;

/** Has a screen reader hear `text` from the status line, which looks as it did. */
export function noteHeard(text: string) {
  heard = text;
  clearTimeout(heardT);
  heardT = setTimeout(() => {
    heard = '';
    paintStatus();
  }, NOTE_MS);
  paintStatus();
}

/** The only writer of the header's status line, the typing dots and her thinking pose. */
export function paintStatus() {
  const all = [...jobs.values()],
    top = all.at(-1),
    line = top ? busyLine(top) : { say: note || restText(), more: '' },
    // a build runs in the background, so it shows in the header without dots or the thinking pose
    thinking = all.some(b => b.kind !== 'building'),
    typing = all.some(answersInChat),
    list = $('mcList'),
    dots = list.querySelector(':scope > .typing'),
    say = $('mcStatusSay'),
    more = $('mcStatusMore');
  if (say.textContent !== line.say + heard) {
    say.textContent = line.say;
    if (heard) {
      const h = say.appendChild(document.createElement('span'));
      h.className = 'mc-heard';
      h.textContent = heard;
    }
  }
  if (more.textContent !== line.more) more.textContent = line.more;
  $('mcStatus').classList.toggle('busy', !!top);
  // a narrow docked chat cuts the line short, as with a build named from another board
  $('mcStatus').title = line.say + line.more;
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
  // what a screen reader heard of the last job isn't news once another starts
  heard = '';
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
