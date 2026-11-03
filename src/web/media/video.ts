import { cardEl } from '../ui/dom.ts';
import { renderCard } from '../canvas/render.ts';
import { byId, selectOnly } from '../canvas/wires.ts';
import { clamp } from '../core/base.ts';
import { $ } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { fmtT } from './audio.ts';
import { devicePick, openMedia, transcribe } from './devices.ts';
import { ask } from '../myra/chat.ts';
import { chirp } from '../settings/licenses.ts';
import { settings } from '../settings/settings.ts';
import { applySettings } from '../settings/widgets.ts';
import type { CardOf } from '../../shared/model.ts';
import { fillVideo } from './videoFile.ts';

export type VideoCard = CardOf<'video'>;
// a camera that's on for a card: its live view, and the recorder once recording starts
type Cam = {
  stream: MediaStream;
  view: HTMLVideoElement;
  idle: number;
  t0: number;
  tick?: ReturnType<typeof setInterval>;
  rec?: MediaRecorder;
};
export type VideoInfo = { poster: string; vw: number; vh: number; dur: number };
export const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

// the speaker icon, then the one that shows while it is muted
export let SPK = '';
export const vids = new Map<string, HTMLVideoElement>();
export const cams = new Map<string, Cam>();
export const VBAR = 44;

// flip: what you see is what you record. On (the default) mirrors you like a selfie; off shows the room the right way round, so writing reads normally
const camFlip = () => settings.camFlip !== false;

function paintLook() {
  cams.forEach(cam => {
    cam.view.style.transform = camFlip() ? 'scaleX(-1)' : 'none';
  });
}

export const vEl = (id: string) => cardEl(id);

export function setupVideo(c: VideoCard, el: HTMLElement) {
  const src = c.src;
  if (src) {
    let v = vids.get(c.id);
    if (!v) {
      v = document.createElement('video');
      v.className = 'vd-v';
      v.playsInline = true;
      v.preload = 'metadata';
      if (c.poster) v.poster = c.poster;
      vids.set(c.id, v);
      const player = v;
      Fenmyr.mediaURL(src).then(u => {
        if (u) player.src = u;
      });
      const paint = () => {
        const e2 = vEl(c.id);
        if (!e2) return;
        const f = (player.currentTime || 0) / (player.duration || c.dur || 1);
        const bar = e2.querySelector('.vd-prog i');
        if (bar instanceof HTMLElement) bar.style.width = (f * 100).toFixed(2) + '%';
        const t = e2.querySelector('.vd-time');
        if (t)
          t.textContent =
            player.paused && !player.currentTime
              ? fmtT(c.dur || player.duration || 0)
              : `${fmtT(player.currentTime)} / ${fmtT(c.dur || player.duration || 0)}`;
      };
      player.addEventListener('timeupdate', paint);
      player.addEventListener('seeked', paint);
      ['play', 'pause', 'ended'].forEach(t =>
        player.addEventListener(t, () => {
          vEl(c.id)?.classList.toggle('playing', !player.paused);
          paint();
        }),
      );
      player.addEventListener('loadedmetadata', () => {
        if (!c.dur && Number.isFinite(player.duration)) {
          c.dur = player.duration;
          save();
        }
        paint();
      });
    }
    v.muted = !!c.muted;
    v.style.transform = c.mirror ? 'scaleX(-1)' : '';
    el.querySelector('.vd-v')?.replaceWith(v);
    el.classList.toggle('playing', !v.paused);
    return;
  }
  const cam = cams.get(c.id),
    slot = el.querySelector('.vd-live');
  if (slot && cam) {
    slot.replaceWith(cam.view);
    cam.view.play().catch(() => {});
  }
}

export async function camOn(c: VideoCard): Promise<Cam | null> {
  const on = cams.get(c.id);
  if (on) return on;
  let stream: MediaStream;
  try {
    stream = await openMedia(true);
  } catch (e) {
    c.camErr = `Fenmyr needs the camera. Turn it on in ${privacy('Camera')}, then click Start recording again.`;
    c.camRest = false;
    renderCard(c);
    return null;
  }
  const view = document.createElement('video');
  view.className = 'vd-live';
  view.muted = true;
  view.playsInline = true;
  view.autoplay = true;
  view.srcObject = stream;
  view.style.transform = camFlip() ? 'scaleX(-1)' : 'none';
  const cam: Cam = { stream, view, idle: 0, t0: 0 };
  cams.set(c.id, cam);
  c.camErr = '';
  c.camRest = false;
  // the camera rests after a minute of waiting (no recording), and switches off if the card goes away
  cam.tick = setInterval(() => {
    if (!vEl(c.id) || (!c.rec && (cam.idle += 2) >= 60)) {
      camOff(c.id);
      if (byId(c.id) && !c.src) {
        c.camRest = true;
        renderCard(c);
      }
    }
  }, 2000);
  renderCard(c);
  return cam;
}

export function camOff(id: string) {
  const cam = cams.get(id);
  if (!cam) return;
  clearInterval(cam.tick);
  cam.stream.getTracks().forEach(t => t.stop());
  cams.delete(id);
}

async function videoRecord(c: VideoCard) {
  const cam = await camOn(c);
  if (!cam) return;
  const type =
    ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find(t =>
      MediaRecorder.isTypeSupported(t),
    ) || '';
  let stream = cam.stream,
    stopSlice = () => {};
  // a wide video records straight from the camera (true colors) and is shown mirrored on the board if flip is on;
  // a phone-shaped one is cut frame by frame anyway, so its flip is drawn right in
  c.mirror = (!c.vert && camFlip()) || undefined;
  if (c.vert) {
    const st = cam.stream.getVideoTracks()[0]?.getSettings() || {},
      W0 = cam.view.videoWidth || st.width || 1280,
      H0 = cam.view.videoHeight || st.height || 720; // the real frame size, not what the camera says it sends
    const H = H0,
      W = c.vert ? Math.round((H * 9) / 16 / 2) * 2 : Math.round(W0 / 2) * 2,
      cv = document.createElement('canvas'),
      g = cv.getContext('2d');
    if (!g) return;
    cv.width = W;
    cv.height = H;
    let on = true;
    (function slice() {
      if (!on) return;
      try {
        const fw = cam.view.videoWidth || W0,
          fh = cam.view.videoHeight || H0,
          sw = c.vert ? Math.round((fh * 9) / 16) : fw,
          flip = camFlip();
        g.save();
        if (flip) {
          g.translate(W, 0);
          g.scale(-1, 1);
        }
        g.drawImage(cam.view, (fw - sw) / 2, 0, sw, fh, 0, 0, W, H);
        g.restore();
      } catch (e) {}
      requestAnimationFrame(slice);
    })(); // re-measured every frame, in case the camera changes size; flip can change mid-recording
    stream = new MediaStream([...cv.captureStream(30).getVideoTracks(), ...cam.stream.getAudioTracks()]);
    stopSlice = () => {
      on = false;
      stream.getVideoTracks().forEach(t => t.stop());
    };
  }
  const rec = new MediaRecorder(
      stream,
      type ? { mimeType: type, videoBitsPerSecond: c.vert ? 3000000 : 2500000 } : undefined,
    ),
    chunks: Blob[] = [];
  cam.rec = rec;
  cam.idle = 0;
  c.rec = true;
  c.ready = false;
  selectOnly([c.id]);
  for (const n of [3, 2, 1]) {
    c.count = n;
    renderCard(c);
    await new Promise(r => setTimeout(r, 700));
    if (!cams.has(c.id) || !c.rec) return;
  }
  c.count = 0;
  renderCard(c);
  rec.ondataavailable = e => {
    if (e.data.size) chunks.push(e.data);
  };
  rec.onstop = async () => {
    stopSlice();
    const blob = new Blob(chunks, { type: (rec.mimeType || 'video/mp4').split(';')[0] }),
      secs = (Date.now() - cam.t0) / 1000;
    camOff(c.id);
    const when = new Date();
    c.title =
      c.title ||
      `Video · ${when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
    await fillVideo(c, blob, secs);
  };
  cam.t0 = Date.now();
  rec.start(500);
  (function clock() {
    const e2 = vEl(c.id);
    if (!c.rec || !cams.has(c.id)) return;
    const t = e2?.querySelector('.vd-rtime');
    if (t) t.textContent = fmtT((Date.now() - cam.t0) / 1000);
    // a 15 minute limit keeps files a sensible size
    if (Date.now() - cam.t0 > 15 * 60 * 1000) {
      videoAct(c, 'vd-stop');
      return;
    }
    setTimeout(clock, 250);
  })();
}

export function videoAct(c: VideoCard, act: string, e?: MouseEvent) {
  const v = vids.get(c.id),
    el = vEl(c.id);
  if (act === 'vd-play' && v) {
    if (v.paused) {
      if (v.ended) v.currentTime = 0;
      v.play().catch(() => {});
    } else v.pause();
  }
  if (act === 'vd-seek' && v && e) {
    const prog = el?.querySelector('.vd-prog');
    if (!prog) return;
    const r = prog.getBoundingClientRect();
    v.currentTime = clamp((e.clientX - r.left) / r.width, 0, 1) * (v.duration || c.dur || 0);
  }
  if (act === 'vd-mute') {
    c.muted = !c.muted;
    if (v) v.muted = c.muted;
    renderCard(c);
    save();
  }
  if (act === 'vd-wake') camOn(c);
  // writing out what was said: the words open under the video, with Turn into notes and Copy
  if (act === 'vd-tx') {
    if (c.text) return;
    if (!c.txShown) {
      c.txShown = true;
      c.h += 120;
    }
    c.txNote = 'Writing it out…';
    c.needTx = false;
    renderCard(c);
    save();
    transcribe(c);
    return;
  }
  if (act === 'vd-notes') {
    ask(
      `This is what I said in a video I recorded (card ${c.id}). Turn it into short notes on the board, placed just to the right of that card, grouped if there are a few ideas:\n"${c.text}"`,
    );
    return;
  }
  if (act === 'vd-copy') {
    navigator.clipboard?.writeText(c.text || '').then(
      () => chirp('Copied ✦', 1600),
      () => {},
    );
    return;
  }
  if (act === 'vd-flip') {
    settings.camFlip = settings.camFlip === false;
    applySettings();
    paintLook();
    renderCard(c);
  }
  if (act === 'vd-dev' && e) {
    devicePick(
      e,
      [
        ['videoinput', 'Camera', 'camId'],
        ['audioinput', 'Microphone', 'micId'],
      ],
      () => {
        camOff(c.id);
        camOn(c);
      },
    );
    return;
  }
  if ((act === 'vd-wide' || act === 'vd-tall') && !c.rec) {
    const vert = act === 'vd-tall';
    if (!!c.vert === vert) return;
    const cx = c.x + c.w / 2,
      cy = c.y + c.h / 2;
    c.vert = vert;
    c.w = vert ? 230 : 360;
    c.h = vert ? Math.round((230 * 16) / 9) + VBAR : 246;
    c.x = cx - c.w / 2;
    c.y = cy - c.h / 2;
    renderCard(c);
    selectOnly([c.id]);
    save();
  }
  if (act === 'vd-start') videoRecord(c);
  if (act === 'vd-stop') {
    const cam = cams.get(c.id);
    if (cam?.rec && cam.rec.state !== 'inactive' && !c.count) cam.rec.stop();
    else {
      c.rec = false;
      c.count = 0;
      c.ready = true;
      renderCard(c);
    }
  } // stopped during the countdown: back to ready (nothing was sliced yet)
  if (act === 'vd-file') {
    $('filePick').dataset.into = c.id;
    $('filePick').click();
  }
}

export const privacy = (what: string) =>
  Fenmyr.platform === 'windows'
    ? `Windows Settings → Privacy & security → ${what}`
    : `System Settings → Privacy & Security → ${what}`;
export function init45() {
  // ---------- video cards: record yourself with the camera, or drop in a video file ----------
  SPK = Icon('volume', { size: 15 }) + Icon('volume-off', { size: 15 });
}
