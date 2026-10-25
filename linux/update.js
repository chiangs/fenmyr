// Updates, three ways depending on how Myra was installed:
//   from a git clone with install.sh:  check GitHub for new commits; "Update now" runs ./install.sh --update (pull, reinstall, reopen)
//   the AppImage:                      check GitHub Releases; download the new AppImage and swap it in when Myra quits
//   anything else (a distro package):  nothing to do here, the package manager updates it
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const { app } = require('electron');
const P = require('./paths'), { run } = require('./claude'), { get, download: fetchTo } = require('./net');

const REPO = 'chiangs/myra';
const releaseAPI = process.env.MB_RELEASE_API || `https://api.github.com/repos/${REPO}/releases/latest`;   // the override is only for testing updates
const assetName = () => `Myra-${process.arch === 'x64' ? 'x86_64' : process.arch}.AppImage`;   // x86_64 or arm64, as make-release.sh names them
const preview = () => process.env.MB_PREVIEW_UPDATE === '1';   // a preview of the update bar for testing
const appRoot = path.join(__dirname, '..');
const appVersion = () => app.getVersion();

// the folder the app was installed from (install.sh writes it into install.json), if it's still a git checkout
function repoDir() {
  let dir = null;
  try { dir = JSON.parse(fs.readFileSync(path.join(appRoot, 'install.json'), 'utf8')).repo; } catch (e) {}
  if (!dir && !process.env.APPIMAGE) dir = appRoot;   // running straight from a checkout (npm start)
  return dir && fs.existsSync(path.join(dir, '.git')) ? dir : null;
}
const appImage = () => process.env.APPIMAGE || null;

async function git(args, dir, timeout = 30) {
  const r = await run('git', ['-C', dir, ...args], timeout);
  return { ok: r.code === 0, out: r.out.toString('utf8').trim() };
}
function newer(a, b) {
  const x = String(a).replace(/^v/, '').split('.').map(n => parseInt(n) || 0), y = String(b).replace(/^v/, '').split('.').map(n => parseInt(n) || 0);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const p = x[i] || 0, q = y[i] || 0; if (p !== q) return p > q; }
  return false;
}
async function latestRelease() {
  try { const r = await get(releaseAPI, 30, { Accept: 'application/vnd.github+json', 'User-Agent': 'Myra' }); return r.ok ? await r.json() : null; } catch (e) { return null; }
}

async function check() {
  if (preview()) return { release: true, behind: 1, latest: 'v9.9.9', since: appVersion(), preview: true, notes: ['This is a preview of the update bar', 'Nothing will change'] };
  const dir = repoDir();
  if (dir) {
    const here = (await git(['log', '-1', '--format=%cs'], dir)).out;
    if (!(await git(['fetch', '--quiet', 'origin'], dir, 40)).ok) return { repo: true, offline: true, since: here };
    const behind = parseInt((await git(['rev-list', '--count', 'HEAD..@{u}'], dir)).out) || 0;
    // the friendly notes: lines added to WHATSNEW.md since this copy
    const diff = (await git(['diff', 'HEAD', '@{u}', '--', 'WHATSNEW.md'], dir)).out;
    return { repo: true, behind, since: here, notes: diff.split('\n').filter(l => l.startsWith('+- ')).map(l => l.slice(3)) };
  }
  if (!appImage()) return {};   // installed some other way: the page says how to update
  const r = await latestRelease();
  if (!r || !r.tag_name) return { release: true, offline: true, since: appVersion() };
  const notes = String(r.body || '').split('\n').map(s => s.trim()).filter(s => s.startsWith('- ')).map(s => s.slice(2));
  return { release: true, behind: newer(r.tag_name, appVersion()) ? 1 : 0, notes, since: appVersion(), latest: r.tag_name };
}

// ---- the AppImage: the new one waits in pending-update/ until Myra quits ----
const pendingFile = () => path.join(P.pendingDir, assetName()), pendingVersion = () => { try { return fs.readFileSync(pendingFile() + '.version', 'utf8').trim(); } catch (e) { return null; } };
async function download() {
  const r = await latestRelease();
  if (!r || !r.tag_name) throw new Error("I couldn't reach GitHub just now.");
  const v = pendingVersion(); if (v && !newer(r.tag_name, v) && fs.existsSync(pendingFile())) return v;   // already waiting
  const asset = (r.assets || []).find(a => a.name === assetName()); if (!asset) throw new Error("The new version isn't there yet.");
  fs.rmSync(P.pendingDir, { recursive: true, force: true }); fs.mkdirSync(P.pendingDir, { recursive: true });
  try { await fetchTo(asset.browser_download_url, pendingFile(), 1800, { 'User-Agent': 'Myra' }); } catch (e) { throw new Error("The download didn't finish."); }
  fs.chmodSync(pendingFile(), 0o755);
  fs.writeFileSync(pendingFile() + '.version', r.tag_name.replace(/^v/, ''));
  return r.tag_name.replace(/^v/, '');
}
// a tiny helper that waits for this Myra to close, puts the new AppImage in place, and (if asked) opens it
let swapping = false;
function swapOnExit(reopen) {
  swapping = true;
  const sh = 'while kill -0 "$2" 2>/dev/null; do sleep 0.3; done; mv -f "$0" "$1" && chmod +x "$1"; rm -rf "$3"; if [ "$4" = 1 ]; then nohup "$1" >/dev/null 2>&1 & fi';
  spawn('/bin/sh', ['-c', sh, pendingFile(), appImage(), String(process.pid), P.pendingDir, reopen ? '1' : '0'], { detached: true, stdio: 'ignore' }).unref();
}

async function prepare() {
  if (preview()) return 'preview';
  if (!appImage()) throw new Error(repoDir() ? 'This copy updates from its folder, so it can\'t update by itself.' : 'Update Myra with the tool you installed it with.');
  return download();
}
async function now() {
  if (preview()) throw new Error('This is just a preview, so nothing changed ✦');
  const dir = repoDir();
  if (dir) {
    // only a clean fast-forward: never touch someone's own changes
    if ((await git(['status', '--porcelain', '--untracked-files=no'], dir)).out) throw new Error('Your Myra folder has changes of its own, so I won\'t update over them. Run ./install.sh --update in a terminal to see what\'s up.');
    if (!(await git(['merge-base', '--is-ancestor', 'HEAD', '@{u}'], dir)).ok) throw new Error('This copy has gone its own way from GitHub, so I\'ll leave it alone.');
    // the installer pulls, reinstalls and reopens the app; it runs on its own so it can close this one
    const log = fs.openSync(P.updateLog, 'w');
    spawn('/bin/bash', ['-c', 'cd "$0" && exec ./install.sh --update', dir], { detached: true, stdio: ['ignore', log, log] }).unref();
    return 'updating';
  }
  if (!appImage()) throw new Error('Update Myra with the tool you installed it with.');
  await download();
  swapOnExit(true); setTimeout(() => app.quit(), 400);
  return 'updating';
}
// on quit: if a newer AppImage is waiting, swap it in once this one has fully closed (it doesn't reopen; the next launch is just newer)
function onQuit() {
  if (swapping || !appImage()) return;   // "Update now" already set up the swap
  const v = pendingVersion(); if (!v || !fs.existsSync(pendingFile())) return;
  if (!newer(v, appVersion())) { fs.rmSync(P.pendingDir, { recursive: true, force: true }); return; }
  swapOnExit(false);
}

module.exports = { check, prepare, now, onQuit, appVersion };
