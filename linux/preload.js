// The canvas talks to its host through window.webkit.messageHandlers.mb, like on the Mac (WKWebView).
// Here that's a small stand-in that hands each {id, op, args} to the main process; the answer arrives as __mbReply(id, ok, value).
const { contextBridge, ipcRenderer } = require('electron');

// voice memos arrive as webm/opus; whisper wants 16 kHz mono WAV, and the page can decode audio itself, so it's converted here
async function toWav16k(dataURL) {
  const bytes = Uint8Array.from(atob(dataURL.slice(dataURL.indexOf(',') + 1)), c => c.charCodeAt(0));
  // decoded with an offline context: a live AudioContext holds the sound device, and Chromium only allows a few at a time
  const decoded = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(bytes.buffer);
  const rate = 16000, len = Math.max(1, Math.ceil(decoded.duration * rate));
  const off = new OfflineAudioContext(1, len, rate), src = off.createBufferSource();
  src.buffer = decoded; src.connect(off.destination); src.start();
  const pcm = (await off.startRendering()).getChannelData(0);
  const buf = new DataView(new ArrayBuffer(44 + pcm.length * 2)), str = (o, s) => [...s].forEach((ch, i) => buf.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF'); buf.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE'); str(12, 'fmt '); buf.setUint32(16, 16, true);
  buf.setUint16(20, 1, true); buf.setUint16(22, 1, true); buf.setUint32(24, rate, true); buf.setUint32(28, rate * 2, true);
  buf.setUint16(32, 2, true); buf.setUint16(34, 16, true); str(36, 'data'); buf.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) buf.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
  let bin = ''; const u8 = new Uint8Array(buf.buffer); for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return 'data:audio/wav;base64,' + btoa(bin);
}

contextBridge.exposeInMainWorld('webkit', {
  messageHandlers: {
    mb: {
      postMessage: async msg => {
        if (msg && msg.op === 'transcribe' && msg.args && msg.args.audio && !String(msg.args.audio).startsWith('data:audio/wav')) {
          try { msg = { ...msg, args: { ...msg.args, audio: await toWav16k(msg.args.audio) } }; } catch (e) { /* let the host report it */ }
        }
        ipcRenderer.send('mb', msg);
      },
    },
  },
});
// answers come back over IPC (structured data, nothing turned into script) and are handed to the page's __mbReply
ipcRenderer.on('mb-reply', (e, id, ok, value) => contextBridge.executeInMainWorld({ func: (i, o, v) => window.__mbReply && window.__mbReply(i, o, v), args: [id, ok, value] }));

// news from the host that nobody asked for (Caelestia's colours changed) goes to the page's __mbEvent(name, data)
ipcRenderer.on('mb-event', (e, name, data) => contextBridge.executeInMainWorld({ func: (n, d) => window.__mbEvent && window.__mbEvent(n, d), args: [name, data] }));

// the window buttons the page draws (the window has no title bar of its own)
contextBridge.exposeInMainWorld('mbWindow', {
  minimize: () => ipcRenderer.send('win', 'minimize'),
  maximize: () => ipcRenderer.send('win', 'maximize'),
  close: () => ipcRenderer.send('win', 'close'),
});
