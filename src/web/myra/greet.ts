// @ts-nocheck
import { fit } from '../canvas/handles.ts';
import { applyView } from '../canvas/view.ts';
import { $ } from '../core/dom.ts';
import { DUE_KEY, dueAnnounce, dueDate, dueHeld, dueJump, dueText, lsRead, slashDue } from '../features/due.ts';
import { slashFind, slashTag } from '../features/find.ts';
import { slashTimer } from '../features/timer.ts';
import { ANIMS, slashAnimate } from './anim.ts';
import { bdNow, dayKey, slashBirthday } from './birthday.ts';
import { tidyNotes } from './chat.ts';
import { glideView, zoomFit } from '../panels/zoomMenu.ts';
import { reply, say } from '../settings/licenses.ts';
import { settings } from '../settings/settings.ts';
import { appState, session } from '../core/state.ts';

// ---------- Myra's greeting: a small registry, so a feature can add a line to it without its own timer ----------
// greeter(id, order, ctx => ({ text, acts? }) | null): lines are quick and read only what is already in memory (never scan boards). greet() runs when the app opens, and again on the first focus after midnight.
// ctx: { why: 'start' | 'newday', firstToday: true on the first greeting of a calendar day, now: Date, name }. daily(id) is true once per calendar day, for anything that should only be said once a day.
const GREETERS = [];
export const greeter = (id, order, line) => GREETERS.push({ id, order, line });

export function daily(id) {
  const k = 'fenmyr:daily:' + id,
    t = dayKey(bdNow());
  try {
    if (localStorage.getItem(k) === t) return false;
    localStorage.setItem(k, t);
  } catch (e) {}
  return true;
}

let greetDay = '';

export function greet(why) {
  const ctx = { why, firstToday: daily('open'), now: bdNow(), name: settings.name || '' };
  greetDay = dayKey(ctx.now);
  const lines = [];
  GREETERS.slice()
    .sort((a, b) => a.order - b.order)
    .forEach(g => {
      try {
        const l = g.line(ctx);
        if (l && l.text) lines.push(l);
      } catch (e) {}
    });
  const shown = settings.greet && settings.chat !== 'quiet' && lines.length;
  if (shown)
    say(
      lines
        .slice(0, 3)
        .map(l => l.text)
        .join('\n'),
      9000,
      lines.find(l => l.acts)?.acts || [],
      true,
    );
  setTimeout(
    () => {
      appState.dueHold = false;
      if (dueHeld.length) {
        const its = dueHeld.splice(0);
        dueAnnounce(its);
      }
    },
    shown ? 10000 : 0,
  ); // what came due while the app was closed is said after the greeting, not over it
}
export let SLASH;

export const helpText = (lead = 'Here is what I can do right here, no thinking needed:') =>
  lead +
  '\n' +
  SLASH.filter(c => c.cmd !== 'help' && !c.dev)
    .map(c => `/${c.cmd}${c.arg ? ' ' + c.arg : ''}  ${c.desc}`)
    .join('\n') +
  '\nAsk me anything else in your own words ✦';

export const wordsOf = c =>
  [
    c.text,
    c.name,
    c.label,
    c.title,
    ...(c.items || []).map(i => i.t),
    ...(c.tags || []).map(t => '#' + t),
    String(c.body || '').replace(/<[^>]+>/g, ' '),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

export function glideTo(cs) {
  const from = { ...session.view };
  fit(cs, 200, 1.2);
  const to = { ...session.view };
  Object.assign(session.view, from);
  applyView();
  glideView(to);
}
export function init33() {
  addEventListener('focus', () => {
    if (greetDay && dayKey(bdNow()) !== greetDay) greet('newday');
  });
  // the first focus after midnight
  greeter('hello', 0, c =>
    c.why === 'start'
      ? { text: `Hi${c.name ? ' ' + c.name : ''}, it's Myra! Dump ideas with ⌘K, then ask me to sort them ✦` }
      : null,
  );

  greeter('due', 10, c => {
    // what is still due today
    if (!c.firstToday) return null;
    const day = d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
      its = Object.values(lsRead(DUE_KEY, {}))
        .filter(it => {
          const t = dueDate(it.d);
          return t && t >= c.now && day(t) === day(c.now);
        })
        .sort((a, b) => a.t - b.t);
    if (!its.length) return null;
    const bit = it =>
      `“${it.n.slice(0, 40)}” ${it.d.length > 10 ? 'at ' + dueText(it.d).split(' · ')[1] : 'by tonight'}`;
    return {
      text: `${c.why === 'newday' ? `Good morning${c.name ? ' ' + c.name : ''}! ` : ''}Due today: ${its.slice(0, 3).map(bit).join(', ')}${its.length > 3 ? ` and ${its.length - 3} more` : ''} ✦`,
      acts: [{ label: 'Show me', run: () => dueJump(its[0]) }],
    };
  });

  SLASH = [
    // every command here is handed to Myra in her instructions (see snapshot()), so a new one only needs a desc (and an ex / opts if they help her explain it)
    { cmd: 'find', arg: '<words>', desc: 'Find cards that mention something', ex: '/find berries', run: slashFind },
    { cmd: 'tag', arg: '<tag>', desc: 'Show the cards with a tag', ex: '/tag food', run: slashTag },
    {
      cmd: 'tidy',
      desc: 'Line the loose notes up in rows',
      run: () => {
        const n = tidyNotes();
        reply(n ? `Lined ${n} notes up in tidy rows ✦` : 'No loose notes to tidy ✦');
      },
    },
    {
      cmd: 'due',
      arg: '[overdue|today]',
      desc: 'List what is overdue and coming up, on every board (/due overdue for the late ones, /due today for today)',
      ex: ['/due', '/due overdue', '/due today'],
      opts: ['overdue', 'today'],
      run: a => slashDue(a),
    },
    {
      cmd: 'fit',
      desc: 'Zoom to see everything',
      run: () => {
        zoomFit();
        reply('Everything is in view ✦');
      },
    },
    {
      cmd: 'timer',
      arg: '<minutes> <purpose>',
      desc: 'A timer; the purpose is optional (/timer stop cancels, /timer alone shows the time left)',
      ex: ['/timer 25 write the intro', '/timer 2m10s tea', '/timer 1h30'],
      opts: ['15 break', '50 focus', '5 breather'],
      run: slashTimer,
    },
    {
      cmd: 'birthday',
      desc: '(demo, temporary) play the birthday celebration; /birthday belated plays the belated one',
      dev: true,
      run: a => slashBirthday(a),
    },
    {
      cmd: 'animate',
      arg: '<name>',
      desc: 'Make me move: a surprise, or pick one',
      ex: '/animate love',
      get opts() {
        return ANIMS.map(a => a.name);
      },
      run: slashAnimate,
    },
    { cmd: 'clear', desc: 'Start a fresh chat', run: () => $('mcNew').click(), quiet: true },
    { cmd: 'help', desc: 'What I can do without thinking', run: () => reply(helpText()) },
  ];
}
