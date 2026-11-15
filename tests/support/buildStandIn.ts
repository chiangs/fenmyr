import fs from 'node:fs';
import path from 'node:path';
import type { Launched } from './launch.ts';

// A stand-in Claude Code for builds, told before each build what to do: the files it writes in the prototype's folder,
// reported the way stream-json does, whether it then waits for `release`, and whether it ends with a failure instead of
// `reply`. Any other question gets a short answer. The app must be launched with `claude: true`.
export type BuildScript = { files: Record<string, string>; hold?: boolean; fail?: string; reply?: string };

export function buildStandIn(l: Launched) {
  const work = path.join(l.data, 'build-standin'),
    script = path.join(work, 'next.json'),
    hold = path.join(work, 'hold');
  fs.mkdirSync(work);
  fs.writeFileSync(
    path.join(l.data, '.local/bin/claude'),
    `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const say = j => console.log(JSON.stringify(j));
if (process.argv[2] !== '-p') process.exit(0);
if (!process.argv.includes('stream-json')) {
  say({ type: 'result', is_error: false, result: JSON.stringify({ say: 'ok' }) });
} else {
  const s = JSON.parse(fs.readFileSync(${JSON.stringify(script)}, 'utf8'));
  for (const [file, body] of Object.entries(s.files)) {
    const at = path.resolve(file);
    fs.mkdirSync(path.dirname(at), { recursive: true });
    fs.writeFileSync(at, body);
    say({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: at } }] } });
  }
  (async () => {
    while (s.hold && fs.existsSync(${JSON.stringify(hold)})) await new Promise(r => setTimeout(r, 50));
    say({ type: 'result', is_error: !!s.fail, result: s.fail ?? s.reply ?? 'I built it.' });
  })();
}
`,
    { mode: 0o755 },
  );
  return {
    next(s: BuildScript) {
      fs.writeFileSync(script, JSON.stringify(s));
      if (s.hold) fs.writeFileSync(hold, '');
    },
    release: () => fs.rmSync(hold, { force: true }),
  };
}
