import type { CardOf } from '../../shared/model.ts';

// a video's sound, as a plain 16 kHz mono WAV: what the Mac's speech recognizer and Whisper both read
export async function videoAudio(c: CardOf<'video'>) {
  let buf: AudioBuffer;
  try {
    const ab = await (await fetch(await Fenmyr.mediaURL(c.src ?? ''))).arrayBuffer(),
      ac = new AudioContext();
    buf = await ac.decodeAudioData(ab);
    ac.close();
  } catch (e) {
    throw new Error('This video has no sound to write out.');
  }
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(buf.duration * 16000)), 16000),
    s = off.createBufferSource();
  s.buffer = buf;
  s.connect(off.destination);
  s.start();
  const pcm = (await off.startRendering()).getChannelData(0),
    n = pcm.length,
    out = new DataView(new ArrayBuffer(44 + n * 2));
  const str = (o: number, t: string) => [...t].forEach((ch, i) => out.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF');
  out.setUint32(4, 36 + n * 2, true);
  str(8, 'WAVEfmt ');
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, 1, true);
  out.setUint32(24, 16000, true);
  out.setUint32(28, 32000, true);
  out.setUint16(32, 2, true);
  out.setUint16(34, 16, true);
  str(36, 'data');
  out.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i] ?? 0)) * 0x7fff, true);
  const u8 = new Uint8Array(out.buffer);
  let bin = '';
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return 'data:audio/wav;base64,' + btoa(bin);
}
