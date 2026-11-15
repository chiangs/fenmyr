import fs from 'node:fs';
import path from 'node:path';
import type { Launched } from './launch.ts';

// A stand-in Claude Code for builds, told before each build what to do: the files it writes in the prototype's folder,
// reported the way stream-json does, whether it waits for a release after each file but the last (`pause`) and before it
// ends (`hold`), and whether it ends with a failure instead of `reply`. It counts each file it has reported. Any other
// question gets a short answer, and its prompt is logged.
type BuildScript = {
  files: Record<string, string>;
  pause?: boolean;
  hold?: boolean;
  fail?: string;
  reply?: string;
};

/** Writes the stand-in to `file`, working in `work`. */
function writeBuildStandIn(file: string, work: string) {
  const script = path.join(work, 'next.json'),
    wrote = path.join(work, 'wrote'),
    asks = path.join(work, 'asks.log');
  // the nth wait goes on once gate-n exists, so a release that comes before its wait isn't lost
  const gate = (n: number) => path.join(work, `gate-${n}`);
  fs.mkdirSync(work, { recursive: true });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const say = j => console.log(JSON.stringify(j));
if (process.argv[2] !== '-p') process.exit(0);
if (!process.argv.includes('stream-json')) {
  fs.appendFileSync(${JSON.stringify(asks)}, JSON.stringify(process.argv[3] ?? '') + '\\n');
  say({ type: 'result', is_error: false, result: JSON.stringify({ say: 'ok' }) });
} else {
  const s = JSON.parse(fs.readFileSync(${JSON.stringify(script)}, 'utf8'));
  let waits = 0;
  const wait = async () => {
    const gate = path.join(${JSON.stringify(work)}, 'gate-' + ++waits);
    while (!fs.existsSync(gate)) await new Promise(r => setTimeout(r, 50));
  };
  (async () => {
    const files = Object.entries(s.files);
    for (const [i, [file, body]] of files.entries()) {
      const at = path.resolve(file);
      fs.mkdirSync(path.dirname(at), { recursive: true });
      fs.writeFileSync(at, body);
      say({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: at } }] } });
      fs.writeFileSync(${JSON.stringify(wrote)}, String(i + 1));
      if (s.pause && i < files.length - 1) await wait();
    }
    if (s.hold) await wait();
    say({ type: 'result', is_error: !!s.fail, result: s.fail ?? s.reply ?? 'I built it.' });
  })();
}
`,
    { mode: 0o755 },
  );
  let released = 0;
  return {
    next(s: BuildScript) {
      for (const f of fs.readdirSync(work)) if (f.startsWith('gate-') || f === 'wrote') fs.rmSync(path.join(work, f));
      released = 0;
      fs.writeFileSync(script, JSON.stringify(s));
    },
    release: () => fs.writeFileSync(gate(++released), ''),
    // how many files this build has reported so far
    wrote: () => (fs.existsSync(wrote) ? Number(fs.readFileSync(wrote, 'utf8')) : 0),
    // every question's prompt, oldest first
    asks: (): string[] =>
      fs.existsSync(asks)
        ? fs
            .readFileSync(asks, 'utf8')
            .split('\n')
            .filter(Boolean)
            .map(l => String(JSON.parse(l)))
        : [],
  };
}

/** The stand-in where the app launched with `claude: true` finds Claude Code. */
export const buildStandIn = (l: Launched) =>
  writeBuildStandIn(path.join(l.data, '.local/bin/claude'), path.join(l.data, 'build-standin'));
