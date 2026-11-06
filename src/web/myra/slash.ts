import { session } from '../core/state.ts';
import { timer } from '../features/timer.ts';
import { closestTo, esc, textField } from '../ui/dom.ts';
import { ANIMS } from './anim.ts';
import { addMsg } from './chatLog.ts';
import { chatOpen, myraOpen } from './chatWindow.ts';
import type { SlashEntry } from './greet.ts';
import { helpText, SLASH } from './greet.ts';
import { reply } from './say.ts';

type TextBox = HTMLInputElement | HTMLTextAreaElement;
// one row of the slash menu: fill puts ready-made words in the box; cmd is a command to start
type SlashRow = { key: string; title: string; desc: string; fill?: string; cmd?: SlashEntry };

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

let slashSel = 0;
let slashMenu: HTMLElement;

export const hideSlash = () => {
  slashMenu.hidden = true;
};

// the menu lists commands; typing just /timer lists ready-made timers instead
const TIMER_PRESETS = [
  { fill: '/timer 15 break', title: '15 min break', desc: 'A short break' },
  { fill: '/timer 50 focus', title: '50 min focus', desc: 'A long stretch of focus' },
  { fill: '/timer 5 breather', title: '5 min breather', desc: 'Stand up, look away, stretch' },
];

const slashMatches = (el: TextBox): SlashRow[] => {
  if (/^\/timer\s*$/i.test(el.value) && !timer)
    return TIMER_PRESETS.map(p => {
      const name = esc(p.title);
      return { key: p.fill, title: `<b>/timer</b> ${name}`, desc: p.desc, fill: p.fill };
    });
  if (/^\/animate\s*$/i.test(el.value))
    return [
      { key: '/animate', title: '<b>/animate</b> Surprise me', desc: 'A random one', fill: '/animate' },
      ...ANIMS.map(a => ({
        key: `/animate ${a.name}`,
        title: `<b>/animate</b> ${a.name}`,
        desc: a.desc,
        fill: `/animate ${a.name}`,
      })),
    ];
  const typed = /^\/(\w*)$/.exec(el.value)?.[1];
  if (typed === undefined) return [];
  return SLASH.filter(c => c.cmd.startsWith(typed.toLowerCase())).map(c => {
    const words = esc(c.arg),
      arg = c.arg ? ` <i>${words}</i>` : '';
    return { key: c.cmd, title: `<b>/${c.cmd}${arg}</b>`, desc: c.desc, cmd: c };
  });
};

function showSlash(el: TextBox) {
  const list = slashMatches(el);
  if (!list.length) return hideSlash();
  slashSel = Math.min(slashSel, list.length - 1);
  slashMenu.innerHTML = list
    .map((c, i) => {
      const key = esc(c.key),
        on = i === slashSel ? 'on' : '',
        desc = esc(c.desc);
      return `<button type="button" data-key="${key}" class="${on}">${c.title}<span>${desc}</span></button>`;
    })
    .join('');
  const r = (el.closest('form') || el).getBoundingClientRect();
  slashMenu.hidden = false;
  slashMenu.style.left = `${r.left}px`;
  slashMenu.style.width = `${Math.max(260, r.width)}px`;
  slashMenu.style.bottom = `${innerHeight - r.top + 6}px`;
  slashMenu.dataset.for = el.id;
}

function pickSlash(key: string) {
  const el = textField(slashMenu.dataset.for ?? ''),
    it = slashMatches(el).find(x => x.key === key);
  hideSlash();
  if (!it) return;
  if (it.fill) {
    el.value = it.fill;
    el.closest('form')?.requestSubmit();
    return;
  }
  const c = it.cmd;
  if (!c) return;
  el.value = `/${c.cmd}${c.arg ? ' ' : ''}`;
  el.focus();
  el.setSelectionRange(el.value.length, el.value.length);
  if (!c.arg) el.closest('form')?.requestSubmit();
  else {
    slashSel = 0;
    showSlash(el);
  } // /timer then lists its ready-made timers
}

export function initSlashMenu() {
  slashMenu = document.createElement('div');
  slashMenu.className = 'slash-menu';
  slashMenu.hidden = true;
  document.body.appendChild(slashMenu);

  slashMenu.addEventListener('pointerdown', e => e.preventDefault());
  // keep the focus in the box
  slashMenu.onclick = e => {
    const b = closestTo(e.target, '[data-key]');
    if (b) pickSlash(b.dataset.key ?? '');
  };

  ['mInput', 'mcInput'].forEach(id => {
    const el = textField(id);
    el.addEventListener('input', () => {
      slashSel = 0;
      showSlash(el);
    });
    el.addEventListener('blur', () =>
      setTimeout(() => {
        if (document.activeElement !== el) hideSlash();
      }, 120),
    ); // (not if it has the cursor again by then)
    el.addEventListener(
      'keydown',
      e => {
        if (!(e instanceof KeyboardEvent) || slashMenu.hidden || slashMenu.dataset.for !== id) return;
        const list = slashMatches(el);
        if (e.key === 'Escape') {
          e.stopImmediatePropagation();
          e.preventDefault();
          return hideSlash();
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopImmediatePropagation();
          slashSel = (slashSel + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length;
          return showSlash(el);
        }
        const row = list[slashSel],
          cmd = row?.cmd,
          // Enter on a finished command with nothing to add sends it as typed
          typedOut = e.key === 'Enter' && cmd && el.value.slice(1).toLowerCase() === cmd.cmd && !cmd.arg;
        if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey && row && !typedOut) {
          e.preventDefault();
          e.stopImmediatePropagation();
          pickSlash(row.key);
        }
      },
      true,
    );
  });
}
