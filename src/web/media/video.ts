// @ts-nocheck
import { cardEl } from '../ui/dom.ts';
import { renderCard } from '../canvas/render.ts';
import { byId, selectOnly } from '../canvas/wires.ts';
import { clamp } from '../core/base.ts';
import { $ } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { fmtT } from './audio.ts';
import { devicePick, openMedia, transcribe } from './devices.ts';
import { card } from '../model/boards.ts';
import { ask } from '../myra/chat.ts';
import { centerWorld } from '../panels/zoomMenu.ts';
import { chirp, say } from '../settings/licenses.ts';
import { settings } from '../settings/settings.ts';
import { applySettings } from '../settings/widgets.ts';
import { addCard } from '../tools/penEdit.ts';
export let SPK;
// the second one shows while it is muted
const vids = new Map();
export const cams = new Map();
const VBAR = 44;

// flip: what you see is what you record. On (the default) mirrors you like a selfie; off shows the room the right way round, so writing reads normally
const camFlip = () => settings.camFlip !== false;

function paintLook() {
  cams.forEach(cam => {
    cam.view.style.transform = camFlip() ? 'scaleX(-1)' : 'none';
  });
}

const vEl = id => cardEl(id);

export function setupVideo(c, el) {
  if (c.src) {
    let v = vids.get(c.id);
    if (!v) {
      v = document.createElement('video');
      v.className = 'vd-v';
      v.playsInline = true;
      v.preload = 'metadata';
      if (c.poster) v.poster = c.poster;
      vids.set(c.id, v);
      Fenmyr.mediaURL(c.src).then(u => {
        if (u) v.src = u;
      });
      const paint = () => {
        const e2 = vEl(c.id);
        if (!e2) return;
        const f = (v.currentTime || 0) / (v.duration || c.dur || 1);
        const bar = e2.querySelector('.vd-prog i');
        if (bar) bar.style.width = (f * 100).toFixed(2) + '%';
        const t = e2.querySelector('.vd-time');
        if (t)
          t.textContent =
            v.paused && !v.currentTime
              ? fmtT(c.dur || v.duration || 0)
              : `${fmtT(v.currentTime)} / ${fmtT(c.dur || v.duration || 0)}`;
      };
      v.addEventListener('timeupdate', paint);
      v.addEventListener('seeked', paint);
      ['play', 'pause', 'ended'].forEach(t =>
        v.addEventListener(t, () => {
          vEl(c.id)?.classList.toggle('playing', !v.paused);
          paint();
        }),
      );
      v.addEventListener('loadedmetadata', () => {
        if (!c.dur && isFinite(v.duration)) {
          c.dur = v.duration;
          save();
        }
        paint();
      });
    }
    v.muted = !!c.muted;
    v.style.transform = c.mirror ? 'scaleX(-1)' : '';
    el.querySelector('.vd-v').replaceWith(v);
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

export async function camOn(c) {
  if (cams.has(c.id)) return cams.get(c.id);
  let stream;
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
  const cam = { stream, view, idle: 0 };
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

export function camOff(id) {
  const cam = cams.get(id);
  if (!cam) return;
  clearInterval(cam.tick);
  cam.stream.getTracks().forEach(t => t.stop());
  cams.delete(id);
}

async function videoRecord(c) {
  const cam = await camOn(c);
  if (!cam) return;
  const type =
    ['video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find(
      t => window.MediaRecorder && MediaRecorder.isTypeSupported(t),
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
    chunks = [];
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
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
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
    if (Date.now() - cam.t0 > 15 * 60 * 1000) return videoAct(c, 'vd-stop'); // a 15 minute limit keeps files a sensible size
    setTimeout(clock, 250);
  })();
}

// a still from the video (for the poster and the board's thumbnails), plus its size and length
function videoInfo(url) {
  return new Promise(res => {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.src = url;
    let done = false;
    const finish = poster => {
      if (done) return;
      done = true;
      res({ poster, vw: v.videoWidth, vh: v.videoHeight, dur: isFinite(v.duration) ? v.duration : 0 });
    };
    v.onloadeddata = () => {
      try {
        v.currentTime = Math.min(0.3, (v.duration || 1) / 10);
      } catch (e) {
        finish('');
      }
    };
    v.onseeked = () => {
      try {
        const W = 480,
          cv = document.createElement('canvas');
        cv.width = W;
        cv.height = Math.round((W * v.videoHeight) / (v.videoWidth || 1)) || 270;
        cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height);
        finish(cv.toDataURL('image/jpeg', 0.8));
      } catch (e) {
        finish('');
      }
    };
    v.onerror = () => finish('');
    setTimeout(() => finish(''), 8000);
  });
}

export async function fillVideo(c, blob, secs) {
  if (blob.size > 1024 * 1024 * 1024)
    return say('That video is over 1 GB, which is too big for a board. Try a shorter clip ✦', 7000);
  c.rec = false;
  c.ready = false;
  c.count = 0;
  c.saving = true;
  c.pct = 0;
  c.title = c.title || (blob.name ? blob.name.replace(/\.[^.]+$/, '') : 'Video');
  renderCard(c);
  const local = URL.createObjectURL(blob),
    info = await videoInfo(local);
  URL.revokeObjectURL(local);
  let src;
  try {
    src = await Fenmyr.saveMedia(blob, f => {
      c.pct = f;
      const s2 = vEl(c.id)?.querySelector('.vd-msg span');
      if (s2) s2.textContent = Math.round(f * 100) + '%';
    });
  } catch (e) {
    c.saving = false;
    c.ready = true;
    renderCard(c);
    return say("I couldn't save that video: " + e.message, 8000);
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

export function addVideo(file, at) {
  const p = at || centerWorld(),
    c = card('video', { title: file.name.replace(/\.[^.]+$/, '') });
  c.x = p.x - c.w / 2;
  c.y = p.y - c.h / 2;
  addCard(c);
  fillVideo(c, file);
}

export function videoAct(c, act, e) {
  const v = vids.get(c.id),
    el = vEl(c.id);
  if (act === 'vd-play' && v) {
    if (v.paused) {
      if (v.ended) v.currentTime = 0;
      v.play().catch(() => {});
    } else v.pause();
  }
  if (act === 'vd-seek' && v && e) {
    const r = el.querySelector('.vd-prog').getBoundingClientRect();
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
    return transcribe(c, true);
  }
  if (act === 'vd-notes')
    return ask(
      `This is what I said in a video I recorded (card ${c.id}). Turn it into short notes on the board, placed just to the right of that card, grouped if there are a few ideas:\n"${c.text}"`,
    );
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
  if (act === 'vd-dev')
    return devicePick(
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

export const privacy = what =>
  Fenmyr.platform === 'windows'
    ? `Windows Settings → Privacy & security → ${what}`
    : `System Settings → Privacy & Security → ${what}`;
export function init45() {
  // ---------- video cards: record yourself with the camera, or drop in a video file ----------
  SPK = Icon('volume', { size: 15 }) + Icon('volume-off', { size: 15 });
}
