import { $ } from '../core/dom.ts';
import { settings } from '../settings/settings.ts';
import { addMsg } from './chatLog.ts';
import { chatOpen } from './chatWindow.ts';
import { hopMyra } from './goos.ts';

let sayT: ReturnType<typeof setTimeout> | undefined;

// the little extras: skipped when she's set to Quiet
export const reply = (text: string, ms?: number, acts?: SayAction[]) => say(text, ms, acts, true);

export function chirp(text: string, ms?: number, acts?: SayAction[]) {
  if (settings.chat !== 'quiet') say(text, ms, acts);
}

export function tip(text: string) {
  if (settings.chat === 'chatty') say(text, 6000);
}

// a button under one of Myra's lines
export type SayAction = { label: string; cls?: string; ghost?: boolean; run: () => unknown };

// keep: an answer to something you asked, so it also goes into the chat even when the chat window is closed
export function say(text: string, ms = 6000, acts: SayAction[] = [], keep = false) {
  $('mBubble').classList.remove('party');
  // a prototype board shows everything in its docked chat, never in the bubble
  if (chatOpen() || document.body.classList.contains('proto')) {
    if (text) addMsg('myra', text, acts);
    return;
  }
  if (keep && text) addMsg('myra', text, acts);
  $('mSay').textContent = text;
  $('mActs').innerHTML = '';
  acts.forEach(a => {
    const b = document.createElement('button');
    b.textContent = a.label;
    b.className = a.cls || (a.ghost ? 'ghost' : '');
    b.onclick = () => {
      $('mBubble').classList.remove('on');
      a.run();
    };
    $('mActs').appendChild(b);
  });
  $('mBubble').classList.add('on');
  hopMyra();
  clearTimeout(sayT);
  if (ms) sayT = setTimeout(() => $('mBubble').classList.remove('on'), ms);
}
