import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Page } from 'playwright';
import type { ChatMsg } from '../src/shared/chat.ts';
import {
  BUILD,
  builtChat,
  errorsChat,
  failedChat,
  protoBuildCards,
  stoppedChat,
} from '../tests/fixtures/protoBuild.ts';
import { writeBuildStandIn } from '../tests/support/buildStandIn.ts';
import { settle } from '../tests/support/launch.ts';
import type { Group, Step } from './visual-myra.ts';

const screen: [string, Step][] = [['screen', async () => {}]];
// the chat dragged to its narrowest, 280 px, along its top so the pointer ends over no button in the chat
const narrowestChat: Step = async page => {
  const d = await page.locator('.pr-div[data-d="chat"]').boundingBox();
  if (!d) return;
  await page.mouse.move(d.x + d.width / 2, d.y + 10);
  await page.mouse.down();
  await page.mouse.move(d.x + 100, d.y + 10, { steps: 4 });
  await page.mouse.up();
};

// the git bar's More menu open; a checkout whose bar has no More shows its screen as it is
const gitMore: Step = async page => {
  const more = page.locator('#prGit [data-git="more"]');
  if (await more.count()) await more.click();
};

// A stand-in Claude Code first on PATH for the build groups, there before Fenmyr starts, since Fenmyr remembers where
// it found Claude Code. The same one serves both checkouts.
const standInAt = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-visual-claude-'));
const standIn = writeBuildStandIn(path.join(standInAt, 'bin', 'claude'), path.join(standInAt, 'work'));
const withStandIn = { PATH: `${path.join(standInAt, 'bin')}:${process.env.PATH ?? ''}` };

const reopen = async (page: Page) => {
  await page.evaluate(() => window.__fenmyr.openBoard('vb'));
  await page.frameLocator('#pr-preview iframe').locator('h1').waitFor({ timeout: 30000 });
};

// The prototype as it is after one build, its chat and cards saved with it and that build named as its newest. A
// checkout without prototypes has no board to seed.
const seeded =
  (chat: (board: string) => ChatMsg[]): Step =>
  async page => {
    const made = await page.evaluate(
      async ({ chat, cards, build }) => {
        const b = window.__fenmyr.curBoard();
        if (b?.kind !== 'prototype') return false;
        await window.Fenmyr.save({ ...b, cards, chat, proto: { ...b.proto, build } });
        return true;
      },
      { chat: chat('vb'), cards: protoBuildCards, build: BUILD },
    );
    if (made) await reopen(page);
  };

// A build partway through: the stand-in has reported writing App.tsx and waits. It writes back what was there, so the
// code and the preview stay as they were. Waiting on its count works on a checkout that draws no block.
const building: Step = async page => {
  await seeded(() => [])(page);
  const dir = await page.evaluate(() => {
    const b = window.__fenmyr.curBoard();
    return b?.kind === 'prototype' ? b.proto.dir : null;
  });
  if (!dir) return;
  const app = path.join(parent, 'acme', dir, 'src/App.tsx');
  standIn.next({ files: { 'src/App.tsx': fs.readFileSync(app, 'utf8') }, hold: true });
  await page.evaluate(() =>
    window.__fenmyr.applyMyra({ say: 'Writing it now.', build: { request: 'Put the total first.' } }, 'Put it first'),
  );
  for (const end = Date.now() + 20000; standIn.wrote() < 1; await page.waitForTimeout(100))
    if (Date.now() > end) throw new Error('the stand-in never wrote App.tsx');
};

// A second request while that build runs: it waits as its own block. A checkout without a queue turns it away.
const queued: Step = async page => {
  await page.evaluate(() =>
    window.__fenmyr.applyMyra(
      { say: 'I’ll do that next.', build: { request: 'Add a coupon field under the total.' } },
      'Add a coupon field',
    ),
  );
  await settle(page, 600);
};

export const PROTO_GROUPS: Record<string, Group> = {
  'proto-wide': { proto: true, width: 1440, states: screen },
  'proto-medium': { proto: true, width: 1200, states: [...screen, ['git-more', gitMore]] },
  'proto-narrow': { proto: true, width: 900, states: [...screen, ['chat-280', narrowestChat]] },
  'proto-dark': { proto: true, width: 1200, settings: { theme: 'dark' }, states: [...screen, ['git-more', gitMore]] },
  'proto-build': {
    proto: true,
    width: 1200,
    env: withStandIn,
    states: [
      ['built', seeded(builtChat)],
      ['errors', seeded(errorsChat)],
      ['failed', seeded(failedChat)],
      ['stopped', seeded(stoppedChat)],
      ['building', building],
      ['queued', queued],
    ],
  },
  'proto-build-dark': { proto: true, width: 1200, settings: { theme: 'dark' }, states: [['built', seeded(builtChat)]] },
};

// A prototype board in a fresh repo, its starter running in the preview. A checkout without prototypes (main, until
// the feature lands) has no protoCreate, so it shows its ordinary board and the state is listed as meant.
// One folder for the whole run, so both sides show the same path in the git bar's More menu.
let parent = '';
export async function openPrototype(page: Page) {
  parent ||= fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-visual-repo-'));
  const repo = path.join(parent, 'acme');
  fs.rmSync(repo, { recursive: true, force: true });
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

/** Removes this run's stand-in and prototype folders, once both checkouts are shot. */
export function removeProtoFolders() {
  fs.rmSync(standInAt, { recursive: true, force: true });
  if (parent) fs.rmSync(parent, { recursive: true, force: true });
}
