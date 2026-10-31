// Obsidian vaults are only ever read, and only what a grant allows: a vault has folders marked off-limits, a note tagged
// #private is never read, and every read is checked against the folders the caller says are allowed. All of that is
// enforced here in the host, not left to the page.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { NoteProps, Vault, VaultHit, VaultListItem, VaultNote, VaultPatch, VaultScan } from '../shared/ops.ts';
import P from './paths.ts';
import { isRecord, jsonSafe, readJSON, strings, text, type Untrusted, writeAtomic } from './util.ts';

const norm = (rel: string) =>
  rel
    .split(path.sep)
    .join('/')
    .replace(/^\/+|\/+$/g, '');
const inside = (rel: string, folder: string) => folder === '' || rel === folder || rel.startsWith(`${folder}/`);
const hidden = (rel: string) => rel.split('/').some(s => s.startsWith('.') || s === 'node_modules');
const cleanFolders = (list: string[]) => [...new Set(list.map(norm))].filter(f => !f.split('/').includes('..'));
// '' in a grant allows the whole vault
function reachable(vault: Vault, rel: string, allow: string[]) {
  const r = norm(rel);
  if (!r.toLowerCase().endsWith('.md') || hidden(r)) return false;
  if (vault.off.some(f => f !== '' && inside(r, f))) return false;
  return cleanFolders(allow).some(f => inside(r, f));
}
// only a file that truly sits inside the vault: a link pointing outside doesn't count
function realFile(vault: Vault, rel: string) {
  const root = fs.realpathSync(vault.path),
    full = path.resolve(root, norm(rel));
  if (!full.startsWith(root + path.sep)) return null;
  try {
    const real = fs.realpathSync(full);
    return real.startsWith(root + path.sep) && fs.statSync(real).isFile() ? real : null;
  } catch {
    return null;
  }
}

type Props = Record<string, string | string[]>;
const unquote = (v: string) => v.replace(/^["']|["']$/g, '');
function parseYAML(src: string): Props {
  const out: Props = {};
  let key: string | null = null;
  const val = (raw: string) => {
    const v = raw.trim();
    if (/^\[.*\]$/.test(v))
      return v
        .slice(1, -1)
        .split(',')
        .map(x => unquote(x.trim()))
        .filter(Boolean);
    return unquote(v);
  };
  for (const line of src.split(/\r?\n/)) {
    const item = /^\s+-\s+(.*)$/.exec(line) || /^-\s+(.*)$/.exec(line);
    if (item && key) {
      const cur = out[key];
      const list = Array.isArray(cur) ? cur : cur ? [cur] : [];
      out[key] = list;
      list.push(unquote((item[1] ?? '').trim()));
      continue;
    }
    const kv = /^([A-Za-z0-9_\- ]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    key = (kv[1] ?? '').trim();
    out[key] = kv[2] === '' ? [] : val(kv[2] ?? '');
  }
  return out;
}
function parseNote(src: string) {
  let props: Props = {},
    body = src;
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
  if (m) {
    props = parseYAML(m[1] ?? '');
    body = src.slice(m[0].length);
  }
  const tags = new Set<string>(),
    add = (raw: string) => {
      const t = raw.replace(/^#/, '').trim();
      if (t && !/^\d+$/.test(t)) tags.add(t);
    };
  for (const k of ['tags', 'tag']) {
    const v = props[k];
    if (v) (Array.isArray(v) ? v : v.split(/[,\s]+/)).forEach(add);
  }
  const prose = body.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  for (const t of prose.matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu)) add(t[1] ?? '');
  const links = [...prose.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)].map(x => (x[1] ?? '').trim());
  const lines = prose
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !/^(#{1,6}\s.*|---+|\*\*\*+|!\[\[.*\]\]|(#[\p{L}\p{N}_/-]+\s*)+)$/u.test(l));
  const excerpt = lines
    .slice(0, 4)
    .join('\n')
    .replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2')
    .slice(0, 280);
  return { props, tags: [...tags], links, excerpt, body: body.trim() };
}
const isPrivate = (tags: string[]) => tags.some(t => /^private(\/|$)/i.test(t));
const shortProps = (props: Props): NoteProps =>
  Object.entries(props)
    .filter(([k]) => !/^tags?$/i.test(k))
    .slice(0, 6)
    .map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : v]);
const titleOf = (rel: string) => path.posix.basename(rel).replace(/\.md$/i, '');

type Entry = { dir: true; rel: string } | { dir: false; rel: string; full: string };
function walk(vault: Vault, fn: (x: Entry) => void, limit = 30000) {
  let n = 0;
  (function go(dir: string, rel: string) {
    let ents: fs.Dirent[] = [];
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (n > limit || e.name.startsWith('.') || e.name === 'node_modules') continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        fn({ dir: true, rel: r });
        go(path.join(dir, e.name), r);
      } else if (e.isFile() && /\.md$/i.test(e.name)) {
        n++;
        fn({ dir: false, rel: r, full: path.join(dir, e.name) });
      }
    }
  })(vault.path, '');
}
export function scan(vault: Vault): VaultScan {
  const folders: string[] = [];
  let notes = 0;
  walk(vault, x => {
    if (x.dir) folders.push(x.rel);
    else notes++;
  });
  return { folders: folders.sort((a, b) => a.localeCompare(b)), notes };
}
// newest first (or best name match first); #private notes have to be read to be dropped
export function list(vault: Vault, allow: string[], query: string, max = 40): VaultListItem[] {
  const q = query.toLowerCase().split(/\s+/).filter(Boolean),
    cand: { rel: string; mtime: number; full: string; starts: number }[] = [];
  walk(vault, x => {
    if (x.dir || !reachable(vault, x.rel, allow)) return;
    const hay = x.rel.toLowerCase();
    if (q.some(t => !hay.includes(t))) return;
    let st: fs.Stats;
    try {
      st = fs.statSync(x.full);
    } catch {
      return;
    }
    const starts = q[0] !== undefined && titleOf(x.rel).toLowerCase().startsWith(q[0]) ? 0 : 1;
    cand.push({ rel: x.rel, mtime: st.mtimeMs, full: x.full, starts });
  });
  cand.sort((a, b) => a.starts - b.starts || b.mtime - a.mtime);
  const out: VaultListItem[] = [];
  for (const c of cand) {
    if (out.length >= max) break;
    let body = '';
    try {
      body = fs.readFileSync(c.full, 'utf8').slice(0, 65536);
    } catch {
      continue;
    }
    if (isPrivate(parseNote(body).tags)) continue;
    const folder = path.posix.dirname(c.rel);
    out.push({ rel: c.rel, title: titleOf(c.rel), folder: folder === '.' ? '' : folder, mtime: c.mtime });
  }
  return out;
}
const FULL_MAX = 20000; // the most of a note's text a card will ever hold, and only while it is open
export function note(vault: Vault, rel: string, allow: string[], full = false): VaultNote {
  const r = norm(rel);
  if (!reachable(vault, r, allow)) throw new Error('blocked');
  const f = realFile(vault, r);
  if (!f) throw new Error('missing');
  const p = parseNote(fs.readFileSync(f, 'utf8'));
  if (isPrivate(p.tags)) throw new Error('blocked');
  const out = {
    rel: r,
    title: titleOf(r),
    props: shortProps(p.props),
    tags: p.tags.slice(0, 12),
    excerpt: p.excerpt,
    links: p.links.length,
    mtime: fs.statSync(f).mtimeMs,
  };
  return full ? { ...out, body: p.body.slice(0, FULL_MAX), truncated: p.body.length > FULL_MAX } : out;
}
const STOP = new Set(
  'the and for are was were what when where which who why how can you your about with that this from have has had not but any all there their them they his her its our out into over also does did doing should would could know wrote note notes vault obsidian say said tell give show find look search please'.split(
    ' ',
  ),
);
export function search(
  vault: Vault,
  allow: string[],
  query: string,
  { max = 8, per = 1500, total = 12000, budgetMs = 2500 } = {},
): VaultHit[] {
  const terms = [
    ...new Set(
      query
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter(t => t.length >= 3 && !STOP.has(t)),
    ),
  ];
  if (!terms.length) return [];
  const t0 = Date.now(),
    hits: (Omit<VaultHit, 'text'> & { body: string })[] = [];
  walk(vault, x => {
    if (x.dir || Date.now() - t0 > budgetMs || !reachable(vault, x.rel, allow)) return;
    let src = '';
    try {
      src = fs.readFileSync(x.full, 'utf8').slice(0, 65536);
    } catch {
      return;
    }
    const p = parseNote(src);
    if (isPrivate(p.tags)) return;
    const title = titleOf(x.rel).toLowerCase(),
      tags = p.tags.join(' ').toLowerCase(),
      path_ = x.rel.toLowerCase(),
      body = p.body.toLowerCase();
    let score = 0;
    for (const t of terms)
      score +=
        (title.includes(t) ? 5 : 0) +
        (tags.includes(t) ? 3 : 0) +
        (path_.includes(t) ? 2 : 0) +
        (body.includes(t) ? 1 + Math.min(2, body.split(t).length - 2) : 0);
    if (score > 0)
      hits.push({
        rel: x.rel,
        title: titleOf(x.rel),
        tags: p.tags.slice(0, 12),
        props: shortProps(p.props),
        excerpt: p.excerpt,
        body: p.body,
        score,
        mtime: fs.statSync(x.full).mtimeMs,
      });
  });
  hits.sort((a, b) => b.score - a.score || b.mtime - a.mtime);
  const out: VaultHit[] = [];
  let used = 0;
  for (const { body, ...rest } of hits) {
    if (out.length >= max || used >= total) break;
    const cut = body.slice(0, Math.min(per, total - used));
    used += cut.length;
    out.push({ ...rest, text: cut });
  }
  return out;
}
export const obsidianURL = (vault: Vault, rel: string) =>
  `obsidian://open?vault=${encodeURIComponent(vault.obsidian || path.basename(vault.path))}&file=${encodeURIComponent(norm(rel).replace(/\.md$/i, ''))}`;

function parseVault(v: unknown): Vault | null {
  if (!isRecord(v) || typeof v.id !== 'string' || !v.id || typeof v.path !== 'string' || !v.path) return null;
  return {
    id: v.id,
    name: text(v.name),
    path: v.path,
    obsidian: text(v.obsidian),
    off: strings(v.off),
    obsidianFolder: v.obsidianFolder === true,
  };
}
export function vaults(): Vault[] {
  const j = readJSON(P.vaultsFile);
  return (isRecord(j) && Array.isArray(j.vaults) ? j.vaults : []).map(parseVault).filter(v => v !== null);
}
const saveVaults = (all: Vault[]) => writeAtomic(P.vaultsFile, jsonSafe({ vaults: all }));
export function add(dir: string): Vault {
  const at = path.resolve(dir);
  let st: fs.Stats;
  try {
    st = fs.statSync(at);
  } catch {
    throw new Error("I can't find that folder.");
  }
  if (!st.isDirectory()) throw new Error('That is not a folder.');
  const all = vaults(),
    have = all.find(v => v.path === at);
  if (have) return have;
  const v: Vault = {
    id: crypto.randomUUID().slice(0, 8),
    name: path.basename(at),
    path: at,
    obsidian: path.basename(at),
    off: [],
    obsidianFolder: fs.existsSync(path.join(at, '.obsidian')),
  };
  saveVaults([...all, v]);
  return v;
}
export function update(id: string, patch: Untrusted<VaultPatch>): Vault {
  const all = vaults(),
    v = all.find(x => x.id === id);
  if (!v) throw new Error('Unknown vault.');
  if (typeof patch.name === 'string' && patch.name.trim()) v.name = patch.name.trim().slice(0, 60);
  if (typeof patch.obsidian === 'string' && patch.obsidian.trim()) v.obsidian = patch.obsidian.trim().slice(0, 120);
  if (Array.isArray(patch.off)) v.off = cleanFolders(strings(patch.off)).filter(f => f !== '');
  saveVaults(all);
  return v;
}
export function remove(id: string): true {
  saveVaults(vaults().filter(v => v.id !== id));
  return true;
}
export function byId(id: string): Vault {
  const v = vaults().find(x => x.id === id);
  if (!v) throw new Error('That vault is not connected.');
  return v;
}
