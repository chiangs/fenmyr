import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Page } from 'playwright';

// a fresh git repo named acme, the name the git bar shows
export function freshRepo(prefix: string) {
  const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  const repo = path.join(work, 'acme');
  fs.mkdirSync(repo);
  execFileSync('git', ['-C', repo, 'init', '-q', '-b', 'main']);
  return { work, repo };
}

// Push, Pull and Open on GitHub, from the git bar's More menu
export async function fromGitMenu(page: Page, label: string | RegExp) {
  await page.click('#prGit [data-git="more"]');
  await page.locator('#rowMenu button', { hasText: label }).click();
}

export async function openPrototype(page: Page, repo: string) {
  await page.evaluate(async repo => {
    await window.Fenmyr.saveFolders({
      projects: [{ id: 'p1', name: 'Acme', open: true, repo: { path: repo } }],
      folders: [{ id: 'pf', name: 'Prototypes', project: 'p1', kind: 'prototyping', open: true }],
      order: {},
    });
    const proto = await window.Fenmyr.protoCreate({ root: repo, name: 'Checkout flow', stack: 'react' });
    await window.Fenmyr.save({
      id: 'pb',
      name: 'Checkout flow',
      folder: 'pf',
      kind: 'prototype',
      proto,
      cards: [],
      links: [],
      tray: [],
    });
    await window.__fenmyr.refreshBoards();
    await window.__fenmyr.openBoard('pb');
  }, repo);
}
