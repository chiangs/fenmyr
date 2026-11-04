import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { HostEvents, Ops } from '../shared/ops.ts';
import { PROTO_DIR } from '../shared/repos.ts';
import { claudeCode } from './claudeCode.ts';
import type { CodeAgent } from './codeAgent.ts';
import { status } from './git.ts';
import * as prompts from './prompts.ts';
import { installed, snapshot } from './prototypes.ts';
import { isRecord, text, type Untrusted } from './util.ts';

type Event = HostEvents['protoBuild'];

const shared = (repo: string, name: string) => {
  try {
    return fs.readFileSync(path.join(repo, name), 'utf8').slice(0, 20_000);
  } catch {
    return '';
  }
};

// changed paths outside the prototype's folder, so a change Myra made there can't go unnoticed
const outside = async (repo: string, dir: string) => {
  const s = await status(repo);
  return s.kind === 'repo' ? s.changed.map(c => c.path).filter(p => !p.startsWith(`${dir}/`)) : [];
};

// Starts a build and answers at once with its id; each file edited, and how it ended, arrive as protoBuild events.
export function startBuild(
  a: Untrusted<Ops['protoBuild']['args']>,
  send: (e: Event) => void,
  agent: CodeAgent = claudeCode,
) {
  const id = randomUUID(),
    root = text(a.root),
    dir = text(a.dir);
  if (!PROTO_DIR.test(dir) || !path.isAbsolute(root)) throw new Error("That isn't a prototype's folder.");
  const run = async () => {
    const s = await status(root);
    if (s.kind !== 'repo') throw new Error("This prototype's repo isn't there any more.");
    const before = new Set(await outside(s.root, dir));
    const snap = await snapshot(s.root, dir);
    // the cards' pictures, saved where only this build reads them
    const shots = path.join(os.tmpdir(), `fenmyr-build-${id}`);
    const pictures = (Array.isArray(a.pictures) ? a.pictures : []).slice(0, 8).flatMap((p, i) => {
      const m = isRecord(p) ? text(p.data).match(/^data:image\/(png|jpeg|webp|gif);base64,(.+)$/) : null;
      if (!m?.[2]) return [];
      fs.mkdirSync(shots, { recursive: true });
      const f = path.join(shots, `${i + 1}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`);
      fs.writeFileSync(f, Buffer.from(m[2], 'base64'));
      return [`${f} (${text(isRecord(p) ? p.name : '').slice(0, 80) || 'a picture'})`];
    });
    const prompt = prompts.buildPrototype({
      request: text(a.request).slice(0, 8000),
      stack: a.stack === 'html' ? 'html' : 'react',
      purpose: text(a.purpose).slice(0, 500),
      device: text(a.device).slice(0, 20),
      cards: text(a.cards).slice(0, 30_000),
      errors: text(a.errors).slice(0, 4000),
      design: shared(path.join(s.root, 'prototypes'), 'design.md'),
      myra: shared(path.join(s.root, 'prototypes'), 'myra.md'),
      packages: installed(s.root).join(', '),
      pictures: pictures.join('\n'),
    });
    const said = await agent({ cwd: path.join(s.root, dir), prompt, readable: pictures.length ? [shots] : [] }, file =>
      send({ id, type: 'edit', file }),
    ).finally(() => fs.rmSync(shots, { recursive: true, force: true }));
    const strays = (await outside(s.root, dir)).filter(p => !before.has(p));
    send({ id, type: 'done', text: said, snapshot: snap, outside: strays });
  };
  run().catch(e => send({ id, type: 'error', text: e instanceof Error ? e.message : String(e) }));
  return { id };
}
