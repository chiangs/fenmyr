import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Page } from 'playwright';
import { settle } from '../tests/support/launch.ts';
import type { Group, Step } from './visual-myra.ts';

const screen: [string, Step][] = [['screen', async () => {}]];
// the chat dragged to its narrowest, 280 px
const narrowestChat: Step = async page => {
  const d = await page.locator('.pr-div[data-d="chat"]').boundingBox();
  if (!d) return;
  await page.mouse.move(d.x + d.width / 2, d.y + d.height / 2);
  await page.mouse.down();
  await page.mouse.move(d.x + 100, d.y + d.height / 2, { steps: 4 });
  await page.mouse.up();
};

export const PROTO_GROUPS: Record<string, Group> = {
  'proto-wide': { proto: true, width: 1440, states: screen },
  'proto-medium': { proto: true, width: 1200, states: screen },
  'proto-narrow': { proto: true, width: 900, states: [...screen, ['chat-280', narrowestChat]] },
  'proto-dark': { proto: true, width: 1200, settings: { theme: 'dark' }, states: screen },
};

// A prototype board in a fresh repo, its starter running in the preview. A checkout without prototypes (main, until
// the feature lands) has no protoCreate, so it shows its ordinary board and the state is listed as meant.
export async function openPrototype(page: Page) {
  // a fixed name, since the git bar shows it
  const repo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-visual-repo-')), 'acme');
  fs.mkdirSync(repo);
  execFileSync('git', ['-C', repo, 'init', '-q', '-b', 'main']);
  const made = await page.evaluate(async repo => {
    const api: Record<string, unknown> = { ...window.Fenmyr };
    if (typeof api.protoCreate !== 'function') return false;
    await window.Fenmyr.saveFolders({
      projects: [{ id: 'vp', name: 'Acme', open: true, repo: { path: repo } }],
      folders: [{ id: 'vf', name: 'Prototypes', project: 'vp', kind: 'prototyping', open: true }],
      order: {},
    });
    const proto = await window.Fenmyr.protoCreate({ root: repo, name: 'Checkout', stack: 'react' });
    await window.Fenmyr.save({
      id: 'vb',
      name: 'Checkout',
      folder: 'vf',
      kind: 'prototype',
      proto,
      cards: [],
      links: [],
      tray: [],
    });
    await window.__fenmyr.refreshBoards();
    await window.__fenmyr.openBoard('vb');
    return true;
  }, repo);
  if (made) await page.frameLocator('#pr-preview iframe').locator('h1').waitFor({ timeout: 30000 });
  await settle(page, 800);
}
