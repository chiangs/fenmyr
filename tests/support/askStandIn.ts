import fs from 'node:fs';
import path from 'node:path';
import type { Launched } from './launch.ts';

// A stand-in Claude Code that keeps each request's question, prompt, arguments and the bytes of each file it lists, so
// a test can see what Myra was given. A question containing "slow" waits while the `hold` file exists.
type Sent = {
  q: string;
  prompt: string;
  args: string[];
  cwd: string;
  files: { name: string; kind: string; b64: string }[];
};

export function askStandIn(l: Launched) {
  const { page } = l;
  const work = path.join(l.data, 'standin'),
    log = path.join(work, 'sent.jsonl'),
    hold = path.join(work, 'hold');
  fs.mkdirSync(work);
  fs.writeFileSync(
    path.join(l.data, '.local/bin/claude'),
    `#!${process.execPath}
const fs = require('node:fs');
if (process.argv[2] !== '-p') process.exit(0);
const prompt = process.argv[3] ?? '';
const q = (/The person asked you: (.*)/.exec(prompt) ?? [])[1] ?? '';
const files = [...prompt.matchAll(/^\\d\\. (\\S+) \\(a (picture|text file) they called "([^"]*)"\\)$/gm)].map(m => ({
  name: m[3], kind: m[2], b64: fs.readFileSync(m[1]).toString('base64'),
}));
(async () => {
  while (q.includes('slow') && fs.existsSync(${JSON.stringify(hold)})) await new Promise(r => setTimeout(r, 50));
  fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ q, prompt, args: process.argv.slice(4), cwd: process.cwd(), files }) + '\\n');
  console.log(JSON.stringify({ type: 'result', is_error: false, result: JSON.stringify({ say: 'ok' }) }));
})();
`,
    { mode: 0o755 },
  );

  async function sentFor(q: string): Promise<Sent> {
    for (let i = 0; i < 200; i++) {
      const lines = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : [];
      const hit = lines.map((s): Sent => JSON.parse(s)).find(s => s.q.endsWith(q));
      if (hit) return hit;
      await page.waitForTimeout(100);
    }
    throw new Error(`not sent: ${q}`);
  }
  async function send(q: string) {
    await page.fill('#mcInput', q);
    await page.click('.mc-send');
  }
  return { sentFor, send, hold };
}
