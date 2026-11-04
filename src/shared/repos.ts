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
