import { $ } from '../core/dom.ts';
import { appState, session } from '../core/state.ts';
import type { BusyLook, HeldLook, Look } from '../gooBusy.ts';
import { settings } from '../settings/settings.ts';
import { goo } from './goos.ts';

/** What Myra is busy with. Each writer holds its own job, so an answer that ends can't wipe a build's line. */
export type Busy =
  | { kind: 'thinking' }
  | { kind: 'reading'; notes: number }
  // board and name: the prototype it builds, named on the status line while another board is open
  | { kind: 'building'; board: string; name: string; file: string | null }
  // reading a prototype's code to explain it, whose answer lands in that prototype's chat
  | { kind: 'explaining'; board: string; name: string }
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
    case 'explaining':
      // as short as a build's words, so they fit the header where those do
      return { say: session.board?.id === b.board ? 'Reading the code' : `Reading ${b.name}`, more: '' };
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

// her look for each kind of work, which the newest job running gives her
const LOOK: Record<Busy['kind'], BusyLook> = {
  thinking: 'thinking',
  reading: 'reading',
  building: 'building',
  explaining: 'explaining',
  pictures: 'painting',
  rewriting: 'writing',
};

// a build, an explanation and a rewrite can answer outside the open chat, so they show no typing dots there
const answersInChat = (b: Busy) => b.kind !== 'building' && b.kind !== 'explaining' && b.kind !== 'rewriting';

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
let looked: Look | null = null;
// what the person has in hand, which she mirrors when no work gives her a look; the first in HELD that is held wins
const held = new Set<HeldLook>();
const HELD: HeldLook[] = ['palette', 'magnifier', 'clipboard'];

/** The person has picked up (on) or put down a tool she keeps them company with. */
export function hold(look: HeldLook, on: boolean) {
  if (on === held.has(look)) return;
  if (on) held.add(look);
  else held.delete(look);
  paintStatus();
}

// a passing note, such as a build that ended on another board, said in place of the resting text
const NOTE_MS = 8000;
let note = '';
let noteT: ReturnType<typeof setTimeout> | undefined;

/** Says `text` on the status line for 8 seconds, in place of the resting text. An empty text takes the note away. */
export function noteStatus(text: string) {
  note = text;
  // what a screen reader heard before it, such as a build starting, isn't news once the note says how it ended
  heard = '';
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

/** The only writer of the header's status line, the typing dots and her look while she works. */
export function paintStatus() {
  const all = [...jobs.values()],
    top = all.at(-1),
    // a note that a build ended keeps the line for its 8 seconds even when a waiting build starts straight after, and
    // that build's line follows
    shown = note && top?.kind === 'building' ? undefined : top,
    line = shown ? busyLine(shown) : { say: note || restText(), more: '' },
    // a build and an explanation run in the background, so they show in the header without dots, and the rest of the
    // app doesn't count them as her answering
    thinking = all.some(b => b.kind !== 'building' && b.kind !== 'explaining'),
    look = top ? LOOK[top.kind] : (HELD.find(h => held.has(h)) ?? null),
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
  }
  if (look !== looked) {
    looked = look;
    goo.busy(look);
  }
  if (typing && !dots) {
    const d = document.createElement('div');
    d.className = 'mc-msg myra typing';
    d.innerHTML = '<i></i><i></i><i></i>';
    list.appendChild(d);
    list.scrollTop = list.scrollHeight;
  } else if (!typing) dots?.remove();
}

/** True while any job runs, in the open chat or in the background. */
export const working = () => jobs.size > 0;

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
