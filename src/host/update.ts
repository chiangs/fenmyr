// Updates, three ways depending on how Fenmyr was installed:
//   from a git clone with install.sh:  check GitHub for new commits; "Update now" runs ./install.sh --update (pull, build, reinstall, reopen)
//   the AppImage:                      check GitHub Releases; download the new AppImage and swap it in when Fenmyr quits
//   anything else (a distro package):  nothing to do here, the package manager updates it
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app } from 'electron';
import type { UpdateInfo } from '../shared/ops.ts';
import { download as fetchTo, get } from './net.ts';
import P from './paths.ts';
import { isRecord, readJSON, run, text, which } from './util.ts';

type Release = { tag_name: string; body: string; assets: { name: string; url: string }[] };

const REPO = 'chiangs/fenmyr';
// the override is only for testing updates
const releaseAPI = process.env.FENMYR_RELEASE_API || `https://api.github.com/repos/${REPO}/releases/latest`;
// x86_64 or arm64, as make-release.sh names them
const assetName = () => `Fenmyr-${process.arch === 'x64' ? 'x86_64' : process.arch}.AppImage`;
const preview = () => process.env.FENMYR_PREVIEW_UPDATE === '1';
export const appVersion = () => app.getVersion();

// the folder the app was installed from (install.sh writes it into install.json), if it's still a git checkout
function repoDir() {
  const root = app.getAppPath();
  const install = readJSON(path.join(root, 'install.json'));
  let dir = isRecord(install) ? text(install.repo) : '';
  if (!dir && !process.env.APPIMAGE) dir = root; // running straight from a checkout (npm start)
  return dir && fs.existsSync(path.join(dir, '.git')) ? dir : null;
}
const appImage = () => process.env.APPIMAGE || null;

async function git(args: string[], dir: string, timeout = 30) {
  const r = await run('git', ['-C', dir, ...args], timeout);
  return { ok: r.code === 0, out: r.out.toString('utf8').trim() };
}
function newer(a: string, b: string) {
  const parts = (v: string) =>
    v
      .replace(/^v/, '')
      .split('.')
      .map(n => Number.parseInt(n, 10) || 0);
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const p = x[i] ?? 0;
    const q = y[i] ?? 0;
    if (p !== q) return p > q;
  }
  return false;
}
async function latestRelease(): Promise<Release | null> {
  try {
    const r = await get(releaseAPI, 30, { Accept: 'application/vnd.github+json', 'User-Agent': 'Fenmyr' });
    const j: unknown = r.ok ? await r.json() : null;
    if (!isRecord(j) || !text(j.tag_name)) return null;
    const assets = Array.isArray(j.assets) ? j.assets.filter(isRecord) : [];
    return {
      tag_name: text(j.tag_name),
      body: text(j.body),
      assets: assets.map(a => ({ name: text(a.name), url: text(a.browser_download_url) })),
    };
  } catch {
    return null;
  }
}

export async function check(): Promise<UpdateInfo> {
  if (preview())
    return {
      release: true,
      behind: 1,
      latest: 'v9.9.9',
      since: appVersion(),
      preview: true,
      notes: ['This is a preview of the update bar', 'Nothing will change'],
    };
  const dir = repoDir();
  if (dir) {
    const here = (await git(['log', '-1', '--format=%cs'], dir)).out;
    if (!(await git(['fetch', '--quiet', 'origin'], dir, 40)).ok) return { repo: true, offline: true, since: here };
    const behind = Number.parseInt((await git(['rev-list', '--count', 'HEAD..@{u}'], dir)).out, 10) || 0;
    // the friendly notes: lines added to WHATSNEW.md since this copy
    const diff = (await git(['diff', 'HEAD', '@{u}', '--', 'WHATSNEW.md'], dir)).out;
    const notes = diff
      .split('\n')
      .filter(l => l.startsWith('+- '))
      .map(l => l.slice(3));
    return { repo: true, behind, since: here, notes };
  }
  if (!appImage()) return {}; // installed some other way: the page says how to update
  const r = await latestRelease();
  if (!r) return { release: true, offline: true, since: appVersion() };
  const notes = r.body
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.startsWith('- '))
    .map(s => s.slice(2));
  return {
    release: true,
    behind: newer(r.tag_name, appVersion()) ? 1 : 0,
    notes,
    since: appVersion(),
    latest: r.tag_name,
  };
}

// the AppImage: the new one waits in pending-update/ until Fenmyr quits
const pendingFile = () => path.join(P.pendingDir, assetName());
function pendingVersion() {
  try {
    return fs.readFileSync(`${pendingFile()}.version`, 'utf8').trim();
  } catch {
    return null;
  }
}
async function download() {
  const r = await latestRelease();
  if (!r) throw new Error("Couldn't reach GitHub.");
  const v = pendingVersion();
  if (v && !newer(r.tag_name, v) && fs.existsSync(pendingFile())) return v;
  const asset = r.assets.find(a => a.name === assetName());
  if (!asset) throw new Error("The new version isn't available yet.");
  fs.rmSync(P.pendingDir, { recursive: true, force: true });
  fs.mkdirSync(P.pendingDir, { recursive: true });
  try {
    await fetchTo(asset.url, pendingFile(), 1800, { 'User-Agent': 'Fenmyr' });
  } catch {
    throw new Error("The download didn't finish.");
  }
  fs.chmodSync(pendingFile(), 0o755);
  const version = r.tag_name.replace(/^v/, '');
  fs.writeFileSync(`${pendingFile()}.version`, version);
  return version;
}
// a tiny helper that waits for this Fenmyr to close, puts the new AppImage in place, and (if asked) opens it
let swapping = false;
function swapOnExit(image: string, reopen: boolean) {
  swapping = true;
  const sh =
    'while kill -0 "$2" 2>/dev/null; do sleep 0.3; done; mv -f "$0" "$1" && chmod +x "$1"; rm -rf "$3"; if [ "$4" = 1 ]; then nohup "$1" >/dev/null 2>&1 & fi';
  spawn('/bin/sh', ['-c', sh, pendingFile(), image, String(process.pid), P.pendingDir, reopen ? '1' : '0'], {
    detached: true,
    stdio: 'ignore',
  }).unref();
}

export async function prepare() {
  if (preview()) return 'preview';
  if (!appImage())
    throw new Error(
      repoDir()
        ? "This copy updates from its folder, so it can't update by itself."
        : 'Update Fenmyr with the tool you installed it with.',
    );
  return download();
}
export async function now(): Promise<'updating'> {
  if (preview()) throw new Error('This is a preview, so nothing changed.');
  const dir = repoDir();
  if (dir) {
    // only a clean fast-forward: never touch someone's own changes
    if ((await git(['status', '--porcelain', '--untracked-files=no'], dir)).out)
      throw new Error(
        "Your Fenmyr folder has its own changes, so it wasn't updated. Run ./install.sh --update in a terminal to see them.",
      );
    if (!(await git(['merge-base', '--is-ancestor', 'HEAD', '@{u}'], dir)).ok)
      throw new Error("This copy has diverged from GitHub, so it wasn't updated.");
    const searchPath = [
      ...(process.env.PATH || '').split(':'),
      path.join(os.homedir(), '.local/bin'),
      '/usr/local/bin',
      '/usr/bin',
    ];
    if (!which('npm', searchPath))
      throw new Error('Updating needs Node.js and npm. Install them (sudo pacman -S nodejs npm), then try again.');
    // the installer pulls, builds, reinstalls and reopens the app; it runs on its own so it can close this one
    const log = fs.openSync(P.updateLog, 'w');
    spawn('/bin/bash', ['-c', 'cd "$0" && exec ./install.sh --update', dir], {
      detached: true,
      stdio: ['ignore', log, log],
    }).unref();
    return 'updating';
  }
  const image = appImage();
  if (!image) throw new Error('Update Fenmyr with the tool you installed it with.');
  await download();
  swapOnExit(image, true);
  setTimeout(() => app.quit(), 400);
  return 'updating';
}
// on quit: if a newer AppImage is waiting, swap it in once this one has fully closed (it doesn't reopen; the next launch is just newer)
export function onQuit() {
  const image = appImage();
  if (swapping || !image) return; // "Update now" already set up the swap
  const v = pendingVersion();
  if (!v || !fs.existsSync(pendingFile())) return;
  if (!newer(v, appVersion())) {
    fs.rmSync(P.pendingDir, { recursive: true, force: true });
    return;
  }
  swapOnExit(image, false);
}
