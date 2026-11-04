import type { Board } from '../../shared/model.ts';
import { $ } from '../core/dom.ts';
import { rootOf } from '../repo/codeFolder.ts';
import { closestTo, esc } from '../ui/dom.ts';

// The code pane: the prototype's files, and the one picked, read-only for now.
let shown = '';

async function showFile(root: string, dir: string, file: string) {
  shown = file;
  const el = $('pr-code');
  for (const b of el.querySelectorAll<HTMLElement>('[data-file]')) b.classList.toggle('on', b.dataset.file === file);
  const text = await Fenmyr.protoRead({ root, dir, file }).catch(e => (e instanceof Error ? e.message : String(e)));
  const view = el.querySelector('.pc-text code');
  if (view) view.textContent = text;
}

export async function renderCode(b: Board) {
  const el = $('pr-code'),
    root = rootOf(b);
  if (b.kind !== 'prototype' || !root) {
    el.innerHTML =
      '<p class="pr-note">This prototype’s project isn’t linked to a repo, so there’s no code to show.</p>';
    return;
  }
  const { dir } = b.proto;
  const files = await Fenmyr.protoFiles({ root, dir }).catch((): string[] => []);
  if (!files.length) {
    const where = esc(dir);
    el.innerHTML = `<p class="pr-note">There are no files in ${where} yet.</p>`;
    return;
  }
  if (!files.includes(shown)) shown = files.find(f => /(^|\/)(App\.tsx|index\.html)$/.test(f)) ?? files[0] ?? '';
  const list = files
    .map(f => {
      const name = esc(f);
      return `<button class="pc-file" data-file="${name}">${name}</button>`;
    })
    .join('');
  el.innerHTML = `<div class="pc-files">${list}</div><pre class="pc-text"><code></code></pre>`;
  el.onclick = e => {
    const f = closestTo(e.target, '[data-file]')?.dataset.file;
    if (f) showFile(root, dir, f);
  };
  await showFile(root, dir, shown);
}
