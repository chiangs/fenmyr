import type { Project } from './model.ts';

// model.ts reads repo links through this file, so it can't lend its own isRecord without an import cycle
const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;

const within = (path: string, root: string) => path === root || path.startsWith(root.endsWith('/') ? root : `${root}/`);

// Another project using this repo, or a repo inside or around it. Two projects in one repo would commit each other's work.
export const repoClash = (projects: Project[], self: string, root: string): Project | null =>
  projects.find(p => p.id !== self && p.repo && (within(root, p.repo.path) || within(p.repo.path, root))) ?? null;

export type GitHubRepo = { owner: string; name: string };

// a repo on github.com from its address, in https, ssh or the short git@ form
export function githubOf(url: string): GitHubRepo | null {
  const m = url.match(
    /^(?:https:\/\/github\.com\/|ssh:\/\/git@github\.com\/|git@github\.com:)([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/,
  );
  return m?.[1] && m[2] ? { owner: m[1], name: m[2] } : null;
}

// what GitHub accepts as a repo's name
export const REPO_NAME = /^[A-Za-z0-9._-]{1,100}$/;
export const repoNameFor = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'prototypes';

type RepoLink = NonNullable<Project['repo']>;
const word = (v: unknown, re: RegExp) => (typeof v === 'string' && re.test(v) ? v : null);

// A project's repo as read from the library file: an absolute path, and its GitHub copy when every part is sound.
export function readRepoLink(x: unknown): RepoLink | null {
  if (!isRecord(x) || typeof x.path !== 'string' || !x.path.startsWith('/')) return null;
  const gh = isRecord(x.github) ? x.github : {},
    owner = word(gh.owner, /^[A-Za-z0-9-]+$/),
    name = word(gh.name, REPO_NAME),
    account = word(gh.account, /^[A-Za-z0-9-]+$/);
  return owner && name && account ? { path: x.path, github: { owner, name, account } } : { path: x.path };
}

// a prototype's folder name under prototypes/, from its board's name
export const protoSlug = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '') || 'prototype';

// A prototype board's code lives in one folder of its project's repo. The board finds it by dir, never by its name,
// so renaming or refiling the board can't lose it.
// which cards each of a prototype's files came from, by path inside its folder, as the builder reported them
export type Sources = Record<string, string[]>;

export type Proto = {
  dir: string;
  stack: 'react' | 'html';
  // what it's for and the screen it's for, as the person told Myra when it was made
  purpose?: string;
  device?: 'phone' | 'tablet' | 'desktop';
  sources?: Sources;
  // a copy from another project whose code hasn't been asked about yet: Myra asks to commit it when it first opens
  copied?: { from: string; files: number };
  // the newest build started on it: only that build's Undo shows, even when it landed while another board was open
  build?: string;
};

const MAX_SOURCE_FILES = 200;
const MAX_CARDS_PER_FILE = 12;

export function readSources(x: unknown): Sources {
  if (!isRecord(x)) return {};
  return Object.fromEntries(
    Object.entries(x)
      .slice(0, MAX_SOURCE_FILES)
      .flatMap(([file, ids]) =>
        Array.isArray(ids) && file.length < 300 && !file.startsWith('/') && !file.split('/').includes('..')
          ? [[file, ids.filter(i => typeof i === 'string' && i.length <= 64).slice(0, MAX_CARDS_PER_FILE)]]
          : [],
      ),
  );
}

// The builder ends its reply with "CARDS: src/App.tsx=a1,b2; src/Field.tsx=c3", or "CARDS: none". The line is taken
// off what the person reads.
export function splitCardsLine(said: string): { text: string; sources: Sources } {
  const m = said.match(/(^|\n)[ \t]*CARDS:[ \t]*(.*)\s*$/i);
  if (!m) return { text: said.trim(), sources: {} };
  const found: Sources = {};
  for (const part of (m[2] ?? '').split(';')) {
    const [file, ids] = part.split('=');
    const f = file?.trim().replace(/^\.\//, '');
    if (f && ids)
      found[f] = ids
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
  }
  return { text: said.slice(0, m.index).trim(), sources: readSources(found) };
}

// flat under prototypes/, so where the board sits in the library never decides where its code is
export const PROTO_DIR = /^prototypes\/[a-z0-9]+(-[a-z0-9]+)*$/;
const STACKS: readonly Proto['stack'][] = ['react', 'html'];
export const DEVICES: readonly NonNullable<Proto['device']>[] = ['phone', 'tablet', 'desktop'];

// What a prototype's commit takes: its own folder, and the files every prototype shares at the top of prototypes/
export const inCommit = (dir: string, file: string) => file.startsWith(`${dir}/`) || /^prototypes\/[^/]+$/.test(file);

export function readProto(x: unknown): Proto | null {
  if (!isRecord(x) || typeof x.dir !== 'string' || !PROTO_DIR.test(x.dir)) return null;
  const device = DEVICES.find(d => d === x.device),
    purpose = typeof x.purpose === 'string' ? x.purpose.slice(0, 500) : '',
    sources = readSources(x.sources),
    copied =
      isRecord(x.copied) && typeof x.copied.from === 'string'
        ? { from: x.copied.from.slice(0, 200), files: typeof x.copied.files === 'number' ? x.copied.files : 0 }
        : null,
    build = typeof x.build === 'string' && x.build.length <= 64 ? x.build : '';
  return {
    dir: x.dir,
    stack: STACKS.find(s => s === x.stack) ?? 'react',
    ...(purpose ? { purpose } : {}),
    ...(device ? { device } : {}),
    ...(Object.keys(sources).length ? { sources } : {}),
    ...(copied ? { copied } : {}),
    ...(build ? { build } : {}),
  };
}

// A capture card: a picture of the preview, the commit it shows, the device and width it was taken at, and when.
// Clicking the card shows that commit in the preview again.
export type Capture = { commit: string; device: string; width: number; at: number };
export const COMMIT = /^[0-9a-f]{7,40}$/;

export function readCapture(x: unknown): Capture | null {
  if (!isRecord(x) || typeof x.commit !== 'string' || !COMMIT.test(x.commit)) return null;
  return {
    commit: x.commit,
    device: typeof x.device === 'string' ? x.device : '',
    width: typeof x.width === 'number' ? x.width : 0,
    at: typeof x.at === 'number' ? x.at : 0,
  };
}
