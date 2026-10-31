// @ts-nocheck
import { $ } from '../core/dom.ts';
import { gooSlot, keepPerch, snapshot } from '../myra/chat.ts';
import { goo, hopMyra } from '../myra/goos.ts';
import { reply } from '../settings/licenses.ts';
import { settings } from '../settings/settings.ts';
import { appState } from '../core/state.ts';

// ---------- the timer: /timer 25 write the intro. It counts down by the clock (so it survives sleep, restarts and switching boards), warns at two minutes, and Myra makes a fuss when it's up ----------
const TIMER_KEY = 'fenmyr:timer';

export let timer = null;
let timerTick = 0;

const saveTimer = () => {
  try {
    timer ? localStorage.setItem(TIMER_KEY, JSON.stringify(timer)) : localStorage.removeItem(TIMER_KEY);
  } catch (e) {}
};

const clock = ms => {
  const t = Math.max(0, Math.ceil(ms / 1000)),
    h = Math.floor(t / 3600),
    m = Math.floor((t % 3600) / 60),
    sec = t % 60,
    p = n => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`;
};

// how long, exactly as entered: "25" (minutes), "25m", "1h30", "2m10s", "1 min 1 sec", "69 seconds", "half an hour". Whatever follows is the purpose.
const UNIT_S = {
  h: 3600,
  hr: 3600,
  hrs: 3600,
  hour: 3600,
  hours: 3600,
  m: 60,
  min: 60,
  mins: 60,
  minute: 60,
  minutes: 60,
  s: 1,
  sec: 1,
  secs: 1,
  second: 1,
  seconds: 1,
};

const DUR_WORDS = [
  [/^\s*an hour and a half\b/i, 5400],
  [/^\s*half an hour\b/i, 1800],
  [/^\s*(?:an|one) hour\b/i, 3600],
  [/^\s*a minute\b/i, 60],
  [/^\s*a second\b/i, 1],
];

function parseDuration(str, needUnit) {
  // from the start of str: { secs, rest } or null (needUnit: a bare number is not enough, for plain sentences)
  const w = DUR_WORDS.find(([re]) => re.test(str));
  if (w) return { secs: w[1], rest: str.replace(w[0], '') };
  let rest = str,
    total = 0,
    prev = Infinity,
    got = 0,
    anyUnit = false;
  for (;;) {
    const m = /^\s*(?:and\s+)?(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)?(?![a-z])/i.exec(
      rest,
    );
    if (!m) break;
    const u = m[2] ? UNIT_S[m[2].toLowerCase()] : !got ? 60 : prev === 3600 ? 60 : prev === 60 ? 1 : 0; // a bare number is minutes, or the next unit down after hours or minutes ("1h30")
    if (!u || u >= prev) break;
    if (m[2]) anyUnit = true;
    total += +m[1] * u;
    prev = u;
    got++;
    rest = rest.slice(m[0].length);
  }
  return got && (anyUnit || !needUnit) ? { secs: Math.round(total), rest } : null;
}

export function parseTimer(arg) {
  const d = parseDuration(arg || '', false);
  if (!d || !/^(\s|$)/.test(d.rest)) return null;
  return d.secs >= 1 && d.secs <= 36000 ? { secs: d.secs, purpose: d.rest.trim().slice(0, 60) } : null;
}

export const durText = secs => {
  const h = Math.floor(secs / 3600),
    m = Math.floor((secs % 3600) / 60),
    sec = secs % 60;
  return [h && `${h} hr`, m && `${m} min`, sec && `${sec} sec`].filter(Boolean).join(' ') || '0 sec';
};

// plain sentences: "set a timer for 25 minutes for the intro", "give me a 2 minute 10 second timer", "remind me in 20 minutes to stretch", "cancel my timer", "how much time is left?"
export function timerRequest(q) {
  if (/\b(cancel|stop|clear|end|turn off|kill)\b[^.?!]*\btimer\b/i.test(q)) return { stop: true };
  if (/\b(how (much )?(time|long)\b[^.?!]*\b(left|remain\w*)|time (left|remaining))\b/i.test(q) && timer)
    return { status: true };
  const asks =
    /\b(set|start|begin|make|give me|create|run|put on|can i (get|have)|could (you|i) (get|have))\b[^.?!]*\btimer\b|\btimer\b[^.?!]*\b(for|of)\b|\b(\d+\s*(min|minute|sec|second|hour|hr)\w*[ -]*timer)\b|\bremind me\b[^.?!]*\bin\b/i.test(
      q,
    ) || /^\s*timer\b/i.test(q);
  if (!asks) return null;
  for (const m of q.matchAll(/(?:\d|\b(?:half an hour|an hour|a minute|a second)\b)/gi)) {
    const d = parseDuration(q.slice(m.index), true);
    if (!d || d.secs < 1 || d.secs > 36000) continue;
    const purpose = d.rest
      .replace(/^[\s,.-]*(?:timer|alarm)\b[\s,.]*/i, '')
      .replace(/^[\s,.]+/, '')
      .replace(/^(?:for|to|so i can|while i|so that i can|called|named|labell?ed)\s+/i, '')
      .replace(/[\s.?!]+$/, '')
      .slice(0, 60);
    return { secs: d.secs, purpose: /^(me|please|thanks?|now)$/i.test(purpose) ? '' : purpose };
  }
  return null;
}

const timerWhat = t => t.purpose || `your ${durText(t.secs)} timer`;

// what the glow says when it runs out: red for work and focus, green for a break. With thinking on the model decides (t.kind, from its warning), otherwise a break or a breather is green and everything else is red
const timerKind = t =>
  t.kind ||
  (/\b(break(?!\s*(down|through|into|up|out|in|open)\b)|breather)\b/i.test(t.purpose || '') ? 'break' : 'focus');
// 'break', 'coffee break', 'quick breather'; not 'break down the plan'
// her faces follow the timer: sleepy through a break, shook in the last two minutes, and after a focus timer ends she sighs until you answer
let glowT = 0;
let sighing = false;
export let currentPose = null;

export const setPose = p => {
  if (p !== currentPose) {
    currentPose = p;
    goo.pose(p);
  }
};

export const timerPose = () =>
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

const setGlow = kind => {
  clearGlow();
  $('mPill').classList.add(kind === 'break' ? 'glow-green' : 'glow-red');
  glowT = setTimeout(clearGlow, 120000);
};

function paintTimer() {
  const chip = $('timerChip');
  $('myra').classList.toggle('timing', !!timer);
  keepPerch();
  if (!timer) {
    chip.hidden = true;
    $('mPill').classList.remove('hurry');
    setPose(wantedPose());
    return;
  }
  chip.hidden = false;
  $('tcTime').textContent = clock(timer.end - Date.now());
  $('tcWhat').textContent = timer.purpose || durText(timer.secs);
  chip.style.setProperty('--left', Math.max(0, Math.min(1, (timer.end - Date.now()) / (timer.secs * 1000))));
  $('mPill').classList.toggle('hurry', timer.secs >= 180 && timer.end - Date.now() <= 120000);
  setPose(wantedPose());
}

export function startTimer(t, replace, quiet) {
  if (timer && !replace)
    return reply(
      `You already have ${clock(timer.end - Date.now())} left on ${timerWhat(timer)}. Start this one instead?`,
      0,
      [
        { label: 'Replace it', cls: 'next', run: () => startTimer(t, true) },
        { label: 'Keep it', ghost: true, run: () => {} },
      ],
    );
  clearGlow();
  timer = { end: Date.now() + t.secs * 1000, secs: t.secs, purpose: t.purpose, warned: t.secs < 180 };
  saveTimer();
  paintTimer();
  hopMyra();
  if (!quiet)
    reply(`Timer set: ${durText(t.secs)}${t.purpose ? ` (${t.purpose})` : ''}. I'll tell you when it's time ✦`);
}

export function stopTimer(say = true) {
  if (!timer) return say && reply('No timer is running ✦');
  const t = timer;
  timer = null;
  saveTimer();
  paintTimer();
  say && reply(`Stopped the timer for ${timerWhat(t)} ✦`);
}

// a plain sentence asked for a timer (or to stop it, or how long is left)
export function runTimerRequest(tr, say) {
  if (tr.stop) {
    stopTimer(!!say);
    return 'stopped the timer';
  }
  if (tr.status) {
    slashTimer('');
    return 'told them how much time is left';
  }
  startTimer({ secs: tr.secs, purpose: tr.purpose }, false, !say);
  return `set a timer for ${durText(tr.secs)}${tr.purpose ? ` (${tr.purpose})` : ''}`;
}

export function slashTimer(arg) {
  const a = (arg || '').trim();
  if (/^(stop|cancel|off|clear)$/i.test(a)) return stopTimer();
  if (!a)
    return reply(
      timer
        ? `${clock(timer.end - Date.now())} left on ${timerWhat(timer)}. /timer stop cancels it ✦`
        : 'Try /timer 25 write the intro, or pick a ready-made one from the list when you type /timer ✦',
    );
  const t = parseTimer(a);
  if (!t) return reply('I need a time first, like /timer 25 write the intro (or 1h30, 2m10s, 69 seconds) ✦');
  startTimer(t);
}

// with thinking on, one short model call gives the warning and the finish a line that fits what you're doing (the plain line shows first and is replaced if it arrives in time)
async function timerLine(kind, t) {
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
  } catch (e) {
    return null;
  }
}

export const osNotify = (title, body) => {
  if (Fenmyr.web || document.hasFocus() || typeof Notification === 'undefined') return;
  try {
    new Notification(title, { body });
  } catch (e) {}
};

const CONFETTI = ['#f2a339', '#e07a5f', '#ffdcd8', '#e0edd3', '#d9e7f3', '#ebe1f2'];

// when it's up: she hops, her pill wiggles and berry confetti bursts out (calmer if she is set to calm, nothing at all if calmest)
export function partyMyra(force) {
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
    c.style.left = ox + 'px';
    c.style.top = oy + 'px';
    c.style.bottom = 'auto';
    $('myra').appendChild(c);
    setTimeout(() => c.remove(), 2400);
  }
}

async function timerWarn() {
  const t = timer;
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
  timer = null;
  saveTimer();
  paintTimer();
  const plain = `Time's up! ${durText(t.secs)}${t.purpose ? ` (${t.purpose})` : ''} ✦`,
    acts = [
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
  const decide = kind => {
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
  if (left <= 0) return timerDone();
  paintTimer();
  if (!timer.warned && left <= 120000) timerWarn();
}

// emojis off means off: the prompt asks, and this makes sure (her own ✦ isn't an emoji, so it stays)
export const noEmoji = t =>
  settings.emoji
    ? t
    : String(t)
        .replace(/(\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}])(\uFE0F|\u200D|\u20E3|[\u{1F3FB}-\u{1F3FF}])*/gu, '')
        .replace(/ {2,}/g, ' ')
        .trim();

export const parse = raw => {
  const s = String(raw),
    a = s.indexOf('{'),
    b = s.lastIndexOf('}');
  if (a < 0) return { say: s.trim() };
  try {
    return JSON.parse(s.slice(a, b + 1));
  } catch (e) {
    return { say: s.trim() };
  }
};

export function guessNext(r, added) {
  const has = t => added.some(c => c.type === t);
  if (r.screens?.length)
    return added.some(c => c.img)
      ? ['Make the mobile version', 'Try a different colour style', 'Write the real copy']
      : ['Add the next screen', 'Make it a website too', 'Try a different style'];
  if (has('font')) return ['Pair these with colours', 'Show them on a landing page', 'Narrow it down to two'];
  if (has('swatch')) return ['Pick fonts that match', 'Build a page in these colours'];
  if (has('todo')) return ['Break it into smaller steps', 'Put dates on it'];
  if (added.length >= 3) return ['Group these by theme', 'What am I missing?', 'Turn this into a plan'];
  return [];
}
export function init38() {
  try {
    timer = JSON.parse(localStorage.getItem(TIMER_KEY) || 'null');
    if (!timer || !timer.end) timer = null;
    else if (timer.secs == null) timer.secs = Math.round((timer.minutes || 1) * 60);
  } catch (e) {
    timer = null;
  }

  appState.animPose = null;

  $('tcX').onclick = e => {
    e.stopPropagation();
    stopTimer();
  };

  timerTick = setInterval(timerCheck, 1000);
  paintTimer();
  setTimeout(timerCheck, 1500);
}
