import { isRecord } from '../../shared/model.ts';
import { $ } from '../core/dom.ts';
import { appState } from '../core/state.ts';
import type { Pose } from '../goo.ts';
import { relayout } from '../myra/chatWindow.ts';
import { goo, hopMyra } from '../myra/goos.ts';
import { gooSlot } from '../myra/perch.ts';
import { noEmoji, parse } from '../myra/replyText.ts';
import type { SayAction } from '../myra/say.ts';
import { reply } from '../myra/say.ts';
import { snapshot } from '../myra/snapshot.ts';
import { settings } from '../settings/settings.ts';
import { durText, parseTimer } from './duration.ts';

type Kind = 'break' | 'focus';
// end: when it runs out; warned: the two-minute warning was given; kind: decided by the model at the warning
type Timer = { end: number; secs: number; purpose: string; warned: boolean; kind?: Kind };
export type TimerAsk = { secs: number; purpose: string };
export type TimerRequest = { stop: true } | { status: true } | TimerAsk;
export type TimerLine = { say: string | null; kind: Kind | null } | null;

// a timer left running when Fenmyr closed, as it was saved
function readTimer(raw: unknown): Timer | null {
  if (!isRecord(raw) || typeof raw.end !== 'number' || !raw.end) return null;
  const secs =
    typeof raw.secs === 'number' ? raw.secs : Math.round((typeof raw.minutes === 'number' ? raw.minutes : 1) * 60);
  const t: Timer = {
    end: raw.end,
    secs,
    purpose: typeof raw.purpose === 'string' ? raw.purpose : '',
    warned: raw.warned === true,
  };
  if (raw.kind === 'break' || raw.kind === 'focus') t.kind = raw.kind;
  return t;
}

// ---------- the timer: /timer 25 write the intro. It counts down by the clock (so it survives sleep, restarts and switching boards), warns at two minutes, and Myra makes a fuss when it's up ----------
const TIMER_KEY = 'fenmyr:timer';

export let timer: Timer | null = null;

const saveTimer = () => {
  try {
    if (timer) localStorage.setItem(TIMER_KEY, JSON.stringify(timer));
    else localStorage.removeItem(TIMER_KEY);
  } catch (_e) {}
};

const clock = (ms: number) => {
  const t = Math.max(0, Math.ceil(ms / 1000)),
    h = Math.floor(t / 3600),
    m = Math.floor((t % 3600) / 60),
    sec = t % 60,
    p = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`;
};

const timerWhat = (t: Timer) => t.purpose || `your ${durText(t.secs)} timer`;

// what the glow says when it runs out: red for work and focus, green for a break. With thinking on the model decides (t.kind, from its warning), otherwise a break or a breather is green and everything else is red
const timerKind = (t: Timer): Kind =>
  t.kind ||
  (/\b(break(?!\s*(down|through|into|up|out|in|open)\b)|breather)\b/i.test(t.purpose || '') ? 'break' : 'focus');
// 'break', 'coffee break', 'quick breather'; not 'break down the plan'
// her faces follow the timer: sleepy through a break, shook in the last two minutes, and after a focus timer ends she sighs until you answer
let glowT: ReturnType<typeof setTimeout> | undefined;
let sighing = false;
export let currentPose: Pose | null = null;

export const setPose = (p: Pose | null) => {
  if (p !== currentPose) {
    currentPose = p;
    goo.pose(p);
  }
};

export const timerPose = (): Pose | null =>
  sighing
    ? 'sigh'
    : timer && timer.secs >= 180 && timer.end - Date.now() <= 120000
      ? 'shook'
      : timer && timerKind(timer) === 'break'
        ? 'sleepy'
        : null;
// a face she was asked to make (/animate, plain words); the timer's own faces win
export const wantedPose = () => timerPose() || appState.animPose;

export const clearGlow = () => {
  clearTimeout(glowT);
  sighing = false;
  $('mPill').classList.remove('glow-red', 'glow-green');
  setPose(wantedPose());
};

const setGlow = (kind: Kind) => {
  clearGlow();
  $('mPill').classList.add(kind === 'break' ? 'glow-green' : 'glow-red');
  glowT = setTimeout(clearGlow, 120000);
};

function paintTimer() {
  const chip = $('timerChip');
  $('myra').classList.toggle('timing', !!timer);
  if (chip.hidden === !!timer) {
    chip.hidden = !timer;
    relayout(); // the open chat makes room for the chip over it, or takes it back
  }
  if (!timer) {
    $('mPill').classList.remove('hurry');
    setPose(wantedPose());
    return;
  }
  $('tcTime').textContent = clock(timer.end - Date.now());
  $('tcWhat').textContent = timer.purpose || durText(timer.secs);
  chip.style.setProperty('--left', String(Math.max(0, Math.min(1, (timer.end - Date.now()) / (timer.secs * 1000)))));
  $('mPill').classList.toggle('hurry', timer.secs >= 180 && timer.end - Date.now() <= 120000);
  setPose(wantedPose());
}

export function startTimer(t: TimerAsk, replace = false, quiet = false): void {
  if (timer && !replace) {
    reply(`You already have ${clock(timer.end - Date.now())} left on ${timerWhat(timer)}. Start this one instead?`, 0, [
      { label: 'Replace it', cls: 'next', run: () => startTimer(t, true) },
      { label: 'Keep it', ghost: true, run: () => {} },
    ]);
    return;
  }
  clearGlow();
  timer = { end: Date.now() + t.secs * 1000, secs: t.secs, purpose: t.purpose, warned: t.secs < 180 };
  saveTimer();
  paintTimer();
  hopMyra();
  if (!quiet)
    reply(`Timer set: ${durText(t.secs)}${t.purpose ? ` (${t.purpose})` : ''}. I'll tell you when it's time ✦`);
}

export function stopTimer(say = true) {
  if (!timer) {
    if (say) reply('No timer is running ✦');
    return;
  }
  const t = timer;
  timer = null;
  saveTimer();
  paintTimer();
  if (say) reply(`Stopped the timer for ${timerWhat(t)} ✦`);
}

// a plain sentence asked for a timer (or to stop it, or how long is left)
export function runTimerRequest(tr: TimerRequest, say?: boolean) {
  if ('stop' in tr) {
    stopTimer(!!say);
    return 'stopped the timer';
  }
  if ('status' in tr) {
    slashTimer('');
    return 'told them how much time is left';
  }
  startTimer({ secs: tr.secs, purpose: tr.purpose }, false, !say);
  return `set a timer for ${durText(tr.secs)}${tr.purpose ? ` (${tr.purpose})` : ''}`;
}

export function slashTimer(arg?: string) {
  const a = (arg || '').trim();
  if (/^(stop|cancel|off|clear)$/i.test(a)) return stopTimer();
  if (!a) {
    reply(
      timer
        ? `${clock(timer.end - Date.now())} left on ${timerWhat(timer)}. /timer stop cancels it ✦`
        : 'Try /timer 25 write the intro, or pick a ready-made one from the list when you type /timer ✦',
    );
    return;
  }
  const t = parseTimer(a);
  if (!t) {
    reply('I need a time first, like /timer 25 write the intro (or 1h30, 2m10s, 69 seconds) ✦');
    return;
  }
  startTimer(t);
}

// with thinking on, one short model call gives the warning and the finish a line that fits what you're doing (the plain line shows first and is replaced if it arrives in time)
async function timerLine(kind: 'warn' | 'done', t: Timer): Promise<TimerLine> {
  if (window.__timerLineStub) return window.__timerLineStub(kind, t); // (tests)
  if (Fenmyr.web || !settings.ai || appState.haveClaude === false || !navigator.onLine) return null;
  const what = `timer of ${durText(t.secs)}${t.purpose ? ` for "${t.purpose}"` : ''}`;
  const prompt = `(This is a timer notice, not a request. The person's ${what} ${kind === 'warn' ? 'has two minutes left' : 'has just run out'}. Say one short line in your own voice that fits what they are doing${kind === 'warn' ? '' : ', and if it fits suggest what comes next, like a break after focus time or getting back to it after a break'}. Do not change the board. Also add a "kind" field: "break" if the timer is for rest or a pause, "focus" if it is for work or concentration.)`;
  try {
    const raw = await Promise.race([
      Fenmyr.ask(
        prompt,
        { ...snapshot(), cards: [], links: [], unsorted: [], recentChat: [], commands: undefined },
        false,
        { mobbin: false, higgs: false, web: false, canVault: false, vaultNotes: [] },
      ),
      new Promise((_, no) => setTimeout(() => no(new Error('slow')), 12000)),
    ]);
    const r = parse(raw);
    return { say: r.say || null, kind: r.kind === 'break' || r.kind === 'focus' ? r.kind : null };
  } catch (_e) {
    return null;
  }
}

export const osNotify = (title: string, body: string) => {
  if (Fenmyr.web || document.hasFocus() || typeof Notification === 'undefined') return;
  try {
    new Notification(title, { body });
  } catch (_e) {}
};

const CONFETTI = ['#f2a339', '#e07a5f', '#ffdcd8', '#e0edd3', '#d9e7f3', '#ebe1f2'];

// when it's up: she hops, her pill wiggles and berry confetti bursts out (calmer if she is set to calm, nothing at all if calmest)
export function partyMyra(force?: boolean) {
  if (window.myraMuted && !force) return;
  hopMyra();
  if ((window.myraCalm && !force) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let n = 0;
  const iv = setInterval(() => {
    hopMyra();
    if (++n >= 5) clearInterval(iv);
  }, 520);
  const my = $('myra');
  my.classList.add('partying');
  setTimeout(() => my.classList.remove('partying'), 3400);
  const sr = gooSlot.getBoundingClientRect(),
    mr = $('myra').getBoundingClientRect(),
    ox = Math.round(sr.left + sr.width / 2 - mr.left),
    oy = Math.round(sr.top + sr.height * 0.45 - mr.top); // from where she is: her button, or the chat when she is perched there
  for (let i = 0; i < 26; i++) {
    const c = document.createElement('i'),
      a = ((Math.random() * 160 - 80) * Math.PI) / 180,
      d = 90 + Math.random() * 150;
    c.className = 'confetti';
    c.style.cssText = `--dx:${Math.round(Math.sin(a) * d)}px;--dy:${-Math.round(Math.cos(a) * d + 20)}px;--rot:${Math.round(Math.random() * 720 - 360)}deg;--c:${CONFETTI[i % CONFETTI.length]};animation-delay:${Math.round(Math.random() * 300)}ms`;
    c.style.left = `${ox}px`;
    c.style.top = `${oy}px`;
    c.style.bottom = 'auto';
    $('myra').appendChild(c);
    setTimeout(() => c.remove(), 2400);
  }
}

async function timerWarn() {
  const t = timer;
  if (!t) return;
  t.warned = true;
  saveTimer();
  hopMyra();
  const plain = `Two minutes left${t.purpose ? ` (${t.purpose})` : ''} ✦`;
  reply(plain, 20000);
  osNotify('Two minutes left', t.purpose || `${durText(t.secs)} timer`);
  const r = await timerLine('warn', t);
  if (r?.kind && timer === t) {
    t.kind = r.kind;
    saveTimer();
  }
  if (r?.say && timer === t) reply(noEmoji(r.say), 20000);
}

async function timerDone() {
  const t = timer;
  if (!t) return;
  timer = null;
  saveTimer();
  paintTimer();
  const plain = `Time's up! ${durText(t.secs)}${t.purpose ? ` (${t.purpose})` : ''} ✦`,
    acts: SayAction[] = [
      { label: '5 more minutes', cls: 'next', run: () => startTimer({ secs: 300, purpose: t.purpose }, true) },
      { label: 'Thanks', ghost: true, run: clearGlow },
    ];
  reply(plain, 0, acts);
  $('mBubble').classList.add('party');
  partyMyra();
  osNotify("Time's up", t.purpose || `${durText(t.secs)} timer`);
  // the glow (and the sigh after focus) is decided once and never flips: when the rules are sure (a break by its words, or the model already said at the two-minute warning) it is at once; when not, the model gets a couple of seconds, then the rules decide
  const doneAt = Date.now();
  let decided = false;
  const decide = (kind: Kind) => {
    if (decided) return;
    decided = true;
    setGlow(kind);
    if (kind !== 'break')
      setTimeout(
        () => {
          if ($('mPill').classList.contains('glow-red')) {
            sighing = true;
            setPose('sigh');
          }
        },
        Math.max(0, (window.myraMuted ? 600 : 3600) - (Date.now() - doneAt)),
      );
  };
  const aiOn =
    !!window.__timerLineStub || (!Fenmyr.web && settings.ai && appState.haveClaude !== false && navigator.onLine);
  if (t.kind || timerKind(t) === 'break' || !t.purpose || !aiOn) decide(timerKind(t));
  else setTimeout(() => decide(timerKind(t)), 2500);
  const r = await timerLine('done', t);
  if (r?.kind) decide(r.kind);
  else decide(timerKind(t));
  if (r?.say && $('mBubble').classList.contains('on') && $('mBubble').classList.contains('party'))
    $('mSay').textContent = noEmoji(r.say);
}

export function timerCheck() {
  if (!timer) return;
  const left = timer.end - Date.now();
  if (left <= 0) {
    timerDone();
    return;
  }
  paintTimer();
  if (!timer.warned && left <= 120000) timerWarn();
}

export function init38() {
  try {
    timer = readTimer(JSON.parse(localStorage.getItem(TIMER_KEY) || 'null'));
  } catch {
    timer = null;
  }

  appState.animPose = null;

  $('tcX').onclick = e => {
    e.stopPropagation();
    stopTimer();
  };

  setInterval(timerCheck, 1000);
  paintTimer();
  setTimeout(timerCheck, 1500);
}
