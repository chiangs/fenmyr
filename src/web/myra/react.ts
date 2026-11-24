import { $ } from '../core/dom.ts';
import { timerPose } from '../features/timer.ts';
import { settings } from '../settings/settings.ts';
import { animating, lastAnim, playAnim, stopAnim } from './anim.ts';

/** Something that just happened, which she may answer with a face. */
export type Moment =
  | 'planDone'
  | 'planDismissed'
  | 'buildDone'
  | 'buildFailed'
  | 'askFailed'
  | 'manyDeleted'
  | 'listDone'
  | 'bigListDone'
  | 'longIdle';

const FACE: Record<Moment, string> = {
  planDone: 'happy',
  planDismissed: 'sigh',
  buildDone: 'happy',
  buildFailed: 'shook',
  askFailed: 'shook',
  manyDeleted: 'shook',
  listDone: 'happy',
  bigListDone: 'party',
  longIdle: 'sleepy',
};

// between any two reactions, and before the same moment can bring one again, so repeated actions don't replay them
const GAP_MS = 20000;
const AGAIN_MS = 120000;
// confetti is for a bigger moment and at most once an hour; within the hour that moment gets a smile
const PARTY_MS = 3600000;

let lastAt = -Infinity;
const lastOf = new Map<Moment | 'party', number>();
let dozing = false;
/** The latest reaction she played and when, which tests read. */
export let lastReaction = { name: '', at: 0 };

// calm and calmest keep her still apart from blinking, and the system's reduce-motion setting turns reactions off
const still = () =>
  !!window.myraCalm || settings.myraChar === false || matchMedia('(prefers-reduced-motion: reduce)').matches;
// one at a time, never over a timer's face, and never while she is answering
const busy = () => animating() || !!timerPose() || $('myra').classList.contains('thinking');

/** The one place a moment reaches her sprite. Returns the animation she played, or '' when she let it pass. */
export function react(m: Moment): string {
  if (still() || busy()) return '';
  const now = Date.now();
  if (now - lastAt < GAP_MS || now - (lastOf.get(m) ?? -Infinity) < AGAIN_MS) return '';
  const party = FACE[m] === 'party' && now - (lastOf.get('party') ?? -Infinity) >= PARTY_MS,
    name = FACE[m] === 'party' && !party ? 'happy' : FACE[m],
    hold = m === 'longIdle';
  if (!playAnim(name, false, hold)) return '';
  lastAt = now;
  lastOf.set(m, now);
  if (party) lastOf.set('party', now);
  dozing = hold;
  lastReaction = { name, at: now };
  return name;
}

/** Ends her doze when someone comes back. */
export function wake() {
  if (!dozing) return;
  dozing = false;
  if (lastAnim === 'sleepy' && animating()) stopAnim();
}

/** For tests: forgets every cooldown. */
export function forgetReactions() {
  lastAt = -Infinity;
  lastOf.clear();
  lastReaction = { name: '', at: 0 };
}
