// Updates, three ways depending on how Fenmyr was installed:
//   from a git clone with install.sh:  check GitHub for a new release tag (Stable, Beta) or new commits (Every change);
//                                      "Update now" runs ./install.sh --update (pull or check out the tag, build, reinstall, reopen)
//   the AppImage:                      check GitHub Releases; download the new AppImage and swap it in when Fenmyr quits
//   anything else (a distro package):  nothing to do here, the package manager updates it
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app } from 'electron';
import type { AppInstall } from '../shared/buildStamp.ts';
import type { UpdateInfo } from '../shared/ops.ts';
import { channelFor, isUpdateChannel, type UpdateChannel } from '../shared/updateChannel.ts';
import { compareVersions } from '../shared/version.ts';
import { download as fetchTo, get } from './net.ts';
import P from './paths.ts';
import { newestTag } from './updateTags.ts';
import { isRecord, readJSON, run, text, which } from './util.ts';

type Release = { tag_name: string; body: string; assets: { name: string; url: string }[] };

const REPO = 'chiangs/fenmyr';
// the override is only for testing updates
const releaseAPI = process.env.FENMYR_RELEASE_API || `https://api.github.com/repos/${REPO}/releases/latest`;
// x86_64 or arm64, as make-release.sh names them
const assetName = () => `Fenmyr-${process.arch === 'x64' ? 'x86_64' : process.arch}.AppImage`;
const preview = () => process.env.FENMYR_PREVIEW_UPDATE === '1';
export const appVersion = () => app.getVersion();
// the page says which channel it is on; a call without a usable one gets what someone who never chose would
export const channelOf = (x: unknown): UpdateChannel => (isUpdateChannel(x) ? x : channelFor(undefined, appVersion()));

// install.sh writes install.json next to the app on Linux, and into Fenmyr.app/Contents/Resources on a Mac,
// because there the app itself is packed into an archive
function installInfo() {
  for (const dir of [app.getAppPath(), process.resourcesPath]) {
    const install = readJSON(path.join(dir, 'install.json'));
    if (isRecord(install)) return install;
  }
  return null;
}
// the folder the app was installed from, if it's still a git checkout
function repoDir() {
  const root = app.getAppPath();
  const install = installInfo();
  let dir = install ? text(install.repo) : '';
  if (!dir && !process.env.APPIMAGE) dir = root; // running straight from a checkout (npm start)
  return dir && fs.existsSync(path.join(dir, '.git')) ? dir : null;
}
const appImage = () => process.env.APPIMAGE || null;
// how this copy got here, from the same checks the updater makes
export function installKind(): Exclude<AppInstall, 'web'> {
  if (appImage()) return 'appimage';
  if (installInfo()) return 'clone';
  if (repoDir()) return 'checkout';
  return process.platform === 'darwin' ? 'mac' : 'package';
}

async function git(args: string[], dir: string, timeout = 30) {
  const r = await run('git', ['-C', dir, ...args], timeout);
  return { ok: r.code === 0, out: r.out.toString('utf8').trim() };
}
// What is actually installed, not what the folder has: a `git pull` there must not hide an update.
// Older installs didn't record it, and history can be rewritten, so the folder is the fallback.
async function installedCommit(dir: string) {
  const install = installInfo();
  const commit = install ? text(install.commit) : '';
  return commit && (await git(['cat-file', '-e', `${commit}^{commit}`], dir)).ok ? commit : 'HEAD';
}
const newer = (a: string, b: string) => compareVersions(a, b) > 0;
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

// the lines added to WHATSNEW.md between two points in history: what the update brings
async function notesBetween(dir: string, from: string, to: string) {
  const diff = (await git(['diff', from, to, '--', 'WHATSNEW.md'], dir)).out;
  return diff
    .split('\n')
    .filter(l => l.startsWith('+- '))
    .map(l => l.slice(3));
}
// An install detached at a release has no upstream, so Every change follows origin/main from there. Anything else
// keeps its branch's upstream, and with none there's nothing to compare with.
async function upstream(dir: string) {
  const detached = !(await git(['symbolic-ref', '--quiet', 'HEAD'], dir)).ok;
  return installInfo() && detached ? 'origin/main' : '@{u}';
}
// Stable and Beta follow release tags. Running from a checkout with npm start has no channel and follows its own branch.
const followsTags = (channel: UpdateChannel) => (installInfo() && channel !== 'main' ? channel : null);
// Fetches the tags, then names the newest release the channel may see, and `update`, that release when this copy is
// older than it. Null when GitHub can't be reached.
async function releaseTag(dir: string, channel: Exclude<UpdateChannel, 'main'>) {
  if (!(await git(['fetch', '--quiet', '--tags', 'origin'], dir, 40)).ok) return null;
  const latest = newestTag((await git(['tag', '--list', 'v*'], dir)).out.split('\n'), channel);
  return { latest, update: latest !== null && newer(latest, appVersion()) ? latest : null };
}

export async function check(channel: UpdateChannel): Promise<UpdateInfo> {
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
    const base = await installedCommit(dir);
    const here = (await git(['log', '-1', '--format=%cs', base], dir)).out;
    const own = installInfo() ? { channel } : {};
    const tags = followsTags(channel);
    if (tags) {
      const found = await releaseTag(dir, tags);
      if (!found) return { repo: true, offline: true, since: here, ...own };
      const { latest, update } = found;
      const notes = update ? await notesBetween(dir, base, `refs/tags/${update}`) : [];
      return { repo: true, behind: update ? 1 : 0, since: here, notes, ...own, ...(latest ? { latest } : {}) };
    }
    if (!(await git(['fetch', '--quiet', 'origin'], dir, 40)).ok)
      return { repo: true, offline: true, since: here, ...own };
    const head = await upstream(dir);
    const behind = Number.parseInt((await git(['rev-list', '--count', `${base}..${head}`], dir)).out, 10) || 0;
    return { repo: true, behind, since: here, notes: await notesBetween(dir, base, head), ...own };
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
// Never touch someone's own work. Stable and Beta check out a tag, so they also refuse a clone that has commits GitHub
// lacks or sits on another branch; Every change only pulls, and git refuses a pull that isn't a fast-forward.
async function refuseUnsafe(dir: string, tags: boolean) {
  if ((await git(['status', '--porcelain', '--untracked-files=no'], dir)).out)
    throw new Error(
      "Your Fenmyr folder has its own changes, so it wasn't updated. Run ./install.sh --update in a terminal to see them.",
    );
  if (!tags) {
    if (!(await git(['merge-base', '--is-ancestor', 'HEAD', await upstream(dir)], dir)).ok)
      throw new Error("This copy has diverged from GitHub, so it wasn't updated.");
    return;
  }
  const ours = ['for-each-ref', '--count=1', '--format=%(refname)', '--contains', 'HEAD', 'refs/remotes/origin'];
  if (!(await git(ours, dir)).out) throw new Error("Your Fenmyr folder has commits of its own, so it wasn't updated.");
  const branch = await git(['symbolic-ref', '--short', '--quiet', 'HEAD'], dir);
  if (branch.ok && branch.out !== 'main')
    throw new Error(`Your Fenmyr folder is on the branch "${branch.out}". Switch it to main, or choose Every change.`);
}
export async function now(channel: UpdateChannel): Promise<'updating'> {
  if (preview()) throw new Error('This is a preview, so nothing changed.');
  const dir = repoDir();
  if (dir) {
    const tags = followsTags(channel);
    await refuseUnsafe(dir, tags !== null);
    let to: string | null = null;
    if (tags) {
      const found = await releaseTag(dir, tags);
      if (!found) throw new Error("Couldn't reach GitHub.");
      to = found.update;
      if (!to) throw new Error('There is no newer release to update to.');
    }
    const searchPath = [
      ...(process.env.PATH || '').split(':'),
      path.join(os.homedir(), '.local/bin'),
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
    ];
    const getNode = process.platform === 'darwin' ? 'brew install node' : 'sudo pacman -S nodejs npm';
    if (!which('npm', searchPath))
      throw new Error(`Updating needs Node.js and npm. Install them (${getNode}), then try again.`);
    // The installer pulls (or checks out the tag), builds, reinstalls and reopens the app; it runs on its own so it can
    // close this one. The tag goes in as an argument, never inside the script. An app opened from the desktop has a
    // short PATH, so it gets the folders npm was found in.
    const log = fs.openSync(P.updateLog, 'w');
    const script = to ? 'cd "$0" && exec ./install.sh --update --to "$1"' : 'cd "$0" && exec ./install.sh --update';
    spawn('/bin/bash', ['-c', script, dir, ...(to ? [to] : [])], {
      detached: true,
      stdio: ['ignore', log, log],
      env: { ...process.env, PATH: searchPath.join(':') },
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
