import { $ } from '../core/dom.ts';
import { appState } from '../core/state.ts';
import { liveOff, liveOn, pickAnim, playAnim } from './anim.ts';
import { chatLog } from './chatLog.ts';
import { chatOpen } from './chatWindow.ts';

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

function perchTarget() {
  // layout values only (never her own transform), so it is right while she squashes, leans and flies, and while the chat is still fading in
  const my = $('myra').getBoundingClientRect(),
    chat = $('mChat'),
    cs = getComputedStyle(chat),
    form = $('mcForm'),
    pill = $('mPill'),
    pr = pill.getBoundingClientRect();
  const baseL = pr.left + (gooSlot.offsetLeft - pill.offsetLeft),
    baseT = pr.top + (gooSlot.offsetTop - pill.offsetTop); // where her slot sits in the button
  const chatL = my.right - parseFloat(cs.right) - chat.offsetWidth,
    chatT = my.bottom - parseFloat(cs.bottom) - chat.offsetHeight;
  return { x: chatL + form.offsetLeft + 12 - baseL, y: chatT + form.offsetTop + 6 - gooSlot.offsetHeight - baseT };
}

// her hop is one gooey jump, no springs: a short wind-up, then she stretches along the line she is travelling (diagonally up and left leaving the button, up and right going home), most when
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

function flyGoo(to: Point, instant: boolean) {
  const from = gooAt;
  if (gooAnim) {
    gooAnim.stop();
    gooAnim = null;
  }
  const done = () => {
    if (appState.flightLive) {
      appState.flightLive = false;
      liveOff();
    }
  };
  if (instant || (Math.abs(from.x - to.x) < 1 && Math.abs(from.y - to.y) < 1)) {
    gooRest();
    gooMove(to);
    done();
    return;
  }
  if (!appState.flightLive) {
    appState.flightLive = true;
    liveOn();
  }
  gooRest();
  const up = to.y < from.y,
    WIND = up ? HOP.wind : HOP.wind * 0.6,
    AIR = up ? HOP.up : HOP.home,
    h = HOP.arc * (up ? 1 : 0.7),
    LAND = HOP.land;
  const dx = to.x - from.x,
    dy = to.y - from.y,
    vref = Math.hypot(Math.abs(dx), Math.abs(dy) + 4 * h) / AIR;
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
        done();
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
  const hidden = document.body.classList.contains('phone') || getComputedStyle($('mPill')).display === 'none';
  if (hidden) return;
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
  flyGoo(
    on ? perchTarget() : { x: 0, y: 0 },
    !!window.myraMuted || matchMedia('(prefers-reduced-motion: reduce)').matches,
  ); // calmest and reduced motion: she just appears
}

export const keepPerch = () => {
  if (perched && !gooAnim) gooMove(perchTarget());
};
// click her in the chat and she does something
// you opened an empty chat (the button or M): once she has landed by the input she tilts her head, wondering what you'll ask. (Not when a question opens it, and not when you're toggling it over and over: then she is dizzy.)
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

  addEventListener('resize', keepPerch);
  const perchWatch = new ResizeObserver(keepPerch);
  [$('mChat'), $('mPill'), $('myra')].forEach(el => {
    perchWatch.observe(el);
  });
  // the button changing width (a label appearing) moves the whole bar, and the chat with it
  gooSlot.addEventListener('click', e => {
    if (!perched) return;
    e.stopPropagation();
    playAnim(pickAnim(), false);
  });
}
