import fs from 'node:fs';
import path from 'node:path';
import type { Smoke } from './kit.ts';

// The bridge operations for repos and prototypes, each called once against a throwaway repo: what they answer, and
// that a wrong request is refused in words. Sign-in, GitHub, npm and the builder need the network or a person, and
// have tests of their own.
export async function repoOps(t: Smoke) {
  const { page, data } = t;
  const repo = path.join(data, 'smoke-repo'),
    other = path.join(data, 'smoke-other');
  for (const d of [repo, other]) fs.mkdirSync(d, { recursive: true });
  const r = await page.evaluate(
    async ({ repo, other }) => {
      const F = window.Fenmyr,
        refused = (p: Promise<unknown>) =>
          p.then(
            () => '',
            e => (e instanceof Error ? e.message : String(e)),
          );
      const folder = await F.gitStatus(repo);
      const made = await F.gitInit(repo);
      await F.gitInit(other);
      const named = await F.gitSetIdentity({
        path: repo,
        name: 'Smoke',
        email: 'smoke@example.com',
        everywhere: false,
      });
      await F.gitSetIdentity({ path: other, name: 'Smoke', email: 'smoke@example.com', everywhere: false });
      const everywhere = await F.gitSetGlobalIdentity('Smoke', 'smoke@example.com');
      const setup = await F.gitSetup();
      const gh = await F.ghStatus();
      const pm = await F.packageManager();
      const proto = await F.protoCreate({ root: repo, name: 'Smoke flow', stack: 'react' });
      const files = await F.protoFiles({ root: repo, dir: proto.dir });
      const app = await F.protoRead({ root: repo, dir: proto.dir, file: 'src/App.tsx' });
      const outside = await refused(F.protoRead({ root: repo, dir: proto.dir, file: '../../.git/config' }));
      await F.protoWriteTweaks({
        root: repo,
        dir: proto.dir,
        json: '{"size":{"kind":"number","label":"Size","value":3}}',
      });
      const tweaks = await F.protoRead({ root: repo, dir: proto.dir, file: 'src/tweaks.json' });
      const found = await F.protoFind({ root: repo });
      const exists = await F.protoExists({ root: repo, dir: proto.dir });
      const noModule = await F.protoModule({ root: repo, file: 'left-pad/index.js' });
      const committed = await F.gitCommit({ root: repo, dir: proto.dir, message: 'Smoke flow' });
      const head = committed.kind === 'repo' ? (committed.head ?? '') : '';
      const atCommit = await F.protoAtCommit({ root: repo, dir: proto.dir, commit: head });
      const notCommit = await refused(F.protoAtCommit({ root: repo, dir: proto.dir, commit: 'HEAD~1; rm -rf /' }));
      const last = await F.protoLastChange({ root: repo, dir: proto.dir });
      const fetched = await F.gitFetch({ root: repo, account: '' });
      const noPush = await refused(F.gitPush({ root: repo, account: '' }));
      const noPull = await refused(F.gitPull({ root: repo, account: '' }));
      const copied = await F.protoCopy({ fromRoot: repo, dir: proto.dir, toRoot: other });
      const renamed = await F.protoRename({ root: repo, dir: proto.dir, name: 'Smoke renamed' });
      const restored = await F.protoRestore({ root: repo, dir: 'prototypes/gone', name: 'Gone', stack: 'html' });
      const picture = await F.captureArea({ x: 0, y: 0, w: 40, h: 30 });
      return {
        folder: folder.kind,
        made: made.kind === 'repo' && made.head === null,
        named: named.kind === 'repo' && named.identity.email === 'smoke@example.com',
        everywhere: everywhere.email,
        setup: setup.git,
        gh: gh.kind,
        pm: pm === null || typeof pm === 'string',
        dir: proto.dir,
        files,
        app: /export function App/.test(app),
        outside,
        tweaks: JSON.parse(tweaks).size.value,
        found,
        exists,
        noModule,
        head: /^[0-9a-f]{40}$/.test(head),
        atCommit: Object.keys(atCommit).sort(),
        notCommit,
        last: last.subject,
        fetched: fetched.kind,
        noPush,
        noPull,
        copied,
        renamed: renamed.dir,
        restored,
        picture: picture.startsWith('data:image/png;base64,'),
      };
    },
    { repo, other },
  );
  t.checkAll('repoOps', {
    folderIsNotRepo: r.folder === 'folder',
    init: r.made,
    identity: r.named,
    globalIdentity: r.everywhere === 'smoke@example.com',
    gitFound: r.setup,
    ghAnswers: r.gh === 'missing' || r.gh === 'ready',
    packageManager: r.pm,
    created: r.dir === 'prototypes/smoke-flow' && r.files.includes('src/App.tsx') && r.app,
    readStaysInside: /isn't part of this prototype/.test(r.outside),
    tweaksWritten: r.tweaks === 3,
    found: r.found.some(f => f.dir === 'prototypes/smoke-flow' && f.name === 'Smoke flow'),
    exists: r.exists,
    noModule: r.noModule === null,
    committed: r.head,
    atCommit: r.atCommit.includes('src/App.tsx') && r.atCommit.includes('index.html'),
    notACommit: /isn't a commit/.test(r.notCommit),
    lastChange: r.last === 'Smoke flow',
    fetchWithoutGitHub: r.fetched === 'repo',
    pushNeedsGitHub: /GitHub/.test(r.noPush),
    pullNeedsGitHub: /GitHub/.test(r.noPull),
    copied: r.copied.dir === 'prototypes/smoke-flow' && r.copied.files > 0,
    renamed: r.renamed === 'prototypes/smoke-renamed',
    restoredFresh: r.restored === 'fresh',
    capture: r.picture,
  });
}
