import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { BuildEvent } from '../shared/build.ts';
import { windowOf } from '../shared/contextFit.ts';
import type { Ops } from '../shared/ops.ts';
import { PROTO_DIR, splitBuildReply } from '../shared/repos.ts';
import { fitBuild } from './buildFit.ts';
import { claudeCode, quitting } from './claudeCode.ts';
import type { CodeAgent } from './codeAgent.ts';
import { status } from './git.ts';
import { listModels, parseChoice } from './models.ts';
import * as prompts from './prompts.ts';
import { filesSince, installed, snapshot, undo } from './prototypes.ts';
import { isRecord, strings, text, type Untrusted } from './util.ts';

// A stray huge file must not be read whole. This is only the edge of what is read: fitBuild makes the real cut, by what
// the model's window has room for.
const MAX_SHARED = 2_000_000;
const shared = (repo: string, name: string) => {
  try {
    const fd = fs.openSync(path.join(repo, name), 'r');
    try {
      const size = Math.min(fs.fstatSync(fd).size, MAX_SHARED),
        buf = Buffer.alloc(size);
      return buf.toString('utf8', 0, fs.readSync(fd, buf, 0, size, 0));
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return '';
  }
};

// the cards and pictures a window sent, each parsed where it enters: a damaged one drops alone, so one odd entry doesn't
// cost the build the others
const cardsOf = (x: unknown) =>
  (Array.isArray(x) ? x : []).flatMap(c =>
    isRecord(c) && typeof c.id === 'string' && typeof c.text === 'string' ? [{ id: c.id, text: c.text }] : [],
  );
const DATA_URL = /^data:image\/(png|jpeg|webp|gif);base64,(.+)$/;
const picturesOf = (x: unknown) =>
  (Array.isArray(x) ? x : []).flatMap(p =>
    isRecord(p) &&
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.data === 'string' &&
    DATA_URL.test(p.data)
      ? [{ id: p.id, name: p.name, data: p.data }]
      : [],
  );

// changed paths outside the prototype's folder, so a change Myra made there can't go unnoticed
const outside = async (repo: string, dir: string) => {
  const s = await status(repo);
  return s.kind === 'repo' ? s.changed.map(c => c.path).filter(p => !p.startsWith(`${dir}/`)) : [];
};

// the repos with a build running: two builds in one folder would write over each other
const busy = new Set<string>();

/** Runs `op` on a repo unless a build is writing in it, as Undo this build, a commit, a pull or taking GitHub's version
 *  would put back, take or change files under it. The window guards them too, but a window reloaded mid-build doesn't
 *  know of the build. */
export const unlessBuilding = <T>(root: string, op: () => Promise<T>) =>
  busy.has(path.resolve(root)) ? Promise.resolve({ kind: 'busy' } as const) : op();

export const undoBuild = (root: string, dir: string, commit: string) =>
  unlessBuilding(root, async () => {
    await undo(root, dir, commit);
    return { kind: 'undone' } as const;
  });

// Starts a build and answers at once with its id; its start, each file edited, and how it ended arrive as protoBuild
// events. Busy, with no events, while another build runs in the repo.
export function startBuild(
  a: Untrusted<Ops['protoBuild']['args']>,
  send: (e: BuildEvent) => void,
  agent: CodeAgent = claudeCode,
) {
  const id = randomUUID(),
    root = text(a.root),
    dir = text(a.dir),
    named = { build: text(a.build), board: text(a.board) };
  if (!PROTO_DIR.test(dir) || !path.isAbsolute(root)) throw new Error("That isn't a prototype's folder.");
  const key = path.resolve(root);
  if (busy.has(key)) return { kind: 'busy' } as const;
  busy.add(key);
  // The repo is free before the last event goes, so a build asked for as this one ends can start. A build Fenmyr quits
  // during sends no end, which would say it changed nothing, so its record reads stopped next time, with Undo this build.
  const end = (e: Extract<BuildEvent, { type: 'done' | 'error' }>) => {
    busy.delete(key);
    if (!quitting()) send(e);
  };
  // Set once the folder is saved, so the end can count what changed since. A build Fenmyr quits during isn't counted:
  // counting stages through a temporary index, and the app would exit before the index is removed.
  let saved: { repo: string; snapshot: string } | null = null;
  const changed = () =>
    saved && !quitting() ? filesSince(saved.repo, dir, saved.snapshot).catch(() => []) : Promise.resolve([]);
  const run = async () => {
    const s = await status(root);
    if (s.kind !== 'repo') throw new Error("This prototype's repo isn't there any more.");
    const before = new Set(await outside(s.root, dir));
    const snap = await snapshot(s.root, dir);
    saved = { repo: s.root, snapshot: snap };
    // the window decides how much of the board the builder is sent, and the start says what that was
    const model = await parseChoice(a.myraModel);
    const protos = path.join(s.root, 'prototypes');
    const fit = fitBuild(
      {
        request: text(a.request),
        purpose: text(a.purpose),
        device: text(a.device),
        errors: text(a.errors),
        design: shared(protos, 'design.md'),
        myra: shared(protos, 'myra.md'),
        cards: cardsOf(a.cards),
        pictures: picturesOf(a.pictures),
        unseen: strings(a.unseen),
        tooBig: strings(a.tooBig),
        over: strings(a.over),
      },
      windowOf(await listModels(), model),
    );
    send({ id, type: 'start', snapshot: snap, use: fit.use });
    // the cards' pictures, saved where only this build reads them
    const shots = path.join(os.tmpdir(), `fenmyr-build-${id}`);
    const pictures = fit.pictures.flatMap((p, i) => {
      const m = p.data.match(DATA_URL);
      if (!m?.[2]) return [];
      fs.mkdirSync(shots, { recursive: true });
      const f = path.join(shots, `${i + 1}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`);
      fs.writeFileSync(f, Buffer.from(m[2], 'base64'));
      return [`${f} (${p.name.slice(0, 80) || 'a picture'})`];
    });
    const prompt = prompts.buildPrototype({
      request: fit.request,
      stack: a.stack === 'html' ? 'html' : 'react',
      purpose: fit.purpose,
      device: fit.device,
      cards: fit.cards,
      left: fit.use.left.length,
      errors: fit.errors,
      design: fit.design,
      myra: fit.myra,
      packages: installed(s.root).join(', '),
      pictures: pictures.join('\n'),
    });
    const said = await agent(
      { cwd: path.join(s.root, dir), prompt, readable: pictures.length ? [shots] : [], access: 'edit', model },
      file => send({ id, type: 'edit', file }),
    ).finally(() => fs.rmSync(shots, { recursive: true, force: true }));
    const files = await changed(),
      strays = (await outside(s.root, dir)).filter(p => !before.has(p));
    const { text: reply, sources, next } = splitBuildReply(said);
    end({ id, ...named, type: 'done', text: reply, snapshot: snap, files, outside: strays, sources, next });
  };
  run().catch(async e => {
    const snapshot = saved?.snapshot ?? null;
    const why = e instanceof Error ? e.message : String(e);
    end({ id, ...named, type: 'error', text: why, snapshot, files: await changed() });
  });
  return { kind: 'started', id } as const;
}
