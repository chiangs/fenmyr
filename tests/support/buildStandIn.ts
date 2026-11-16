import fs from 'node:fs';
import path from 'node:path';
import type { Launched } from './launch.ts';

// A stand-in Claude Code for builds, told before each build what to do: the files it writes in the prototype's folder,
// reported the way stream-json does, whether it waits for a release after each file but the last (`pause`) and before it
// ends (`hold`), how many milliseconds more it takes to end (`ms`), and whether it ends with a failure instead of `reply`. It counts each file it has reported, and logs
// each build's prompt. A run that can only read, as Explain the code's is, writes nothing and answers what it was last
// told to. Any other question gets a short answer, or the one it was last told to give after the wait it was told, and
// its prompt is logged too.
type BuildScript = {
  files: Record<string, string>;
  pause?: boolean;
  hold?: boolean;
  ms?: number;
  fail?: string;
  reply?: string;
};

/** Writes the stand-in to `file`, working in `work`. */
export function writeBuildStandIn(file: string, work: string) {
  const script = path.join(work, 'next.json'),
    wrote = path.join(work, 'wrote'),
    asks = path.join(work, 'asks.log'),
    builds = path.join(work, 'builds.log'),
    answer = path.join(work, 'answer.json'),
    explained = path.join(work, 'explains.log'),
    explaining = path.join(work, 'explain.json'),
    held = path.join(work, 'explain-held');
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
if (process.argv.includes('--tools')) {
  fs.appendFileSync(${JSON.stringify(explained)}, JSON.stringify({ prompt: process.argv[3], args: process.argv.slice(4), cwd: process.cwd() }) + '\\n');
  const told = fs.existsSync(${JSON.stringify(explaining)}) ? JSON.parse(fs.readFileSync(${JSON.stringify(explaining)}, 'utf8')) : {};
  const app = process.ppid;
  (async () => {
    while (fs.existsSync(${JSON.stringify(held)})) {
      if (process.ppid !== app) process.exit(0);
      await new Promise(r => setTimeout(r, 50));
    }
    say({ type: 'result', is_error: !!told.fail, result: told.fail ?? told.reply ?? 'I read the code.' });
  })();
} else if (!process.argv.includes('stream-json')) {
  fs.appendFileSync(${JSON.stringify(asks)}, JSON.stringify(process.argv[3] ?? '') + '\\n');
  const told = fs.existsSync(${JSON.stringify(answer)}) ? JSON.parse(fs.readFileSync(${JSON.stringify(answer)}, 'utf8')) : null;
  setTimeout(
    () => say({ type: 'result', is_error: false, result: JSON.stringify(told ? told.reply : { say: 'ok' }) }),
    told ? told.ms : 0,
  );
} else {
  fs.appendFileSync(${JSON.stringify(builds)}, JSON.stringify(process.argv[3] ?? '') + '\\n');
  const s = JSON.parse(fs.readFileSync(${JSON.stringify(script)}, 'utf8'));
  // an app that doesn't stop Claude Code as it quits, such as one from before builds were stopped, would otherwise wait
  // on this stand-in for ever: it leaves once that app has gone
  const app = process.ppid;
  let waits = 0;
  const wait = async () => {
    const gate = path.join(${JSON.stringify(work)}, 'gate-' + ++waits);
    while (!fs.existsSync(gate)) {
      if (process.ppid !== app) process.exit(0);
      await new Promise(r => setTimeout(r, 50));
    }
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
    if (s.ms) await new Promise(r => setTimeout(r, s.ms));
    say({ type: 'result', is_error: !!s.fail, result: s.fail ?? s.reply ?? 'I built it.' });
  })();
}
`,
    { mode: 0o755 },
  );
  let released = 0;
  const logged = (file: string): string[] =>
    fs.existsSync(file)
      ? fs
          .readFileSync(file, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map(l => String(JSON.parse(l)))
      : [];
  return {
    next(s: BuildScript) {
      for (const f of fs.readdirSync(work)) if (f.startsWith('gate-') || f === 'wrote') fs.rmSync(path.join(work, f));
      released = 0;
      fs.writeFileSync(script, JSON.stringify(s));
    },
    release: () => fs.writeFileSync(gate(++released), ''),
    // her reply to every question from now on, as Myra's JSON, given `ms` after she is asked
    answer: (reply: Record<string, unknown>, ms = 0) => fs.writeFileSync(answer, JSON.stringify({ reply, ms })),
    // how many files this build has reported so far
    wrote: () => (fs.existsSync(wrote) ? Number(fs.readFileSync(wrote, 'utf8')) : 0),
    // every question's prompt, oldest first
    asks: () => logged(asks),
    // every build's prompt, oldest first
    builds: () => logged(builds),
    // What the next run that can only read answers, or how it fails, and whether it waits for `explained` first. Such a
    // run is told apart by --tools, which only it is given.
    explain(e: { reply?: string; fail?: string; hold?: boolean }) {
      fs.writeFileSync(explaining, JSON.stringify(e));
      if (e.hold) fs.writeFileSync(held, '');
    },
    explained: () => fs.rmSync(held, { force: true }),
    // every run that could only read: its prompt, its arguments after the prompt and the folder it ran in
    explains: (): { prompt: string; args: string[]; cwd: string }[] =>
      fs.existsSync(explained)
        ? fs
            .readFileSync(explained, 'utf8')
            .split('\n')
            .filter(Boolean)
            .map(l => JSON.parse(l))
        : [],
  };
}

/** The stand-in where the app launched with `claude: true` finds Claude Code. */
export const buildStandIn = (l: Launched) =>
  writeBuildStandIn(path.join(l.data, '.local/bin/claude'), path.join(l.data, 'build-standin'));
