import fs from 'node:fs';
import path from 'node:path';
import type { Launched } from './launch.ts';

// A stand-in Claude Code that keeps each request's question, prompt, arguments and the bytes of each file it lists, so
// a test can see what Myra was given. A question containing "slow" waits while the `hold` file exists. `started` lists
// the questions it began, with the process of each, even one that was killed before it answered; `reply` is what it
// answers from then on, as Myra's JSON.
type Sent = {
  q: string;
  prompt: string;
  args: string[];
  cwd: string;
  files: { name: string; kind: string; b64: string }[];
};

type Begun = { q: string; pid: number };

// the model and effort a run was given: what follows --model and --effort in its arguments
const after = (args: string[], flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
export const flagsOf = (args: string[]) => ({ model: after(args, '--model'), effort: after(args, '--effort') });

export function askStandIn(l: Launched) {
  const { page } = l;
  const work = path.join(l.data, 'standin'),
    log = path.join(work, 'sent.jsonl'),
    hold = path.join(work, 'hold'),
    begun = path.join(work, 'started.jsonl'),
    told = path.join(work, 'reply.json');
  fs.mkdirSync(work);
  fs.writeFileSync(
    path.join(l.data, '.local/bin/claude'),
    `#!${process.execPath}
const fs = require('node:fs');
if (process.argv[2] !== '-p') process.exit(0);
const prompt = fs.readFileSync(0, 'utf8');
const q = (/The person asked you: (.*)/.exec(prompt) ?? [])[1] ?? '';
const files = [...prompt.matchAll(/^\\d\\. (\\S+) \\(a (picture|text file) they called "([^"]*)"\\)$/gm)].map(m => ({
  name: m[3], kind: m[2], b64: fs.readFileSync(m[1]).toString('base64'),
}));
(async () => {
  fs.appendFileSync(${JSON.stringify(begun)}, JSON.stringify({ q, pid: process.pid }) + '\\n');
  while (q.includes('slow') && fs.existsSync(${JSON.stringify(hold)})) await new Promise(r => setTimeout(r, 50));
  fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ q, prompt, args: process.argv.slice(3), cwd: process.cwd(), files }) + '\\n');
  const reply = fs.existsSync(${JSON.stringify(told)}) ? fs.readFileSync(${JSON.stringify(told)}, 'utf8') : JSON.stringify({ say: 'ok' });
  console.log(JSON.stringify({ type: 'result', is_error: false, result: reply }));
})();
`,
    { mode: 0o755 },
  );

  async function sentWhere(is: (s: Sent) => boolean, what: string): Promise<Sent> {
    for (let i = 0; i < 200; i++) {
      const lines = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : [];
      const hit = lines.map((s): Sent => JSON.parse(s)).find(is);
      if (hit) return hit;
      await page.waitForTimeout(100);
    }
    throw new Error(`not sent: ${what}`);
  }
  const sentFor = (q: string) => sentWhere(s => s.q.endsWith(q), q);
  // a run that is not a question, such as a rewrite, has no question to find it by: its prompt holds these words
  const sentAbout = (words: string) => sentWhere(s => s.prompt.includes(words), words);
  // by the key, since while she works for the board the button is Stop, and only Enter sends another question behind
  async function send(q: string) {
    await page.fill('#mcInput', q);
    await page.press('#mcInput', 'Control+Enter');
  }
  const started = (): Begun[] =>
    fs.existsSync(begun)
      ? fs
          .readFileSync(begun, 'utf8')
          .trim()
          .split('\n')
          .map((line): Begun => JSON.parse(line))
      : [];
  const reply = (r: Record<string, unknown>) => fs.writeFileSync(told, JSON.stringify(r));
  return { sentFor, sentAbout, send, hold, started, reply };
}
