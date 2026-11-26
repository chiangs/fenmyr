// A prompt too big for one command-line argument still reaches Claude Code, with no window: Linux refuses any single
// argument of 128 KiB or more (spawn fails with E2BIG), so the prompt goes on stdin. A stand-in Claude Code logs how many
// bytes it was sent and the end of them, for Myra's question on a board of 400 notes and for a code run's prompt of 200 KB.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-big-prompt-')));
// read as the host modules load: the stand-in is found at ~/.local/bin/claude, and usage is kept under XDG_DATA_HOME
process.env.HOME = work;
process.env.XDG_DATA_HOME = work;
const log = path.join(work, 'sent.jsonl'),
  whole = path.join(work, 'prompt.txt');
fs.mkdirSync(path.join(work, '.local/bin'), { recursive: true });
// one result line answers both `--output-format json` and `stream-json`
fs.writeFileSync(
  path.join(work, '.local/bin/claude'),
  `#!${process.execPath}
const fs = require('node:fs');
const prompt = fs.readFileSync(0, 'utf8');
fs.writeFileSync(${JSON.stringify(whole)}, prompt);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ bytes: Buffer.byteLength(prompt), tail: prompt.slice(-200) }) + '\\n');
console.log(JSON.stringify({ type: 'result', is_error: false, result: JSON.stringify({ say: 'ok' }) }));
`,
  { mode: 0o755 },
);
const { ask } = await import('../src/host/claude.ts');
const { claudeCode } = await import('../src/host/claudeCode.ts');

const sent = (): { bytes: number; tail: string }[] =>
  fs
    .readFileSync(log, 'utf8')
    .trim()
    .split('\n')
    .map(s => JSON.parse(s));

// one argument can hold 131,072 bytes at most on Linux
const ARG_MAX = 131_072;

const cards = Array.from({ length: 400 }, (_, i) => ({
  id: `c${i}`,
  type: 'note',
  x: i,
  y: i,
  w: 220,
  h: 140,
  text: 'word '.repeat(60),
}));
assert.strictEqual(await ask({ prompt: 'hi', board: { cards }, confirmed: false }), '{"say":"ok"}', 'Myra answers');
const [question] = sent();
assert((question?.bytes ?? 0) > ARG_MAX, `a question on 400 notes is over one argument: ${question?.bytes} bytes`);
assert(fs.readFileSync(whole, 'utf8').includes('c399'), 'and holds the last card');

const folder = path.join(work, 'folder');
fs.mkdirSync(folder);
const said = await claudeCode(
  { cwd: folder, prompt: `${'x'.repeat(200_000)}END`, readable: [], access: 'read' },
  () => {},
);
assert.strictEqual(said, '{"say":"ok"}', 'a code run is answered');
const code = sent()[1];
assert.strictEqual(code?.bytes, 200_003, 'a code run is sent all of its prompt');
assert(code.tail.endsWith('END'), 'to its end');

fs.rmSync(work, { recursive: true, force: true });
console.log('BIG PROMPT OK');
