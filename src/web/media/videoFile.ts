import { renderCard } from '../canvas/render.ts';
import { selectOnly } from '../canvas/wires.ts';
import { save } from '../core/history.ts';
import { card } from '../model/boards.ts';
import { say } from '../myra/say.ts';
import { centerWorld } from '../panels/zoomMenu.ts';
import { addCard } from '../tools/penEdit.ts';
import { messageOf, VBAR, type VideoCard, type VideoInfo, vEl, vids } from './video.ts';

// a still from the video (for the poster and the board's thumbnails), plus its size and length
function videoInfo(url: string) {
  return new Promise<VideoInfo>(res => {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.src = url;
    let done = false;
    const finish = (poster: string) => {
      if (done) return;
      done = true;
      res({ poster, vw: v.videoWidth, vh: v.videoHeight, dur: Number.isFinite(v.duration) ? v.duration : 0 });
    };
    v.onloadeddata = () => {
      try {
        v.currentTime = Math.min(0.3, (v.duration || 1) / 10);
      } catch (_e) {
        finish('');
      }
    };
    v.onseeked = () => {
      try {
        const W = 480,
          cv = document.createElement('canvas');
        cv.width = W;
        cv.height = Math.round((W * v.videoHeight) / (v.videoWidth || 1)) || 270;
        cv.getContext('2d')?.drawImage(v, 0, 0, cv.width, cv.height);
        finish(cv.toDataURL('image/jpeg', 0.8));
      } catch (_e) {
        finish('');
      }
    };
    v.onerror = () => finish('');
    setTimeout(() => finish(''), 8000);
  });
}

export async function fillVideo(c: VideoCard, blob: Blob, secs?: number) {
  if (blob.size > 1024 * 1024 * 1024) {
    say('That video is over 1 GB, which is too big for a board. Try a shorter clip ✦', 7000);
    return;
  }
  c.rec = false;
  c.ready = false;
  c.count = 0;
  c.saving = true;
  c.pct = 0;
  c.title = c.title || (blob instanceof File ? blob.name.replace(/\.[^.]+$/, '') : 'Video');
  renderCard(c);
  const local = URL.createObjectURL(blob),
    info = await videoInfo(local);
  URL.revokeObjectURL(local);
  let src: string;
  try {
    src = await Fenmyr.saveMedia(blob, f => {
      c.pct = f;
      const s2 = vEl(c.id)?.querySelector('.vd-msg span');
      if (s2) s2.textContent = `${Math.round(f * 100)}%`;
    });
  } catch (e) {
    c.saving = false;
    c.ready = true;
    renderCard(c);
    say(`I couldn't save that video: ${messageOf(e)}`, 8000);
    return;
  }
  vids.get(c.id)?.pause();
  vids.delete(c.id);
  Object.assign(c, {
    saving: false,
    pct: 0,
    src,
    poster: info.poster,
    dur: info.dur || secs || 0,
    vw: info.vw,
    vh: info.vh,
  });
  if (info.vw && info.vh) c.h = Math.round((c.w * info.vh) / info.vw) + VBAR;
  renderCard(c);
  selectOnly([c.id]);
  save();
}

export function addVideo(file: File, at?: { x: number; y: number } | null) {
  const p = at || centerWorld(),
    c = card('video', { title: file.name.replace(/\.[^.]+$/, '') });
  c.x = p.x - c.w / 2;
  c.y = p.y - c.h / 2;
  addCard(c);
  fillVideo(c, file);
}
