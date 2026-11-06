import { session } from '../core/state.ts';
import { timer } from '../features/timer.ts';
import { closestTo, elementById, esc } from '../ui/dom.ts';
import { ANIMS } from './anim.ts';
import { setChatText } from './chatInput.ts';
import type { BoxState, MenuKey } from './chatKeys.ts';
import { addMsg } from './chatLog.ts';
import { chatOpen, myraOpen } from './chatWindow.ts';
import { helpText, SLASH, SLASH_GROUPS, type SlashEntry } from './greet.ts';
import { reply } from './say.ts';

// one row of the menu: a command to start, or ready-made words (a /timer preset, an /animate name)
type SlashRow = { key: string; title: string; desc: string } & (
  | { kind: 'cmd'; cmd: SlashEntry }
  | { kind: 'fill'; fill: string }
);

const box = () => elementById('mcInput', HTMLTextAreaElement);

export function slash(text: string) {
  if (!session.board) return;
  if (!chatOpen()) myraOpen(true);
  const m = /^\/(\w*)\s*(.*)$/s.exec(text.trim()),
    name = m?.[1] ?? '',
    c = m && SLASH.find(x => x.cmd === name.toLowerCase());
  if (!c) {
    addMsg('me', text);
    return reply(helpText(`I don't know /${name}. Here is what I can do:`));
  }
  if (!c.quiet) addMsg('me', text);
  c.run(m?.[2] ?? '');
}

let sel = 0;
let menu: HTMLElement;

const hide = () => {
  menu.hidden = true;
};

// what the keys see: the menu open, a whole command on one line (/find cloud, or /tidy after Esc), or anything else
export function boxState(value: string): BoxState {
  if (!menu.hidden) return 'menu';
  const name = /^\/(\w+)(\s|$)/.exec(value)?.[1]?.toLowerCase();
  return !value.includes('\n') && SLASH.some(c => c.cmd === name) ? 'command' : 'text';
}

export function menuKey(k: MenuKey) {
  switch (k.type) {
    case 'move': {
      const n = rows(box().value).length;
      sel = (sel + k.by + n) % n;
      return show();
    }
    case 'pick':
      return pick(k.how, rows(box().value)[sel]);
    case 'close':
      return hide();
    default: {
      const unhandled: never = k;
      return unhandled;
    }
  }
}

// typing just /timer lists ready-made timers instead of commands
const TIMER_PRESETS = [
  { fill: '/timer 15 break', title: '15 min break', desc: 'A short break' },
  { fill: '/timer 50 focus', title: '50 min focus', desc: 'A long stretch of focus' },
  { fill: '/timer 5 breather', title: '5 min breather', desc: 'Stand up, look away, stretch' },
];

const GROUP_ORDER = Object.keys(SLASH_GROUPS);

function rows(value: string): SlashRow[] {
  if (/^\/timer *$/i.test(value) && !timer)
    return TIMER_PRESETS.map((p): SlashRow => {
      const name = esc(p.title);
      return { kind: 'fill', key: p.fill, title: `<b>/timer</b> ${name}`, desc: p.desc, fill: p.fill };
    });
  if (/^\/animate *$/i.test(value))
    return [
      { kind: 'fill', key: '/animate', title: '<b>/animate</b> Surprise me', desc: 'A random one', fill: '/animate' },
      ...ANIMS.map(
        (a): SlashRow => ({
          kind: 'fill',
          key: `/animate ${a.name}`,
          title: `<b>/animate</b> ${a.name}`,
          desc: a.desc,
          fill: `/animate ${a.name}`,
        }),
      ),
    ];
  const typed = /^\/(\w*)$/.exec(value)?.[1];
  if (typed === undefined) return [];
  // a stable sort, so the registry's order holds inside each group
  return SLASH.filter(c => c.cmd.startsWith(typed.toLowerCase()))
    .sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group))
    .map((c): SlashRow => {
      const words = esc(c.arg),
        arg = c.arg ? ` <i>${words}</i>` : '';
      return { kind: 'cmd', key: c.cmd, title: `<b>/${c.cmd}${arg}</b>`, desc: c.desc, cmd: c };
    });
}

// the group's name above its first command; ready-made rows have no group, so their list has no headers
function groupHead(r: SlashRow, prev: SlashRow | undefined) {
  if (r.kind !== 'cmd' || (prev?.kind === 'cmd' && prev.cmd.group === r.cmd.group)) return '';
  const label = SLASH_GROUPS[r.cmd.group];
  return `<div class="slash-group">${label}</div>`;
}

function show() {
  const el = box(),
    list = rows(el.value);
  if (!list.length) return hide();
  sel = Math.min(sel, list.length - 1);
  menu.innerHTML = list
    .map((r, i) => {
      const head = groupHead(r, list[i - 1]),
        key = esc(r.key),
        on = i === sel ? 'on' : '',
        title = r.title,
        desc = esc(r.desc);
      return `${head}<button type="button" data-key="${key}" class="${on}">${title}<span title="${desc}">${desc}</span></button>`;
    })
    .join('');
  const f = (el.form ?? el).getBoundingClientRect();
  menu.hidden = false;
  menu.style.left = `${f.left}px`;
  menu.style.width = `${Math.max(260, f.width)}px`;
  menu.style.bottom = `${innerHeight - f.top + 6}px`;
}

// run is Enter and a click, fill is Tab. A command that takes words gets "/cmd " either way and waits for them; the
// input event that brings shows what comes next, such as /timer's presets.
function pick(how: 'run' | 'fill', r: SlashRow | undefined) {
  hide();
  if (!r) return;
  const run = () => box().form?.requestSubmit();
  switch (r.kind) {
    case 'fill':
      setChatText(r.fill);
      if (how === 'run') run();
      return;
    case 'cmd':
      setChatText(`/${r.cmd.cmd}${r.cmd.arg ? ' ' : ''}`);
      if (how === 'run' && !r.cmd.arg) run();
      return;
    default: {
      const unhandled: never = r;
      return unhandled;
    }
  }
}

export function initSlashMenu() {
  menu = document.createElement('div');
  menu.className = 'slash-menu';
  menu.hidden = true;
  document.body.appendChild(menu);
  // keep the focus in the box
  menu.addEventListener('pointerdown', e => e.preventDefault());
  menu.onclick = e => {
    const key = closestTo(e.target, '[data-key]')?.dataset.key;
    if (key !== undefined)
      pick(
        'run',
        rows(box().value).find(r => r.key === key),
      );
  };
  const el = box();
  el.addEventListener('input', () => {
    sel = 0;
    show();
  });
  // not if it has the cursor again by then
  el.addEventListener('blur', () =>
    setTimeout(() => {
      if (document.activeElement !== el) hide();
    }, 120),
  );
}
