import { $ } from '../core/dom.ts';
import { appState } from '../core/state.ts';
import { liveOff, liveOn, pickAnim, playAnim } from './anim.ts';
import { chatLog } from './chatLog.ts';
import { boxRect, chatOpen, chatOverBoard } from './chatWindow.ts';
import { goo } from './goos.ts';

type Point = { x: number; y: number };
// the slot Myra's canvas sits in, which she hops out of and back into
export let gooSlot: HTMLElement;

export let perched = false;
let gooAt = { x: 0, y: 0 };
let gooAnim: { stop(): void } | null = null;
// when her latest hop touches down, on performance.now()'s clock
let landsAt = 0;
// a hop hasn't touched down by its own frames yet, which a long task can hold back past landsAt
let aloft = false;
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
const HOP = { stretch: 0.3, wobble: 0.3, arc: 100, squash: 0.35, land: 300 };

// What differs between her two hops. `wind`: the crouch before she leaves, in ms (0.6 of it going down). `up` and
// `home`: her ms in the air going up and coming down, before `grows` scales them with the distance, and the arc with
// them. `drive`: 1 is a constant speed along her path, 2 starts at about twice her average speed and eases to rest as
// she lands.
type Hop = { wind: number; up: number; home: number; drive: 1 | 2; grows: boolean };
const HOPS: Record<'near' | 'far', Hop> = {
  // onto the open chat on a normal board, the timing it was tuned for
  near: { wind: 140, up: 480, home: 431, drive: 1, grows: false },
  // into or out of a prototype board's docked header, which can cross the window, so it leaves quickly
  far: { wind: 70, up: 330, home: 300, drive: 2, grows: true },
};

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

function flyGoo(to: Point, fade: boolean, hop: Hop) {
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
    grow = hop.grows ? Math.min(1.5, Math.max(1, Math.sqrt(Math.hypot(dx, dy) / 500))) : 1,
    WIND = up ? hop.wind : hop.wind * 0.6,
    AIR = (up ? hop.up : hop.home) * grow,
    LAND = HOP.land;
  // When 4h > |dy| her arc peaks (4h - |dy|)² / 16h above the higher end of the hop. h is capped so the peak stays 8 px
  // below the window's top edge, room for her stretch.
  const top = gooSlot.getBoundingClientRect().bottom - gooSlot.offsetHeight - from.y,
    room = Math.max(0, top + Math.min(from.y, to.y) - 8),
    h = Math.min(HOP.arc * (up ? 1 : 0.7) * grow, (Math.sqrt(Math.abs(dy) + room) + Math.sqrt(room)) ** 2 / 4);
  const vref = Math.hypot(Math.abs(dx), Math.abs(dy) + 4 * h) / AIR;
  const t0 = performance.now();
  landsAt = t0 + WIND + AIR;
  aloft = true;
  const sm = (k: number) => k * k * (3 - 2 * k),
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
        // how far along her way she is, and how fast that moves; a drive of 2 is quickest as she leaves
        s = 1 - (1 - k) ** hop.drive,
        ds = (hop.drive * (1 - k) ** (hop.drive - 1)) / AIR,
        x = from.x + dx * s,
        y = from.y + dy * s - 4 * h * s * (1 - s);
      const vx = dx * ds,
        vy = (dy - 4 * h * (1 - 2 * s)) * ds,
        sp = Math.hypot(vx, vy) / vref,
        th = Math.atan2(vy, vx);
      const el = sm(Math.min(1, sp)),
        along = 1 + HOP.stretch * el + HOP.wobble * 0.4 * Math.exp(-t / 170) * Math.sin(t / 34),
        across = 1 / Math.sqrt(along);
      gooPose({ x, y }, ` rotate(${th}rad) scale(${along}, ${across}) rotate(${-th}rad)`);
    } else {
      const l = e - WIND - AIR;
      if (!landFrom) {
        aloft = false;
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
      aloft = false;
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
  flyGoo(on ? perchTarget() : { x: 0, y: 0 }, fades(), HOPS.near);
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
  fitProps();
}

const docked = () => gooSlot.parentElement?.id === 'mcPerch';

// a docked chat dragged narrower than this (it opens at about 320 px, and goes down to 280) has no room for the prop
// she holds while she works, the first thing to go
const NARROW = 300;
const fitProps = () => goo.room(!(docked() && $('mChat').offsetWidth < NARROW));

// where she is, to hop from when she is about to change homes: none on a phone, or when she isn't showing. She shows in
// her box, or on a prototype board in the docked chat's header, where her box is hidden.
export const gooFrom = () => {
  const showing = docked()
    ? !document.body.classList.contains('phone') && gooSlot.checkVisibility({ visibilityProperty: true })
    : !boxHidden();
  return showing ? gooSlot.getBoundingClientRect() : null;
};

// Her slot has just moved to a new home. She is drawn back where she was, then hops or fades into it. The caller moves
// her and calls this in one task, so no frame shows her at the new home first.
export function hopFrom(from: DOMRect | null) {
  if (!from) return;
  const to = gooSlot.getBoundingClientRect();
  gooMove({ x: from.left - to.left, y: from.top - to.top });
  flyGoo({ x: 0, y: 0 }, fades(), HOPS.far);
}

// you opened an empty chat (the button or M): once she has landed in the chat's header she tilts her head, wondering what you'll ask. (Not when a question opens it, and not when you're toggling it over and over: then she is dizzy.)
// She tilts 80 ms after a long hop into a prototype's header touches down, as she does after the hop onto the chat, and
// once a fade has ended. A second open before she tilts replaces the first, so she tilts once.
let wonderT: ReturnType<typeof setTimeout> | undefined;
export const wonderIfEmpty = () => {
  const tilt = () => {
    if (gooSlot.getAnimations().length || aloft) {
      wonderT = setTimeout(tilt, 40);
      return;
    }
    if (chatOpen() && !chatLog().length && Date.now() - dizzyAt > 2500 && !$('myra').classList.contains('thinking'))
      playAnim('curious', false);
  };
  clearTimeout(wonderT);
  wonderT = setTimeout(tilt, Math.max(window.myraMuted ? 150 : 700, landsAt + 80 - performance.now()));
};

export function initPerch() {
  gooSlot = $('gooSlot');
  appState.toggleLog = [];
  appState.dizzyAuto = true;
  new ResizeObserver(fitProps).observe($('mChat'));

  // click her in the chat and she does something: on her perch, or in a prototype board's docked header, where she
  // always sits. In her box a click opens the chat.
  gooSlot.addEventListener('click', e => {
    if (!perched && !docked()) return;
    e.stopPropagation();
    playAnim(pickAnim(), false);
  });
}
