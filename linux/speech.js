// Voice memo → words, on this computer, with whisper.cpp (the Mac app uses Apple's speech recognition).
// Optional: without whisper.cpp, memos still record and play; they just aren't written out.
//   the program: whisper-cli (or whisper-cpp / whisper.cpp / main), from the AUR package whisper.cpp or built yourself
//   the model:   $MB_WHISPER_MODEL, or ~/.local/share/myra/whisper/ggml-<size>.bin, downloaded on first use
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const P = require('./paths'), { run } = require('./claude'), { download } = require('./net');

const MODEL = process.env.MB_WHISPER_SIZE || 'base';   // tiny, base, small, medium… base is quick on any CPU and good with clear speech
const modelFile = () => process.env.MB_WHISPER_MODEL || path.join(P.whisperDir, `ggml-${MODEL}.bin`);
const modelURL = () => `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${MODEL}.bin`;

function whisperPath() {
  const dirs = (process.env.PATH || '').split(':').concat([path.join(os.homedir(), '.local/bin'), '/usr/local/bin', '/usr/bin']);
  for (const name of ['whisper-cli', 'whisper-cpp', 'whisper.cpp', 'whisper-main']) {
    for (const d of dirs) { const f = path.join(d, name); try { fs.accessSync(f, fs.constants.X_OK); return f; } catch (e) {} }
  }
  return null;
}

let downloading = null;
function downloadModel() {
  if (downloading) return downloading;
  fs.mkdirSync(path.dirname(modelFile()), { recursive: true });
  downloading = download(modelURL(), modelFile(), 1800).finally(() => { downloading = null; });
  return downloading;
}

// "ok" when memos can be written out, "off" when they can't (the page then says how to turn it on)
function speechAuth() { return whisperPath() ? 'ok' : 'off'; }

async function transcribe(dataURL) {
  const comma = String(dataURL).indexOf(','); if (comma < 0) throw new Error("couldn't read that recording");
  const bin = whisperPath();
  if (!bin) throw new Error('To have Myra write out voice memos, install whisper.cpp (yay -S whisper.cpp), then try again.');
  if (!fs.existsSync(modelFile())) {
    if (downloading) throw new Error('Still getting the speech model ready. Try again in a minute ✦');
    downloadModel().catch(() => {});
    throw new Error(`Getting the speech model ready (one time, about ${MODEL === 'tiny' ? 75 : MODEL === 'base' ? 140 : 500} MB). Try again in a minute ✦`);
  }
  // the page hands over 16 kHz mono WAV (converted in preload.js), which is what whisper reads
  const wav = path.join(os.tmpdir(), `myra-memo-${crypto.randomUUID()}.wav`);
  fs.writeFileSync(wav, Buffer.from(String(dataURL).slice(comma + 1), 'base64'));
  try {
    const r = await run(bin, ['-m', modelFile(), '-f', wav, '-l', 'auto', '-nt', '-np'], 300);
    if (r.code !== 0) throw new Error((r.err.toString('utf8').trim().split('\n').pop() || 'Speech recognition failed').slice(0, 300));
    return r.out.toString('utf8').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
  } finally { fs.rmSync(wav, { force: true }); }
}

module.exports = { speechAuth, transcribe, whisperPath, downloadModel, modelFile };
