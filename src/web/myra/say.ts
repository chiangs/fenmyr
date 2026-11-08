import { $ } from '../core/dom.ts';
import { settings } from '../settings/settings.ts';
import type { Act } from './acts.ts';
import { addMsg } from './chatLog.ts';
import { chatOpen } from './chatWindow.ts';
import { hopMyra } from './goos.ts';
import { drawActs } from './replyView.ts';

let sayT: ReturnType<typeof setTimeout> | undefined;

// the little extras: skipped when she's set to Quiet
export const reply = (text: string, ms?: number, acts?: Act[]) => say(text, ms, acts, true);

export function chirp(text: string, ms?: number, acts?: Act[]) {
  if (settings.chat !== 'quiet') say(text, ms, acts);
}

export function tip(text: string) {
  if (settings.chat === 'chatty') say(text, 6000);
}

// a button under one of Myra's lines
export type SayAction = { label: string; cls?: string; ghost?: boolean; run: () => unknown };

// keep: an answer to something you asked, so it also goes into the chat even when the chat window is closed
export function say(text: string, ms = 6000, acts: Act[] = [], keep = false) {
  $('mBubble').classList.remove('party');
  // a prototype board shows everything in its docked chat, never in the bubble
  if (chatOpen() || document.body.classList.contains('proto')) {
    if (text) addMsg('myra', text, acts);
    return;
  }
  const kept = keep && text ? addMsg('myra', text, acts) : undefined;
  $('mSay').textContent = text;
  drawActs($('mActs'), kept, acts, after => {
    if (after !== 'stay') $('mBubble').classList.remove('on');
  });
  $('mBubble').classList.add('on');
  hopMyra();
  clearTimeout(sayT);
  if (ms) sayT = setTimeout(() => $('mBubble').classList.remove('on'), ms);
}
