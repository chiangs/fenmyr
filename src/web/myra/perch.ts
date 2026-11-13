import { $ } from '../core/dom.ts';
import { appState } from '../core/state.ts';
import { liveOff, liveOn, pickAnim, playAnim } from './anim.ts';
import { chatLog } from './chatLog.ts';
import { boxRect, chatOpen, chatOverBoard } from './chatWindow.ts';

type Point = { x: number; y: number };
// the slot Myra's canvas sits in, which she hops out of and back into
export let gooSlot: HTMLElement;

export let perched = false;
let gooAt = { x: 0, y: 0 };
let gooAnim: { stop(): void } | null = null;
let dizzyAt = 0;

const gooMove = (t: Point) => {
  gooAt = t;
  gooSlot.style.transform = `translate(${t.x}px, ${t.y}px)`;
};

// from her slot's home in her box to the spot at the start of the chat's header; layout values only (never her own
// transform), so it is right while she squashes, leans and flies, and while the chat is still growing in
function perchTarget(): Point {
  const chat = chatOverBoard();
  if (!chat) return { x: 0, y: 0 };
  const box = boxRect(),
    pill = $('mPill'),
    spot = $('mcPerch');
  return {
    x: chat.l + spot.offsetLeft - (box.l + gooSlot.offsetLeft - pill.offsetLeft),
    y: chat.t + spot.offsetTop - (box.t + gooSlot.offsetTop - pill.offsetTop),
  };
}

// her hop is one gooey jump, no springs: a short wind-up, then she stretches along the line she is travelling (up out of her box into the chat's header, down going home), most when
// she is fastest and round again near the top of the arc, with a soft wobble just after she leaves the ground; she slows towards the top and quickens a little coming down; on landing she squashes
// once and settles. The landing spot is fixed when she takes off (measured again at touchdown), so she can never drift past the edge of the chat.
const HOP = { stretch: 0.3, wobble: 0.3, arc: 100, up: 480, home: 431, squash: 0.35, wind: 140, land: 300 };

const gooPose = (p: Point, tf?: string) => {
  gooAt = p;
  gooSlot.style.transform = `translate(${p.x}px, ${p.y}px)${tf || ''}`;
};

const gooRest = () => {
  gooSlot.style.transformOrigin = '';
};

const landed = () => {
  if (!appState.flightLive) return;
  appState.flightLive = false;
  liveOff();
};

const fades = () => !!window.myraCalm || matchMedia('(prefers-reduced-motion: reduce)').matches;
const boxHidden = () => document.body.classList.contains('phone') || getComputedStyle($('mPill')).display === 'none';

// Calm, calmest and reduced motion: she fades out of one place and into the other, with no hop
function fadeGoo() {
  const out = gooSlot.animate({ opacity: [1, 0] }, { duration: 120, fill: 'forwards' });
  let stopped = false;
  gooAnim = {
    stop() {
      stopped = true;
      out.cancel();
    },
  };
  out.onfinish = () => {
    if (stopped) return;
    gooRest();
    gooMove(perched ? perchTarget() : { x: 0, y: 0 });
    gooSlot.animate({ opacity: [0, 1] }, 120);
    out.cancel();
    gooAnim = null;
  };
}

// `far`: a hop into a prototype board's docked header can cross the window, so the further she goes the longer she is
// in the air and the higher she arcs. The hop onto the chat keeps the timing it was tuned for.
function flyGoo(to: Point, fade: boolean, far = false) {
  const from = gooAt;
  if (gooAnim) {
    gooAnim.stop();
    gooAnim = null;
  }
  if (Math.abs(from.x - to.x) < 1 && Math.abs(from.y - to.y) < 1) {
    gooRest();
    gooMove(to);
    landed();
    return;
  }
  if (fade) {
    landed();
    fadeGoo();
    return;
  }
  if (!appState.flightLive) {
    appState.flightLive = true;
    liveOn();
  }
  gooRest();
  const dx = to.x - from.x,
    dy = to.y - from.y,
    up = to.y < from.y,
    grow = far ? Math.min(1.5, Math.max(1, Math.sqrt(Math.hypot(dx, dy) / 500))) : 1,
    WIND = up ? HOP.wind : HOP.wind * 0.6,
    AIR = (up ? HOP.up : HOP.home) * grow,
    LAND = HOP.land;
  // When 4h > |dy| her arc peaks (4h - |dy|)² / 16h above the higher end of the hop. h is capped so the peak stays 8 px
  // below the window's top edge, room for her stretch.
  const top = gooSlot.getBoundingClientRect().bottom - gooSlot.offsetHeight - from.y,
    room = Math.max(0, top + Math.min(from.y, to.y) - 8),
    h = Math.min(HOP.arc * (up ? 1 : 0.7) * grow, (Math.sqrt(Math.abs(dy) + room) + Math.sqrt(room)) ** 2 / 4);
  const vref = Math.hypot(Math.abs(dx), Math.abs(dy) + 4 * h) / AIR;
  const t0 = performance.now(),
    sm = (k: number) => k * k * (3 - 2 * k),
    lerp = (a: number, b: number, k: number) => a + (b - a) * k;
  let target = to,
    landFrom: Point | null = null,
    raf = 0,
    stopped = false;
  const step = (now: number) => {
    if (stopped) return;
    const e = now - t0;
    if (e < WIND) {
      const k = sm(e / WIND);
      gooPose(from, ` scale(${1 + (0.1 * k * HOP.squash) / 0.35}, ${1 - (0.14 * k * HOP.squash) / 0.35})`);
    } // a small crouch before she leaves
    else if (e < WIND + AIR) {
      gooSlot.style.transformOrigin = '50% 55%';
      const t = e - WIND,
        k = t / AIR,
        x = from.x + dx * k,
        y = from.y + dy * k - 4 * h * k * (1 - k);
      const vx = dx / AIR,
        vy = dy / AIR - (4 * h * (1 - 2 * k)) / AIR,
        sp = Math.hypot(vx, vy) / vref,
        th = Math.atan2(vy, vx);
      const el = sm(Math.min(1, sp)),
        along = 1 + HOP.stretch * el + HOP.wobble * 0.4 * Math.exp(-t / 170) * Math.sin(t / 34),
        across = 1 / Math.sqrt(along);
      gooPose({ x, y }, ` rotate(${th}rad) scale(${along}, ${across}) rotate(${-th}rad)`);
    } else {
      const l = e - WIND - AIR;
      if (!landFrom) {
        landFrom = { x: from.x + dx, y: from.y + dy };
        gooRest();
        target = perched ? perchTarget() : { x: 0, y: 0 };
      } // where the landing spot is now
      if (l >= LAND) {
        gooRest();
        gooMove(target);
        gooAnim = null;
        landed();
        return;
      }
      const sq = Math.exp(-l / 85) * Math.cos(l / 40),
        blend = Math.min(1, l / 120);
      gooPose(
        { x: lerp(landFrom.x, target.x, blend), y: lerp(landFrom.y, target.y, blend) },
        ` scale(${1 + 0.55 * HOP.squash * sq}, ${1 - HOP.squash * sq})`,
      );
    }
    raf = requestAnimationFrame(step);
  };
  gooAnim = {
    stop() {
      stopped = true;
      cancelAnimationFrame(raf);
    },
  };
  raf = requestAnimationFrame(step);
}

export function perchGoo(on: boolean) {
  if (boxHidden()) return;
  const now = Date.now();
  appState.toggleLog = appState.toggleLog.filter(t => now - t < 3000);
  appState.toggleLog.push(now);
  if (appState.dizzyAuto && appState.toggleLog.length >= 4 && now - dizzyAt > 8000) {
    dizzyAt = now;
    appState.toggleLog = [];
    setTimeout(() => playAnim('dizzy', false), 350);
  } // toggled over and over: she gets dizzy
  perched = on;
  gooSlot.classList.toggle('perched', on);
  flyGoo(on ? perchTarget() : { x: 0, y: 0 }, fades());
}

export const keepPerch = () => {
  if (perched && !gooAnim) gooMove(perchTarget());
};

// Her slot moved between her box and a prototype board's docked chat. Her offset, perch and any flight belonged to the
// old home, so she rests at the new one.
export function dockReset() {
  gooAnim?.stop();
  gooAnim = null;
  landed();
  perched = false;
  gooSlot.classList.remove('perched');
  gooRest();
  gooMove({ x: 0, y: 0 });
}

// none on a phone, or on a prototype board, where she already sits in the docked chat's header
export const gooFrom = () => (boxHidden() ? null : gooSlot.getBoundingClientRect());

const docked = () => gooSlot.parentElement?.id === 'mcPerch';

// Her slot has just moved to a new home. She is drawn back where she was, then hops or fades into it. The caller moves
// her and calls this in one task, so no frame shows her at the new home first.
export function hopFrom(from: DOMRect | null) {
  if (!from) return;
  const to = gooSlot.getBoundingClientRect();
  gooMove({ x: from.left - to.left, y: from.top - to.top });
  flyGoo({ x: 0, y: 0 }, fades(), true);
}

// you opened an empty chat (the button or M): once she has landed in the chat's header she tilts her head, wondering what you'll ask. (Not when a question opens it, and not when you're toggling it over and over: then she is dizzy.)
export const wonderIfEmpty = () =>
  setTimeout(
    () => {
      if (chatOpen() && !chatLog().length && Date.now() - dizzyAt > 2500 && !$('myra').classList.contains('thinking'))
        playAnim('curious', false);
    },
    window.myraMuted ? 150 : 700,
  );

export function initPerch() {
  gooSlot = $('gooSlot');
  appState.toggleLog = [];
  appState.dizzyAuto = true;

  // click her in the chat and she does something: on her perch, or in a prototype board's docked header, where she
  // always sits. In her box a click opens the chat.
  gooSlot.addEventListener('click', e => {
    if (!perched && !docked()) return;
    e.stopPropagation();
    playAnim(pickAnim(), false);
  });
}
