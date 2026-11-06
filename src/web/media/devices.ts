import type { CardOf } from '../../shared/model.ts';
import { renderCard } from '../canvas/render.ts';
import { selectOnly } from '../canvas/wires.ts';
import { clamp } from '../core/base.ts';
import { cardsEl } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { appState, session } from '../core/state.ts';
import type { MenuItem } from '../features/export.ts';
import { boardMenu } from '../features/export.ts';
import { ask } from '../myra/chat.ts';
import { removeSelected } from '../myra/helpers.ts';
import { say } from '../myra/say.ts';
import { settings } from '../settings/settings.ts';
import { applySettings } from '../settings/widgets.ts';
import { cardEl, esc } from '../ui/dom.ts';
import { fmtT, live, PAUSE, PLAY, players, warmMic, warmT } from './audio.ts';
import { privacy, videoAct } from './video.ts';
import { videoAudio } from './wav.ts';

type AudioCard = CardOf<'audio'>;
type DeviceKind = [kind: MediaDeviceKind, title: string, setting: 'micId' | 'camId'];
const errorName = (e: unknown) => (e instanceof Error ? e.name : '');
const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---------- which camera and microphone: the person picks, Myra remembers, and falls back to the default if one is unplugged ----------
const micC = () => (settings.micId ? { deviceId: { exact: settings.micId } } : true);

export async function openMedia(video: boolean) {
  const want = () => ({
    audio: micC(),
    video: video
      ? {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          ...(settings.camId ? { deviceId: { exact: settings.camId } } : {}),
        }
      : false,
  });
  try {
    return await navigator.mediaDevices.getUserMedia(want());
  } catch (e) {
    if (!/Overconstrained|NotFound|NotReadable/.test(errorName(e)) || !(settings.micId || settings.camId)) throw e;
    delete settings.micId;
    delete settings.camId;
    applySettings();
    return navigator.mediaDevices.getUserMedia(want());
  }
}

export const devName = (track: { label?: string } | null | undefined, fallback: string) =>
  (track?.label || fallback)
    .replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, '')
    .replace(/^(Default|Communications) - /, '')
    .trim() || fallback;

const deviceLabel = (on: boolean, name: string) => {
  const tick = on ? '✓' : '',
    shown = esc(name);
  return `<span class="dm-ck">${tick}</span>${shown}`;
};

// the little menu: cameras (for video) and microphones, the one in use checked
export async function devicePick(e: MouseEvent, kinds: DeviceKind[], onPick: () => unknown) {
  let list: MediaDeviceInfo[] = [];
  try {
    list = await navigator.mediaDevices.enumerateDevices();
  } catch (_er) {}
  const items: MenuItem[] = [];
  for (const [kind, title, key] of kinds) {
    const ds = list.filter(d => d.kind === kind && d.deviceId && d.deviceId !== 'communications');
    if (!ds.length) continue;
    if (items.length) items.push('-');
    items.push({ label: `<span class="dm-h">${title}</span>`, run: () => {} });
    const def = ds.find(d => d.deviceId === 'default'),
      cur =
        settings[key] ||
        ((def && ds.find(d => d.deviceId !== 'default' && d.groupId === def.groupId)) || def || ds[0])?.deviceId; // "default" is a stand-in: check the real device behind it
    ds.filter(d => !(d.deviceId === 'default' && ds.length > 1)).forEach(d => {
      items.push({
        label: deviceLabel(d.deviceId === cur, devName(d, title)),
        run: () => {
          settings[key] = d.deviceId;
          applySettings();
          onPick();
        },
      });
    });
  }
  if (!items.length) items.push({ label: 'No devices found', run: () => {} });
  boardMenu(e, items);
}

export async function readyToRecord() {
  if (appState.micOK) {
    if (!appState.warm)
      try {
        warmMic(await openMedia(false));
      } catch (_e) {}
    return true;
  }
  try {
    warmMic(await openMedia(false));
  } catch (_e) {
    say(`Fenmyr needs the microphone for voice memos. Turn it on in ${privacy('Microphone')}, then try again ✦`, 10000);
    return false;
  }
  appState.micOK = true;
  const sp = await Fenmyr.speechAuth().catch(() => 'off');
  if (sp === 'off')
    say(
      'Recording works! To have me write memos out, install whisper.cpp (yay -S whisper.cpp) and I’ll do it on your computer.',
      9000,
    );
  return true;
}

async function record(c: AudioCard) {
  let stream = appState.warm?.active ? appState.warm : null;
  appState.warm = null;
  clearTimeout(warmT);
  try {
    if (!stream) stream = await openMedia(false);
  } catch (_e) {
    say(`I can't hear you yet. Let Fenmyr use the microphone (${privacy('Microphone')}), then try again.`, 9000);
    if (!c.src) {
      session.sel = new Set([c.id]);
      removeSelected();
    }
    return;
  }
  const chunks: Blob[] = [],
    recorder = new MediaRecorder(stream),
    ac = new AudioContext(),
    an = ac.createAnalyser();
  an.fftSize = 256;
  ac.createMediaStreamSource(stream).connect(an);
  const L = { recorder, stream, ac, start: Date.now(), paused: 0, pausedAt: 0 };
  live.set(c.id, L);
  c.rec = true;
  c.ready = false;
  c.paused = false;
  c.starting = true;
  renderCard(c);
  selectOnly([c.id]);
  recorder.onstart = () => {
    c.starting = false;
    L.start = Date.now();
    renderCard(c);
  }; // only say "Recording…" once it's really listening
  recorder.ondataavailable = e => chunks.push(e.data);
  recorder.onstop = async () => {
    stream.getTracks().forEach(t => {
      t.stop();
    });
    ac.close();
    live.delete(c.id);
    const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/mp4' }),
      url = await new Promise<string>(r => {
        const fr = new FileReader();
        fr.onload = () => r(String(fr.result));
        fr.readAsDataURL(blob);
      });
    let wave: number[] = [],
      dur = (Date.now() - L.start - L.paused) / 1000;
    try {
      const buf = await new AudioContext().decodeAudioData(await blob.arrayBuffer()),
        d = buf.getChannelData(0),
        n = 44,
        step = Math.floor(d.length / n);
      dur = buf.duration;
      for (let i = 0; i < n; i++) {
        let m = 0;
        for (let j = i * step; j < (i + 1) * step; j += 16) m = Math.max(m, Math.abs(d[j] ?? 0));
        wave.push(m);
      }
      const top = Math.max(...wave, 0.01);
      wave = wave.map(v => +(v / top).toFixed(2));
    } catch (_e) {
      wave = Array(44).fill(0.3);
    }
    const when = new Date();
    Object.assign(c, {
      rec: false,
      paused: false,
      src: url,
      dur,
      wave,
      text: '',
      txNote: '',
      title:
        c.title ||
        `Voice memo · ${when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`,
    });
    renderCard(c);
    save();
    transcribe(c);
  };
  // count 3·2·1 right away while the mic wakes up in the background; recording starts on "go" once real sound is coming in
  (async () => {
    const buf = new Uint8Array(an.fftSize),
      awake = () => {
        an.getByteTimeDomainData(buf);
        return buf.some(v => Math.abs(v - 128) > 1);
      };
    for (const n of [3, 2, 1]) {
      c.count = n;
      renderCard(c);
      await new Promise(r => setTimeout(r, 650));
      if (!live.has(c.id)) return;
    }
    const t0 = Date.now();
    if (!awake()) {
      c.count = 'connecting';
      renderCard(c);
    }
    while (!awake() && Date.now() - t0 < 8000) {
      await new Promise(r => setTimeout(r, 60));
      if (!live.has(c.id)) return;
    }
    c.count = 0;
    recorder.start(250);
  })();
  const cv = () => {
      const el = cardsEl.querySelector(`[data-id="${c.id}"] .au-live`);
      return el instanceof HTMLCanvasElement ? el : null;
    },
    data = new Uint8Array(an.frequencyBinCount);
  (function draw() {
    if (!live.has(c.id)) return;
    const el = cardEl(c.id),
      canvas = cv();
    if (canvas) {
      // the canvas matches the size it's shown at, so the bars grow with the card instead of stretching
      const W = Math.round(canvas.clientWidth * 2),
        H = Math.round(canvas.clientHeight * 2);
      if (W && H && (canvas.width !== W || canvas.height !== H)) {
        canvas.width = W;
        canvas.height = H;
      }
      const g = canvas.getContext('2d');
      an.getByteTimeDomainData(data);
      if (!g) return;
      g.clearRect(0, 0, canvas.width, canvas.height);
      g.fillStyle = '#e88a24';
      const step = canvas.width / 44,
        bw = step * 0.58,
        r = Math.min(bw / 2, 6);
      for (let i = 0; i < 44; i++) {
        const v = Math.abs((data[Math.floor((i * data.length) / 44)] ?? 128) - 128) / 128,
          h = Math.min(canvas.height, Math.max(bw, v * canvas.height * 2.2));
        g.beginPath();
        g.roundRect(i * step, (canvas.height - h) / 2, bw, h, r);
        g.fill();
      }
    }
    const t = el?.querySelector('.au-time');
    if (t && !c.paused) t.textContent = fmtT((Date.now() - L.start - L.paused) / 1000);
    requestAnimationFrame(draw);
  })();
}

export async function transcribe(c: AudioCard | CardOf<'video'>) {
  try {
    const text = await Fenmyr.transcribe(c.type === 'video' ? await videoAudio(c) : (c.src ?? ''));
    c.text = (text || '').trim();
    c.txNote = c.text ? '' : "I couldn't make out any words in that one.";
  } catch (e) {
    c.txNote = messageOf(e);
  }
  c.needTx = false;
  renderCard(c);
  save();
  const what = c.type === 'video' ? 'video' : 'voice memo';
  if (c.text && (!settings.ai || appState.haveClaude === false)) say(`Your ${what} is written out ✦`, 4000);
  else if (c.text)
    say(`Your ${what} is written out ✦ Want me to turn it into notes?`, 6000, [
      { label: 'Turn into notes', run: () => (c.type === 'video' ? videoAct(c, 'vd-notes') : audioAct(c, 'au-notes')) },
      { label: 'Not now', ghost: true, run: () => {} },
    ]);
}

export function audioAct(c: AudioCard, act: string, e?: MouseEvent) {
  const L = live.get(c.id),
    el = cardEl(c.id);
  if (act === 'au-stop' && L) {
    if (L.recorder.state !== 'inactive') L.recorder.stop();
    else {
      L.stream.getTracks().forEach(t => {
        t.stop();
      });
      L.ac.close();
      live.delete(c.id);
      c.rec = false;
      c.count = 0;
      c.starting = false;
      if (!c.src) c.ready = true;
      renderCard(c);
      save();
    }
  } // stopped before it began
  if (act === 'au-pause' && L && L.recorder.state === 'inactive') return;
  if (act === 'au-pause' && L) {
    if (c.paused) {
      L.recorder.resume();
      L.paused += Date.now() - L.pausedAt;
    } else {
      L.recorder.pause();
      L.pausedAt = Date.now();
    }
    c.paused = !c.paused;
    renderCard(c);
  }
  if (act === 'au-start') {
    readyToRecord().then(ok => {
      if (ok) record(c);
    });
    return;
  }
  if (act === 'au-tx') {
    transcribe(c);
    return;
  }
  if (act === 'au-dev' && e) {
    devicePick(e, [['audioinput', 'Microphone', 'micId']], async () => {
      if (appState.warm) {
        appState.warm.getTracks().forEach(t => {
          t.stop();
        });
        appState.warm = null;
      }
      await readyToRecord();
      renderCard(c);
    });
    return;
  }
  if (act === 'au-replace') {
    players.get(c.id)?.pause();
    players.delete(c.id);
    record(c);
  }
  if (act === 'au-notes')
    ask(
      `This is a voice memo I recorded (card ${c.id}). Turn it into short notes on the board, placed just to the right of that card, grouped if there are a few ideas:\n"${c.text}"`,
    );
  if (act === 'au-play' || act === 'au-seek') {
    let p = players.get(c.id);
    if (!p) {
      p = new Audio(c.src);
      players.set(c.id, p);
    }
    if (act === 'au-seek' && e) {
      const wave = el?.querySelector('.au-wave');
      if (!wave) return;
      const r = wave.getBoundingClientRect();
      p.currentTime = clamp((e.clientX - r.left) / r.width, 0, 1) * (c.dur || p.duration || 0);
      if (p.paused) p.play();
    } else if (p.paused) p.play();
    else p.pause();
    const tick = () => {
      const e2 = cardEl(c.id);
      if (!e2) return;
      const f = (p.currentTime || 0) / (c.dur || p.duration || 1);
      e2.querySelectorAll('.au-wave i').forEach((b, i, all) => {
        b.classList.toggle('past', i / all.length < f);
      });
      const time = e2.querySelector('.au-time'),
        pb = e2.querySelector('.au-play');
      if (time) time.textContent = `${fmtT(p.currentTime || 0)} / ${fmtT(c.dur || 0)}`;
      if (!pb) return;
      pb.innerHTML = p.paused ? PLAY : PAUSE;
      pb.classList.toggle('on', !p.paused);
      if (!p.paused) requestAnimationFrame(tick);
    };
    p.onended = tick;
    requestAnimationFrame(tick);
  }
}
