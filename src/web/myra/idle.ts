import { isRecord } from '../../shared/model.ts';
import { $, stage } from '../core/dom.ts';
import { appState, session } from '../core/state.ts';
import { docCard } from '../docs/editor.ts';
import { timerPose } from '../features/timer.ts';
import { homeAt } from '../library/home.ts';
import { settings } from '../settings/settings.ts';
import { drawOn } from '../tools/draw.ts';
import { placing } from '../tools/place.ts';
import { lastAnim, playAnim } from './anim.ts';
import { chatOpen } from './chatWindow.ts';

// when she last played by herself, and when she may next
type IdleState = { last: number; next: number };

// ---------- every now and then she animates by herself (lively about hourly, calm every few hours, calmest never; never more than once an hour) ----------
const IDLE_KEY = 'fenmyr:idleAnim';
const IDLE_SET = ['hop', 'wiggle', 'happy', 'love', 'dizzy', 'sleepy'];

const idleGap = () => {
  const m = settings.myraCalm || 'lively',
    r = Math.random();
  return m === 'calmest' ? 0 : m === 'lively' ? (60 + r * 30) * 60000 : (180 + r * 60) * 60000;
};

export const idleState = (): IdleState => {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(IDLE_KEY) || 'null');
    if (!isRecord(raw)) return { last: 0, next: 0 };
    return { last: Number(raw.last) || 0, next: Number(raw.next) || 0 };
  } catch {
    return { last: 0, next: 0 };
  }
};

const saveIdle = (st: IdleState) => {
  try {
    localStorage.setItem(IDLE_KEY, JSON.stringify(st));
  } catch (_e) {}
};

// true when she could be seen playing: the window is in use, nothing else is going on with her, and the pill is on screen
export function idleOK(anyway?: boolean) {
  if (!anyway && (document.hidden || !document.hasFocus() || Date.now() - appState.lastActive > 180000)) return false;
  const pill = $('mPill'),
    busyGlow = /glow-|hurry/.test(pill.className);
  return (
    !!session.board &&
    pill.offsetParent !== null &&
    !timerPose() &&
    !busyGlow &&
    !appState.animPose &&
    !(chatOpen() && Date.now() - appState.lastKey < 8000) &&
    !$('myra').classList.contains('thinking') &&
    !homeAt &&
    !docCard &&
    !drawOn &&
    !placing &&
    !stage.classList.contains('doc-open') &&
    !$('settings').classList.contains('on') &&
    !$('onboard').classList.contains('on')
  );
}

export function idleCheck(anyway?: boolean) {
  const m = settings.myraCalm || 'lively';
  if (m === 'calmest') return false;
  const now = Date.now(),
    st = idleState(),
    maxGap = (m === 'lively' ? 90 : 240) * 60000;
  if (!st.next) {
    saveIdle({ last: st.last || 0, next: now + idleGap() });
    return false;
  }
  if (now < Math.min(st.next, (st.last || 0) + maxGap) || !idleOK(anyway)) return false;
  const pool = IDLE_SET.filter(n => n !== lastAnim),
    name = pool[Math.floor(Math.random() * pool.length)] ?? 'hop';
  if (!playAnim(name, false)) return false;
  saveIdle({ last: now, next: now + idleGap() });
  return name;
}
export function init36() {
  appState.lastActive = Date.now();
  appState.lastKey = 0;

  addEventListener(
    'keydown',
    () => {
      appState.lastKey = Date.now();
    },
    { passive: true, capture: true },
  );

  ['pointermove', 'keydown', 'pointerdown'].forEach(ev => {
    addEventListener(
      ev,
      () => {
        appState.lastActive = Date.now();
      },
      { passive: true, capture: true },
    );
  });

  setInterval(idleCheck, 300000);
}
