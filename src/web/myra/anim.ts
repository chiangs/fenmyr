// @ts-nocheck
import { partyMyra, setPose, timerPose, wantedPose } from '../features/timer.ts';
import { goo, hopMyra } from './goos.ts';
import { reply } from '../settings/licenses.ts';
import { appState } from '../core/state.ts';

// ---------- animate: what she can do with her sprite when asked (/animate, plain words like "can you jump?", or her own choice with thinking on). Always plays, even in calm mode ----------
export const ANIMS = [
  {
    name: 'hop',
    desc: 'A little jump',
    line: 'Boing!',
    ms: 1300,
    play: () => {
      hopMyra();
      setTimeout(hopMyra, 520);
    },
  },
  { name: 'wiggle', desc: 'A happy wiggle', line: '*wiggle wiggle*', ms: 2400, play: () => goo.wiggle(2400) }, // (her own wiggle, so it never cuts her thinking wiggle short)
  { name: 'party', desc: 'Hops and berry confetti', line: 'Party time!', ms: 3800, play: () => partyMyra(true) },
  { name: 'sleepy', desc: 'A big yawn and a nap', line: '*yawn*', ms: 4500, pose: 'sleepy' },
  { name: 'shook', desc: 'Startled', line: 'Whoa!', ms: 3000, pose: 'shook' },
  { name: 'sigh', desc: 'A long sigh', line: '*sigh*', ms: 3200, pose: 'sigh' },
  { name: 'happy', desc: 'Beaming, with sparkles', line: 'Yay!', ms: 3600, pose: 'happy' },
  { name: 'love', desc: 'Heart eyes', line: 'Aww, I love it here.', ms: 4000, pose: 'love' },
  { name: 'dizzy', desc: 'Stars circling', line: 'Wheee, the room is spinning.', ms: 4000, pose: 'dizzy' },
  { name: 'curious', desc: 'Head tilts, a floating question mark', line: 'Hmm?', ms: 3400, pose: 'curious' },
];

let animT = 0;
export let lastAnim = '';
let animLive = false;
let liveN = 0;

export const liveOn = () => {
  liveN++;
  goo.lively(true);
};
export const liveOff = () => {
  liveN = Math.max(0, liveN - 1);
  goo.lively(liveN > 0);
};

export const pickAnim = () => {
  const pool = ANIMS.filter(a => a.name !== lastAnim);
  return pool[Math.floor(Math.random() * pool.length)].name;
};

const ANIM_ALIAS = {
  jump: 'hop',
  bounce: 'hop',
  wobble: 'wiggle',
  dance: 'party',
  celebrate: 'party',
  confetti: 'party',
  yawn: 'sleepy',
  sleep: 'sleepy',
  nap: 'sleepy',
  startled: 'shook',
  surprised: 'shook',
  smile: 'happy',
  beam: 'happy',
  sparkle: 'happy',
  heart: 'love',
  hearts: 'love',
  'heart eyes': 'love',
  spin: 'dizzy',
  question: 'curious',
  wonder: 'curious',
  confused: 'curious',
  puzzled: 'curious',
  hmm: 'curious',
};

export const animName = n => {
  const k = String(n || '')
    .toLowerCase()
    .trim();
  return ANIMS.some(a => a.name === k) ? k : ANIM_ALIAS[k] || '';
};

export function playAnim(name, say = true) {
  const a = ANIMS.find(x => x.name === animName(name));
  if (!a) return false;
  if (timerPose()) {
    if (say) reply('My face is busy with the timer right now. Ask me again in a moment ✦');
    return false;
  }
  clearTimeout(animT);
  lastAnim = a.name;
  if (!animLive) {
    animLive = true;
    liveOn();
  }
  if (a.pose) {
    appState.animPose = a.pose;
    setPose(wantedPose());
  } else a.play();
  animT = setTimeout(() => {
    appState.animPose = null;
    if (animLive) {
      animLive = false;
      liveOff();
    }
    setPose(wantedPose());
  }, a.ms);
  if (say) reply(`${a.line} ✦`, 5000);
  return true;
}

export const stopAnim = () => {
  clearTimeout(animT);
  appState.animPose = null;
  if (animLive) {
    animLive = false;
    liveOff();
  }
  setPose(wantedPose());
};

export function slashAnimate(arg) {
  const n = (arg || '').trim().toLowerCase();
  if (!n || n === 'random' || n === 'surprise') return void playAnim(pickAnim());
  if (!playAnim(n) && !ANIMS.some(a => a.name === n))
    reply(`I don't know that one. I can do: ${ANIMS.map(a => a.name).join(', ')} ✦`);
}

// plain words, with thinking off (or on the web demo): "can you jump?", "do a little dance", "show me your moves"
const ANIM_WORDS = [
  ['hop', /\b(jump|hop|bounce)\b/i],
  ['wiggle', /\b(wiggle|wobble)\b/i],
  ['party', /\b(party|celebrate|confetti|cheer)\b/i],
  ['sleepy', /\b(sleepy|yawn|nap|sleep)\b/i],
  ['shook', /\b(shook|startled|surprised|scared)\b/i],
  ['sigh', /\bsigh\b/i],
  ['happy', /\b(happy|smile|beam|sparkle)\b/i],
  ['love', /\b(love|heart)\b/i],
  ['dizzy', /\b(dizzy|spin)\b/i],
  ['curious', /\b(curious|puzzled|confused)\b/i],
  ['*', /\b(animat\w*|dance|dancing|tricks?|show me your moves|do something|show me something)\b/i],
];

const ANIM_ASK =
  /\b(can|could|would|will)\s+(you|u)\b|\bplease\b|\b(show|give|do|make|throw|host|play|perform|try)\b|\bput on\b|\blet(?:'s|s| us)\b|\bhave a\b/i;

export const animRequest = q => {
  const an = animIntent(q);
  return an && (ANIM_ASK.test(q) || q.trim().split(/\s+/).length <= 3) ? an : '';
};
// with thinking on, only sentences that ask for it (so "I love how this board looks" is left to the model)
export const animIntent = q =>
  /group|sort|organi[sz]e|tidy|line up/i.test(q) ? '' : (ANIM_WORDS.find(([, re]) => re.test(q)) || [''])[0];
export function init35() {
  appState.flightLive = false;
}
