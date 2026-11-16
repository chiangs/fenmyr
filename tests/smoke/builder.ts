import fs from 'node:fs';
import path from 'node:path';
import { readBuildEvent } from '../../src/shared/build.ts';
import type { Smoke } from './kit.ts';

// A build through the bridge, with the stand-in Claude Code rewriting the starter's App.tsx as one line: the page gets
// the snapshot as it starts, then the file with its lines added and removed, and the next steps, as it ends. While it
// runs, a commit, a pull, taking GitHub's version and Undo this build in its repo answer busy.
export async function builder(t: Smoke) {
  const repo = path.join(t.data, 'smoke-build');
  fs.mkdirSync(repo, { recursive: true });
  const r = await t.page.evaluate(async repo => {
    const F = window.Fenmyr;
    await F.gitInit(repo);
    const { dir } = await F.protoCreate({ root: repo, name: 'Smoke build', stack: 'react' });
    const starter = await F.protoRead({ root: repo, dir, file: 'src/App.tsx' });
    const events: unknown[] = [],
      ended = Promise.withResolvers<void>(),
      was = window.__fenmyrEvent;
    // the preload looks this up for each event, so wrapping it here sees every event the host sends
    window.__fenmyrEvent = (name, data) => {
      was?.(name, data);
      if (name !== 'protoBuild') return;
      events.push(data);
      const type = typeof data === 'object' && data !== null && 'type' in data ? data.type : null;
      if (type === 'done' || type === 'error') ended.resolve();
    };
    let answer: unknown = null,
      refused: string[] = [];
    try {
      answer = await F.protoBuild({
        root: repo,
        dir,
        stack: 'react',
        request: 'Say it was built',
        purpose: '',
        device: '',
        cards: '[]',
        errors: '',
        pictures: [],
        build: '',
        board: '',
      });
      // while the build writes, nothing else may change or take the repo's files
      refused = (
        await Promise.all([
          F.gitCommit({ root: repo, dir, message: 'Under the build' }),
          F.gitPull({ root: repo, account: '' }),
          F.gitTakeTheirs({ root: repo }),
          F.protoUndo({ root: repo, dir, snapshot: 'HEAD' }),
        ])
      ).map(x => x.kind);
      await Promise.race([ended.promise, new Promise(r => setTimeout(r, 20000))]);
    } finally {
      window.__fenmyrEvent = was;
    }
    return { starter, events, answer, refused };
  }, repo);
  const lines = r.starter.split('\n').length - (r.starter.endsWith('\n') ? 1 : 0);
  const [start, edit, done, ...more] = r.events.map(readBuildEvent);
  const counted = [{ kind: 'text', path: 'src/App.tsx', added: 1, removed: lines }];
  const id = typeof r.answer === 'object' && r.answer !== null && 'id' in r.answer ? r.answer.id : null;
  t.checkAll('builder', {
    started: JSON.stringify(r.answer) === JSON.stringify({ kind: 'started', id }) && start?.id === id,
    busy: JSON.stringify(r.refused) === '["busy","busy","busy","busy"]',
    startSnapshot: start?.type === 'start' && /^[0-9a-f]{40}$/.test(start.snapshot),
    edit: edit?.type === 'edit' && edit.file === 'src/App.tsx',
    done: done?.type === 'done' && !more.length,
    sameSnapshot: start?.type === 'start' && done?.type === 'done' && done.snapshot === start.snapshot,
    files: done?.type === 'done' && JSON.stringify(done.files) === JSON.stringify(counted),
    next: done?.type === 'done' && JSON.stringify(done.next) === '["Add a total","Show a receipt"]',
    text: done?.type === 'done' && done.text === 'I built it.',
  });
}

// Explain the code through the bridge: the stand-in answers a run that can only read, in the prototype's folder, told
// the build's files. A path outside the folder, an absolute one and a folder that isn't a prototype's are refused before
// Claude Code runs.
export async function explainer(t: Smoke) {
  const repo = path.join(t.data, 'smoke-build');
  const r = await t.page.evaluate(
    async ({ repo }) => {
      const F = window.Fenmyr,
        dir = (await F.protoFind({ root: repo }))[0]?.dir ?? '';
      const refused = async (files: string[], d = dir) => {
        try {
          await F.protoExplain({ root: repo, dir: d, files });
          return '';
        } catch (e) {
          return e instanceof Error ? e.message : String(e);
        }
      };
      const outside = await refused(['src/../../other/secret.ts']),
        absolute = await refused([`${repo}/${dir}/src/App.tsx`]),
        notProto = await refused(['src/App.tsx'], '../elsewhere');
      const answer = await F.protoExplain({ root: repo, dir, files: ['src/App.tsx'] });
      return { dir, outside, absolute, notProto, answer };
    },
    { repo },
  );
  const read = (f: string) => fs.readFileSync(path.join(t.data, f), 'utf8').trim();
  const args = read('explain-args.txt');
  t.checkAll('explain', {
    answer: r.answer === 'I read `src/App.tsx`. It shows the heading.\nNext: change the words in it.',
    readOnly:
      args.includes('--tools Read,Glob,Grep') &&
      args.includes('--allowedTools Read,Glob,Grep') &&
      args.includes('--disallowedTools Write,Edit,MultiEdit,NotebookEdit,Bash,WebFetch,WebSearch,Task') &&
      args.includes('--strict-mcp-config') &&
      !args.includes('acceptEdits'),
    // the person's own default mode, which may skip every check, never applies
    fixedMode: args.includes('--permission-mode default'),
    folderOnly: args.includes('blockReadsOutsideWorkingDirectories'),
    inFolder: !!r.dir && read('explain-cwd.txt') === fs.realpathSync(path.join(repo, r.dir)),
    namesFiles: read('explain-prompt.txt').includes('THE FILES THE LAST BUILD CHANGED:\nsrc/App.tsx'),
    outside: r.outside === "That file isn't part of this prototype.",
    absolute: r.absolute === "That file isn't part of this prototype.",
    notProto: r.notProto === "That isn't a prototype's folder.",
  });
}
