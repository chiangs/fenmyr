// Obsidian vaults: plain folders of markdown. Myra only ever reads them (first version), and only what a grant allows:
// a vault has folders marked off-limits, a note tagged #private is never read, and every read is checked against the
// folders the caller says are allowed. All of that is enforced here, in the host, not left to the page.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const P = require('./paths'), { jsonSafe } = require('./claude');

const readJSON = (f, fallback) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return fallback; } };
function writeAtomic(f, text) { fs.mkdirSync(path.dirname(f), { recursive: true }); const tmp = f + '.tmp'; fs.writeFileSync(tmp, text); fs.renameSync(tmp, f); }

// ---- paths: always "a/b/c.md" with forward slashes, relative to the vault ----
const norm = rel => String(rel || '').split(path.sep).join('/').replace(/^\/+|\/+$/g, '');
const inside = (rel, folder) => folder === '' || rel === folder || rel.startsWith(folder + '/');
const hidden = rel => rel.split('/').some(s => s.startsWith('.') || s === 'node_modules');   // .obsidian, .trash, .git …
const cleanFolders = list => [...new Set((Array.isArray(list) ? list : []).map(norm))].filter(f => typeof f === 'string' && !f.split('/').includes('..'));
// is this note reachable: not hidden, not in an off-limits folder, and inside a folder the grant allows ('' allows the whole vault)
function reachable(vault, rel, allow) {
  rel = norm(rel); if (!rel.toLowerCase().endsWith('.md') || hidden(rel)) return false;
  if ((vault.off || []).some(f => f !== '' && inside(rel, f))) return false;
  return cleanFolders(allow).some(f => inside(rel, f));
}
// the real file for a note, only if it truly sits inside the vault (a link pointing outside doesn't count)
function realFile(vault, rel) {
  const root = fs.realpathSync(vault.path), full = path.resolve(root, norm(rel)); if (!full.startsWith(root + path.sep)) return null;
  try { const real = fs.realpathSync(full); return real.startsWith(root + path.sep) && fs.statSync(real).isFile() ? real : null; } catch (e) { return null; }
}

// ---- reading a note: frontmatter, tags, links, the first lines ----
function parseYAML(src) {
  const out = {}; let key = null;
  const val = v => { v = v.trim(); if (/^\[.*\]$/.test(v)) return v.slice(1, -1).split(',').map(x => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean); return v.replace(/^["']|["']$/g, ''); };
  for (const line of src.split(/\r?\n/)) {
    const item = /^\s+-\s+(.*)$/.exec(line) || /^-\s+(.*)$/.exec(line);
    if (item && key) { (Array.isArray(out[key]) ? out[key] : (out[key] = out[key] ? [out[key]] : [])).push(item[1].trim().replace(/^["']|["']$/g, '')); continue; }
    const kv = /^([A-Za-z0-9_\- ]+):\s*(.*)$/.exec(line); if (!kv) continue;
    key = kv[1].trim(); out[key] = kv[2] === '' ? [] : val(kv[2]);
  }
  return out;
}
function parseNote(text) {
  text = String(text || ''); let props = {}, body = text;
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text); if (m) { props = parseYAML(m[1]); body = text.slice(m[0].length); }
  const tags = new Set(), add = t => { t = String(t).replace(/^#/, '').trim(); if (t && !/^\d+$/.test(t)) tags.add(t); };
  for (const k of ['tags', 'tag']) { const v = props[k]; if (v) (Array.isArray(v) ? v : String(v).split(/[,\s]+/)).forEach(add); }
  const prose = body.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  for (const t of prose.matchAll(/(?:^|\s)#([\p{L}\p{N}_\/-]+)/gu)) add(t[1]);
  const links = [...prose.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)].map(x => x[1].trim());
  const lines = prose.split(/\r?\n/).map(l => l.trim()).filter(l => l && !/^(#{1,6}\s.*|---+|\*\*\*+|!\[\[.*\]\]|(#[\p{L}\p{N}_\/-]+\s*)+)$/u.test(l));
  const excerpt = lines.slice(0, 4).join('\n').replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2').slice(0, 280);
  return { props, tags: [...tags], links, excerpt, body: body.trim() };
}
const isPrivate = tags => tags.some(t => /^private(\/|$)/i.test(t));
const shortProps = props => Object.entries(props).filter(([k]) => !/^tags?$/i.test(k)).slice(0, 6).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : String(v)]);
const titleOf = rel => path.posix.basename(rel).replace(/\.md$/i, '');

// ---- walking a vault ----
function walk(vault, fn, limit = 30000) {
  let n = 0; const root = vault.path;
  (function go(dir, rel) {
    let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) {
      if (n > limit || e.name.startsWith('.') || e.name === 'node_modules') continue;
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) { fn({ dir: true, rel: r }); go(path.join(dir, e.name), r); } else if (e.isFile() && /\.md$/i.test(e.name)) { n++; fn({ dir: false, rel: r, full: path.join(dir, e.name) }); }
    }
  })(root, '');
}
function scan(vault) {
  const folders = []; let notes = 0;
  walk(vault, x => { if (x.dir) folders.push(x.rel); else notes++; });
  return { folders: folders.sort((a, b) => a.localeCompare(b)), notes };
}
// notes the grant allows, newest first (or best name match first); #private ones are read-checked and dropped
function list(vault, allow, query, max = 40) {
  const q = String(query || '').toLowerCase().split(/\s+/).filter(Boolean), cand = [];
  walk(vault, x => {
    if (x.dir || !reachable(vault, x.rel, allow)) return;
    const hay = x.rel.toLowerCase(); if (q.some(t => !hay.includes(t))) return;
    let st; try { st = fs.statSync(x.full); } catch (e) { return; }
    cand.push({ rel: x.rel, mtime: st.mtimeMs, full: x.full, starts: q.length && titleOf(x.rel).toLowerCase().startsWith(q[0]) ? 0 : 1 });
  });
  cand.sort((a, b) => a.starts - b.starts || b.mtime - a.mtime);
  const out = [];
  for (const c of cand) {
    if (out.length >= max) break;
    let text = ''; try { text = fs.readFileSync(c.full, 'utf8').slice(0, 65536); } catch (e) { continue; }
    if (isPrivate(parseNote(text).tags)) continue;
    out.push({ rel: c.rel, title: titleOf(c.rel), folder: path.posix.dirname(c.rel) === '.' ? '' : path.posix.dirname(c.rel), mtime: c.mtime });
  }
  return out;
}
const FULL_MAX = 20000;   // the most of a note's text a card will ever hold, and only while it is open
function note(vault, rel, allow, full) {
  rel = norm(rel); if (!reachable(vault, rel, allow)) throw new Error('blocked');
  const f = realFile(vault, rel); if (!f) throw new Error('missing');
  const p = parseNote(fs.readFileSync(f, 'utf8')); if (isPrivate(p.tags)) throw new Error('blocked');
  const out = { rel, title: titleOf(rel), props: shortProps(p.props), tags: p.tags.slice(0, 12), excerpt: p.excerpt, links: p.links.length, mtime: fs.statSync(f).mtimeMs };
  if (full) { out.body = p.body.slice(0, FULL_MAX); out.truncated = p.body.length > FULL_MAX; }
  return out;
}
// notes for Myra to read, chosen by the words of a question: only reachable, non-private notes, a few of them, each cut short
const STOP = new Set('the and for are was were what when where which who why how can you your about with that this from have has had not but any all there their them they his her its our out into over also does did doing should would could know wrote note notes vault obsidian say said tell give show find look search please'.split(' '));
function search(vault, allow, query, { max = 8, per = 1500, total = 12000, budgetMs = 2500 } = {}) {
  const terms = [...new Set(String(query || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(t => t.length >= 3 && !STOP.has(t)))]; if (!terms.length) return [];
  const t0 = Date.now(), hits = [];
  walk(vault, x => {
    if (x.dir || Date.now() - t0 > budgetMs || !reachable(vault, x.rel, allow)) return;
    let text = ''; try { text = fs.readFileSync(x.full, 'utf8').slice(0, 65536); } catch (e) { return; }
    const p = parseNote(text); if (isPrivate(p.tags)) return;
    const title = titleOf(x.rel).toLowerCase(), tags = p.tags.join(' ').toLowerCase(), path_ = x.rel.toLowerCase(), body = p.body.toLowerCase();
    let score = 0; for (const t of terms) score += (title.includes(t) ? 5 : 0) + (tags.includes(t) ? 3 : 0) + (path_.includes(t) ? 2 : 0) + (body.includes(t) ? 1 + Math.min(2, body.split(t).length - 2) : 0);
    if (score > 0) hits.push({ rel: x.rel, title: titleOf(x.rel), tags: p.tags.slice(0, 12), props: shortProps(p.props), excerpt: p.excerpt, body: p.body, score, mtime: fs.statSync(x.full).mtimeMs });
  });
  hits.sort((a, b) => b.score - a.score || b.mtime - a.mtime);
  const out = []; let used = 0;
  for (const h of hits) { if (out.length >= max || used >= total) break; const text = h.body.slice(0, Math.min(per, total - used)); used += text.length; const { body, ...rest } = h; out.push({ ...rest, text }); }
  return out;
}
const obsidianURL = (vault, rel) => 'obsidian://open?vault=' + encodeURIComponent(vault.obsidian || path.basename(vault.path)) + '&file=' + encodeURIComponent(norm(rel).replace(/\.md$/i, ''));

// ---- the list of connected vaults (kept next to the boards, never inside them) ----
const vaults = () => (readJSON(P.vaultsFile, { vaults: [] }).vaults || []).filter(v => v && v.id && v.path);
const saveVaults = list => { writeAtomic(P.vaultsFile, jsonSafe({ vaults: list })); return list; };
function add(dir) {
  dir = path.resolve(String(dir || '')); let st; try { st = fs.statSync(dir); } catch (e) { throw new Error("I can't find that folder."); }
  if (!st.isDirectory()) throw new Error('That is not a folder.');
  const all = vaults(), have = all.find(v => v.path === dir); if (have) return have;
  const v = { id: crypto.randomUUID().slice(0, 8), name: path.basename(dir), path: dir, obsidian: path.basename(dir), off: [], obsidianFolder: fs.existsSync(path.join(dir, '.obsidian')) };
  saveVaults([...all, v]); return v;
}
function update(id, patch) {
  const all = vaults(), v = all.find(x => x.id === id); if (!v) throw new Error('Unknown vault.');
  if (typeof patch.name === 'string' && patch.name.trim()) v.name = patch.name.trim().slice(0, 60);
  if (typeof patch.obsidian === 'string' && patch.obsidian.trim()) v.obsidian = patch.obsidian.trim().slice(0, 120);
  if (Array.isArray(patch.off)) v.off = cleanFolders(patch.off).filter(f => f !== '');
  saveVaults(all); return v;
}
const remove = id => { saveVaults(vaults().filter(v => v.id !== id)); return true; };
const byId = id => { const v = vaults().find(x => x.id === id); if (!v) throw new Error('That vault is not connected.'); return v; };

module.exports = { vaults, add, update, remove, byId, scan, list, note, search, obsidianURL, parseNote, isPrivate, reachable, realFile, norm };
