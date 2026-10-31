// The page reaches the host only through window.fenmyrHost.post({id, op, args}); answers arrive as __fenmyrReply(id, ok, value).
import { contextBridge, ipcRenderer } from 'electron';

declare global {
  interface Window {
    __fenmyrReply?: (id: number, ok: boolean, value: unknown) => void;
    __fenmyrEvent?: (name: string, data: unknown) => void;
  }
}

// voice memos arrive as webm/opus and whisper wants 16 kHz mono WAV; the page can decode audio itself, so it's converted here
async function toWav16k(dataURL: string) {
  const bytes = Uint8Array.from(atob(dataURL.slice(dataURL.indexOf(',') + 1)), c => c.charCodeAt(0));
  // an offline context: a live AudioContext holds the sound device, and Chromium only allows a few at a time
  const decoded = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(bytes.buffer);
  const rate = 16000;
  const len = Math.max(1, Math.ceil(decoded.duration * rate));
  const off = new OfflineAudioContext(1, len, rate);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const pcm = (await off.startRendering()).getChannelData(0);
  const buf = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) buf.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  buf.setUint32(4, 36 + pcm.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  buf.setUint32(16, 16, true);
  buf.setUint16(20, 1, true);
  buf.setUint16(22, 1, true);
  buf.setUint32(24, rate, true);
  buf.setUint32(28, rate * 2, true);
  buf.setUint16(32, 2, true);
  buf.setUint16(34, 16, true);
  str(36, 'data');
  buf.setUint32(40, pcm.length * 2, true);
  pcm.forEach((sample, i) => {
    buf.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample)) * 0x7fff, true);
  });
  const u8 = new Uint8Array(buf.buffer);
  let bin = '';
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return `data:audio/wav;base64,${btoa(bin)}`;
}

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;

contextBridge.exposeInMainWorld('fenmyrHost', {
  post: async (msg: unknown) => {
    const audio = isRecord(msg) && msg.op === 'transcribe' && isRecord(msg.args) ? msg.args.audio : null;
    if (
      isRecord(msg) &&
      isRecord(msg.args) &&
      typeof audio === 'string' &&
      audio &&
      !audio.startsWith('data:audio/wav')
    ) {
      try {
        ipcRenderer.send('fenmyr', { ...msg, args: { ...msg.args, audio: await toWav16k(audio) } });
        return;
      } catch {
        // the host reports what it can't read
      }
    }
    ipcRenderer.send('fenmyr', msg);
  },
});
// structured data, nothing turned into script
ipcRenderer.on('fenmyr-reply', (_e, id, ok, value) => {
  contextBridge.executeInMainWorld({
    func: (i: number, o: boolean, v: unknown) => window.__fenmyrReply?.(i, o, v),
    args: [id, ok, value],
  });
});
ipcRenderer.on('fenmyr-event', (_e, name, data) => {
  contextBridge.executeInMainWorld({
    func: (n: string, d: unknown) => window.__fenmyrEvent?.(n, d),
    args: [name, data],
  });
});

contextBridge.exposeInMainWorld('fenmyrWindow', {
  minimize: () => ipcRenderer.send('win', 'minimize'),
  maximize: () => ipcRenderer.send('win', 'maximize'),
  close: () => ipcRenderer.send('win', 'close'),
});
