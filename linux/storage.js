// Boards are plain JSON files, one per board; folders live in one small file next to them; videos are their own files in media/.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const P = require('./paths'), { jsonSafe } = require('./claude');

const safe = v => String(v ?? 'x').replace(/[^\p{L}\p{N}-]/gu, '');
const readJSON = (f, fallback) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return fallback; } };
// write to a temporary file first, then swap it in, so a crash mid-save never leaves half a board
function writeAtomic(f, text) { const tmp = f + '.tmp'; fs.writeFileSync(tmp, text); fs.renameSync(tmp, f); }

// the board list needs only a few fields from each file, and boards with pictures can be many MB,
// so each board's summary is kept until its file changes (same size and time = same board)
const summaries = new Map();
function list() {
  let files = []; try { files = fs.readdirSync(P.boardsDir).filter(f => f.endsWith('.json')); } catch (e) {}
  for (const f of summaries.keys()) if (!files.includes(f)) summaries.delete(f);
  return files.map(f => {
    const full = path.join(P.boardsDir, f); let st; try { st = fs.statSync(full); } catch (e) { return null; }
    const known = summaries.get(f); if (known && known.mtimeMs === st.mtimeMs && known.size === st.size) return known.row;
    const j = readJSON(full, null); if (!j || typeof j !== 'object') return null;
    const row = { id: j.id ?? '', name: j.name ?? 'Untitled', color: j.color ?? 'pink', folder: j.folder ?? null, parent: j.parent ?? null, updated: st.mtimeMs / 1000 };
    summaries.set(f, { mtimeMs: st.mtimeMs, size: st.size, row }); return row;
  }).filter(Boolean).sort((a, b) => b.updated - a.updated);
}
const load = id => readJSON(path.join(P.boardsDir, safe(id) + '.json'), null);
function save(board) {
  if (!board || typeof board !== 'object') throw new Error('bad board');
  writeAtomic(path.join(P.boardsDir, safe(board.id) + '.json'), jsonSafe(board)); return true;
}
function remove(id) { fs.rmSync(path.join(P.boardsDir, safe(id) + '.json'), { force: true }); return true; }
const folders = () => readJSON(P.foldersFile, []);
function saveFolders(f) { writeAtomic(P.foldersFile, jsonSafe(f ?? [])); return true; }

// watch the boards folder: a board added from outside (Claude Code, a copied file) shows up without a restart
function watchBoards(onChange) {
  const names = () => { try { return fs.readdirSync(P.boardsDir).filter(f => f.endsWith('.json')).sort().join('\n'); } catch (e) { return ''; } };
  let known = names(), tick = null;
  try {
    fs.watch(P.boardsDir, () => {
      clearTimeout(tick);
      tick = setTimeout(() => { const now = names(); if (now !== known) { known = now; onChange(); } }, 500);   // our own saves rewrite files too, so only speak up when boards come or go
    });
  } catch (e) {}
}

// ---- videos: the page sends them in chunks; they're served back through mbmedia:// so big files never pass through JSON again ----
function mediaBegin(ext) {
  ext = String(ext || 'mp4').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 5) || 'mp4';
  const name = crypto.randomUUID() + '.' + ext; fs.writeFileSync(path.join(P.mediaDir, name), ''); return name;
}
function mediaChunk(name, data) {
  name = String(name || '').replace(/\//g, ''); if (!name || !data) throw new Error("I couldn't save that video.");
  fs.appendFileSync(path.join(P.mediaDir, name), Buffer.from(data, 'base64')); return true;
}
const mediaEnd = name => 'mbmedia://media/' + String(name || '').replace(/\//g, '');

const MIME = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', jpg: 'image/jpeg', png: 'image/png' };
// mbmedia://media/<name>, with byte ranges so videos can seek
function serveMedia(req) {
  const name = decodeURIComponent(new URL(req.url).pathname.split('/').pop() || ''), f = path.join(P.mediaDir, name);
  let size = 0; try { size = fs.statSync(f).size; } catch (e) {}
  if (!name || name.includes('..') || !size) return new Response('not found', { status: 404 });
  let start = 0, end = size - 1, partial = false;
  const r = req.headers.get('range');
  if (r && r.startsWith('bytes=')) {
    const [a, b = ''] = r.slice(6).split('-', 2); partial = true;
    if (!a && b) start = Math.max(0, size - (+b || 0));   // "bytes=-500": the last 500
    else { start = +a || 0; if (b) end = Math.min(+b, size - 1); }
  }
  if (start > end) return new Response('', { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  const head = { 'Content-Type': MIME[path.extname(name).slice(1).toLowerCase()] || 'application/octet-stream', 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' };
  if (partial) head['Content-Range'] = `bytes ${start}-${end}/${size}`;
  const { Readable } = require('stream');
  return new Response(Readable.toWeb(fs.createReadStream(f, { start, end })), { status: partial ? 206 : 200, headers: head });
}
// videos no board points to anymore (deleted cards, replaced recordings) are cleared out after a couple of days, so undo still has them for a while
function sweepMedia() {
  let files = []; try { files = fs.readdirSync(P.mediaDir); } catch (e) { return; }
  if (!files.length) return;
  let used = ''; try { for (const b of fs.readdirSync(P.boardsDir)) if (b.endsWith('.json')) used += fs.readFileSync(path.join(P.boardsDir, b), 'utf8'); } catch (e) {}
  const old = Date.now() - 2 * 86400 * 1000;
  for (const f of files) if (!used.includes(f)) { try { const full = path.join(P.mediaDir, f); if (fs.statSync(full).mtimeMs < old) fs.rmSync(full); } catch (e) {} }
}

module.exports = { list, load, save, remove, folders, saveFolders, watchBoards, mediaBegin, mediaChunk, mediaEnd, serveMedia, sweepMedia };
