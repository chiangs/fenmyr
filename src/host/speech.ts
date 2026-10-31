// Voice memos become words with whisper.cpp, on this computer. It's optional: without it, memos still record and play.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { download } from './net.ts';
import P from './paths.ts';
import { run, which } from './util.ts';

const MODEL = process.env.FENMYR_WHISPER_SIZE || 'base'; // base is quick on any CPU and good with clear speech
const modelFile = () => process.env.FENMYR_WHISPER_MODEL || path.join(P.whisperDir, `ggml-${MODEL}.bin`);
const modelURL = () => `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${MODEL}.bin`;

function whisperPath() {
  const dirs = [
    ...(process.env.PATH || '').split(':'),
    path.join(os.homedir(), '.local/bin'),
    '/usr/local/bin',
    '/usr/bin',
  ];
  for (const name of ['whisper-cli', 'whisper-cpp', 'whisper.cpp', 'whisper-main']) {
    const f = which(name, dirs);
    if (f) return f;
  }
  return null;
}

let downloading: Promise<void> | null = null;
function downloadModel() {
  if (downloading) return downloading;
  fs.mkdirSync(path.dirname(modelFile()), { recursive: true });
  downloading = download(modelURL(), modelFile(), 1800).finally(() => {
    downloading = null;
  });
  return downloading;
}

export const speechAuth = () => (whisperPath() ? 'ok' : 'off');

export async function transcribe(dataURL: string): Promise<string> {
  const comma = dataURL.indexOf(',');
  if (comma < 0) throw new Error("couldn't read that recording");
  const bin = whisperPath();
  if (!bin) throw new Error('To write out voice memos, install whisper.cpp (yay -S whisper.cpp), then try again.');
  if (!fs.existsSync(modelFile())) {
    if (downloading) throw new Error('Still getting the speech model ready. Try again in a minute ✦');
    downloadModel().catch(() => {});
    throw new Error(
      `Getting the speech model ready (one time, about ${MODEL === 'tiny' ? 75 : MODEL === 'base' ? 140 : 500} MB). Try again in a minute ✦`,
    );
  }
  // 16 kHz mono WAV, which is what whisper reads (preload.ts converts the page's recordings)
  const wav = path.join(os.tmpdir(), `fenmyr-memo-${crypto.randomUUID()}.wav`);
  fs.writeFileSync(wav, Buffer.from(dataURL.slice(comma + 1), 'base64'));
  try {
    const r = await run(bin, ['-m', modelFile(), '-f', wav, '-l', 'auto', '-nt', '-np'], 300);
    if (r.code !== 0)
      throw new Error((r.err.toString('utf8').trim().split('\n').pop() || 'Speech recognition failed').slice(0, 300));
    return r.out
      .toString('utf8')
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  } finally {
    fs.rmSync(wav, { force: true });
  }
}
