import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BuildEvent } from '../shared/build.ts';
import type { Ops } from '../shared/ops.ts';
import { PROTO_DIR, splitBuildReply } from '../shared/repos.ts';
import { claudeCode } from './claudeCode.ts';
import type { CodeAgent } from './codeAgent.ts';
import { status } from './git.ts';
import * as prompts from './prompts.ts';
import { filesSince, installed, snapshot } from './prototypes.ts';
import { isRecord, text, type Untrusted } from './util.ts';

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

// the repos with a build running: two builds in one folder would write over each other
const busy = new Set<string>();

// Starts a build and answers at once with its id; its start, each file edited, and how it ended arrive as protoBuild
// events.
export function startBuild(
  a: Untrusted<Ops['protoBuild']['args']>,
  send: (e: BuildEvent) => void,
  agent: CodeAgent = claudeCode,
) {
  const id = randomUUID(),
    root = text(a.root),
    dir = text(a.dir);
  if (!PROTO_DIR.test(dir) || !path.isAbsolute(root)) throw new Error("That isn't a prototype's folder.");
  const key = path.resolve(root);
  if (busy.has(key)) throw new Error('A build is already running in this repo.');
  busy.add(key);
  // the repo is free before the last event goes, so a build asked for as this one ends can start
  const end = (e: Extract<BuildEvent, { type: 'done' | 'error' }>) => {
    busy.delete(key);
    send(e);
  };
  // set once the folder is saved, so the end can count what changed since
  let saved: { repo: string; snapshot: string } | null = null;
  const changed = () => (saved ? filesSince(saved.repo, dir, saved.snapshot).catch(() => []) : Promise.resolve([]));
  const run = async () => {
    const s = await status(root);
    if (s.kind !== 'repo') throw new Error("This prototype's repo isn't there any more.");
    const before = new Set(await outside(s.root, dir));
    const snap = await snapshot(s.root, dir);
    saved = { repo: s.root, snapshot: snap };
    send({ id, type: 'start', snapshot: snap });
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
    const files = await changed(),
      strays = (await outside(s.root, dir)).filter(p => !before.has(p));
    const { text: reply, sources, next } = splitBuildReply(said);
    end({ id, type: 'done', text: reply, snapshot: snap, files, outside: strays, sources, next });
  };
  run().catch(async e => {
    const snapshot = saved?.snapshot ?? null;
    end({ id, type: 'error', text: e instanceof Error ? e.message : String(e), snapshot, files: await changed() });
  });
  return { id };
}
