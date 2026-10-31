// @ts-nocheck
import { renderWires } from '../canvas/wires.ts';
import { appState } from '../core/state.ts';
export let PLAY;
export let PAUSE;

export const fmtT = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export const live = new Map();
// card id → { recorder, stream, timer, ... } while recording
export const players = new Map();
export let MIC;

export function fitAudio(c, el) {
  const b = el.querySelector('.body');
  if (!b) return;
  b.style.height = 'auto';
  const h = Math.max(150, b.offsetHeight);
  b.style.height = '';
  if (Math.abs(h - c.h) > 2) {
    c.h = h;
    el.style.height = h + 'px';
    renderWires();
  }
}
export let warmT = 0;

// the mic switches on as soon as the tool is picked, so the first words aren't lost while it wakes up; it switches off again if nothing gets recorded
export function warmMic(st) {
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
