import { $ } from '../core/dom.ts';
import { appState } from '../core/state.ts';
import { settings } from '../settings/settings.ts';
import { goo } from './goos.ts';

/** What Myra is busy with. Each writer holds its own job, so an answer that ends can't wipe a build's line. */
export type Busy =
  | { kind: 'thinking' }
  | { kind: 'reading'; notes: number }
  | { kind: 'building'; file: string | null }
  | { kind: 'pictures'; n: number };

export type Job = { show(b: Busy): void; end(): void };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function busyText(b: Busy): string {
  switch (b.kind) {
    case 'thinking':
      return 'Thinking…';
    case 'reading':
      return `Reading ${plural(b.notes, 'note', 'notes')}`;
    case 'building':
      return b.file ? `Building ${b.file}` : 'Building';
    case 'pictures':
      return `Making ${plural(b.n, 'picture', 'pictures')}`;
    default: {
      const never: never = b;
      throw new Error(`unknown status ${String(never)}`);
    }
  }
}

// at rest the line says whether she can think right now
const restText = () =>
  Fenmyr.web || !settings.ai
    ? 'Thinking is off'
    : appState.haveClaude === false
      ? 'Needs Claude Code'
      : navigator.onLine
        ? 'Ready'
        : 'Offline';

// in start order; the newest running job is the one the header names
const jobs = new Map<symbol, Busy>();
let posed = false;

/** The only writer of the header's status line, the typing dots and her thinking pose. */
export function paintStatus() {
  const top = [...jobs.values()].at(-1),
    el = $('mcStatus'),
    text = top ? busyText(top) : restText(),
    // a build runs in the background, so it shows in the header without dots or the thinking pose
    thinking = [...jobs.values()].some(b => b.kind !== 'building'),
    list = $('mcList'),
    dots = list.querySelector(':scope > .typing');
  if (el.textContent !== text) el.textContent = text;
  el.classList.toggle('busy', !!top);
  if (thinking !== posed) {
    posed = thinking;
    $('myra').classList.toggle('thinking', thinking);
    goo.think(thinking);
  }
  if (thinking && !dots) {
    const d = document.createElement('div');
    d.className = 'mc-msg myra typing';
    d.innerHTML = '<i></i><i></i><i></i>';
    list.appendChild(d);
    list.scrollTop = list.scrollHeight;
  } else if (!thinking) dots?.remove();
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
