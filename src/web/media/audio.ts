import { renderWires } from '../canvas/wires.ts';
import { appState } from '../core/state.ts';
import type { Card } from '../../shared/model.ts';

type Recording = {
  recorder: MediaRecorder;
  stream: MediaStream;
  ac: AudioContext;
  start: number;
  paused: number;
  pausedAt: number;
};
export let PLAY = '';
export let PAUSE = '';

export const fmtT = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// card id → its recording, while it records
export const live = new Map<string, Recording>();
// card id → its player
export const players = new Map<string, HTMLAudioElement>();
export let MIC = '';

export function fitAudio(c: Card, el: HTMLElement) {
  const b = el.querySelector('.body');
  if (!(b instanceof HTMLElement)) return;
  b.style.height = 'auto';
  const h = Math.max(150, b.offsetHeight);
  b.style.height = '';
  if (Math.abs(h - c.h) > 2) {
    c.h = h;
    el.style.height = h + 'px';
    renderWires();
  }
}
export let warmT: ReturnType<typeof setTimeout> | undefined;

// the mic switches on as soon as the tool is picked, so the first words aren't lost while it wakes up; it switches off again if nothing gets recorded
export function warmMic(st: MediaStream) {
  clearTimeout(warmT);
  if (appState.warm && appState.warm !== st) appState.warm.getTracks().forEach(t => t.stop());
  appState.warm = st;
  warmT = setTimeout(coolMic, 60000);
}

export function coolMic() {
  if (appState.warm && !live.size) {
    appState.warm.getTracks().forEach(t => t.stop());
    appState.warm = null;
  }
}
export function init44() {
  // ---------- voice memos: record straight onto the board, play them back, and Myra writes them out ----------
  PLAY = Icon('play');
  PAUSE = Icon('pause');
  // card id → Audio
  MIC = Icon('mic', { size: 15 });

  // the first time someone picks the voice memo tool, ask for the mic (and speech) right then; macOS remembers the answer
  appState.micOK = false;
  appState.warm = null;
}
