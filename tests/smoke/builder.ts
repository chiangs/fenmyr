import fs from 'node:fs';
import path from 'node:path';
import { readBuildEvent } from '../../src/shared/build.ts';
import type { Smoke } from './kit.ts';

// A build through the bridge, with the stand-in Claude Code rewriting the starter's App.tsx as one line: the page gets
// the snapshot as it starts, then the file with its lines added and removed, and the next steps, as it ends.
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
    try {
      await F.protoBuild({
        root: repo,
        dir,
        stack: 'react',
        request: 'Say it was built',
        purpose: '',
        device: '',
        cards: '[]',
        errors: '',
        pictures: [],
      });
      await Promise.race([ended.promise, new Promise(r => setTimeout(r, 20000))]);
    } finally {
      window.__fenmyrEvent = was;
    }
    return { starter, events };
  }, repo);
  const lines = r.starter.split('\n').length - (r.starter.endsWith('\n') ? 1 : 0);
  const [start, edit, done, ...more] = r.events.map(readBuildEvent);
  const counted = [{ kind: 'text', path: 'src/App.tsx', added: 1, removed: lines }];
  t.checkAll('builder', {
    startSnapshot: start?.type === 'start' && /^[0-9a-f]{40}$/.test(start.snapshot),
    edit: edit?.type === 'edit' && edit.file === 'src/App.tsx',
    done: done?.type === 'done' && !more.length,
    sameSnapshot: start?.type === 'start' && done?.type === 'done' && done.snapshot === start.snapshot,
    files: done?.type === 'done' && JSON.stringify(done.files) === JSON.stringify(counted),
    next: done?.type === 'done' && JSON.stringify(done.next) === '["Add a total","Show a receipt"]',
    text: done?.type === 'done' && done.text === 'I built it.',
  });
}
