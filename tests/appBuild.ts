// What Settings → About says about the build, in the app. The version line comes from the stamp the build wrote, with
// "+ changes" when files were modified, Copy details puts the whole text on the clipboard, the update line names the
// installed version the same way on every kind of install, and a missing or damaged stamp shows the version alone
// without a page error.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Page } from 'playwright';
import { detailsText, versionLine } from '../src/shared/buildStamp.ts';
import { everyOfflineCard } from './fixtures/boards.ts';
import { launch, ROOT } from './support/launch.ts';
import { still } from './support/settled.ts';

const FULL = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-appbuild-'));
const stampFile = (name: string, text: string) => {
  const file = path.join(tmp, name);
  fs.writeFileSync(file, text);
  return file;
};
const pkg: unknown = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const version = typeof pkg === 'object' && pkg !== null ? String(Reflect.get(pkg, 'version')) : '';

// Every update check the page makes, whenever it makes it, is answered from the page's own variable instead of asking
// git and GitHub, so what the Updates line says depends on nothing but the case being run.
async function aboutOf(stamp: string) {
  const l = await launch({ boards: [everyOfflineCard()], open: 'every', env: { FENMYR_BUILD_STAMP: stamp } });
  await l.page.evaluate(() => Reflect.set(Fenmyr, 'updateCheck', async () => Reflect.get(window, '__answer') ?? {}));
  await l.page.click('#gearBtn');
  await l.page.click('#setTabs [data-tab="about"]');
  await still(l.page);
  await l.page.waitForFunction(() => document.getElementById('aboutVersion')?.textContent);
  return l;
}
const line = (page: Page) => page.textContent('#aboutVersion');
const build = (page: Page) => page.evaluate(() => Fenmyr.appBuild());

async function updatesSay(page: Page, answer: Record<string, unknown>) {
  await page.evaluate(a => {
    Reflect.set(window, '__answer', { notes: [], ...a });
    document.getElementById('suCheck')?.click();
  }, answer);
  await page.waitForFunction(() => !/Checking/.test(document.getElementById('suSub')?.textContent ?? ''));
  await still(page);
  return page.textContent('#suSub');
}

const changed = stampFile(
  'changed.json',
  JSON.stringify({ commit: FULL, changes: true, builtAt: '2026-11-21T10:30:00Z' }),
);
const l = await aboutOf(changed);
try {
  const { page } = l;
  const b = await build(page);
  assert.strictEqual(b.commit, FULL, 'the host reports the commit the stamp names');
  assert.strictEqual(b.changes, true, 'and that files had changed');
  assert.strictEqual(b.version, version, 'with the version in package.json');
  assert.strictEqual(await line(page), versionLine(b), 'About shows the version line');
  assert.match((await line(page)) ?? '', /a1b2c3d \+ changes$/, 'with the short commit and + changes');

  await page.click('#copyDetails');
  await page.waitForFunction(() => document.getElementById('copyDetails')?.textContent === 'Copied');
  const copied = await l.app.evaluate(({ clipboard }) => clipboard.readText());
  assert.strictEqual(copied, detailsText(b), 'Copy details puts the details on the clipboard');
  assert.ok(copied.includes(FULL), 'with the whole commit');
  assert.ok(copied.includes('with uncommitted changes'), 'and that files had changed');
  await page.waitForFunction(() => document.getElementById('copyDetails')?.textContent === 'Copy details');

  const have = versionLine(b);
  const clone = { repo: true, since: '2026-11-21' };
  assert.strictEqual(
    await updatesSay(page, { ...clone, behind: 0 }),
    `You’re up to date (${have}).`,
    'a clone that is up to date says which build it is',
  );
  assert.match(
    (await updatesSay(page, { ...clone, behind: 3 })) ?? '',
    new RegExp(`^3 updates since your version \\(${have.replace(/[+.]/g, '\\$&')}\\)\\.`),
    'a clone behind says which build it has',
  );
  const image = { release: true, since: '1.0.0' };
  assert.strictEqual(
    await updatesSay(page, { ...image, behind: 0 }),
    `You’re up to date (${have}).`,
    'an AppImage says the same kind of thing',
  );
  assert.match(
    (await updatesSay(page, { ...image, behind: 1, latest: 'v1.2.0' })) ?? '',
    new RegExp(`^Version 1\\.2\\.0 is ready \\(you have ${have.replace(/[+.]/g, '\\$&')}\\)\\.`),
    'and when one is ready, which build you have',
  );
  assert.deepStrictEqual(l.errors, [], 'no page errors');
} finally {
  await l.close();
}

const unusable: [string, string][] = [
  ['missing', path.join(tmp, 'nothing-here.json')],
  ['broken', stampFile('broken.json', '{"commit": "a1b2c3d4e5f6')],
  ['wrong', stampFile('wrong.json', JSON.stringify({ commit: 42, changes: 'yes', builtAt: 'yesterday' }))],
];
for (const [name, stamp] of unusable) {
  const m = await aboutOf(stamp);
  try {
    const b = await build(m.page);
    assert.strictEqual(b.commit, null, `${name} stamp: no commit`);
    const shown = (await line(m.page)) ?? '';
    assert.strictEqual(shown, versionLine(b), `${name} stamp: About shows what the host reports`);
    assert.strictEqual(shown, b.prerelease ? `${version} · Beta` : version, `${name} stamp: the version alone`);
    assert.ok(!/null|undefined/.test(shown), `${name} stamp: nothing reads null`);
    await m.page.click('#copyDetails');
    await m.page.waitForFunction(() => document.getElementById('copyDetails')?.textContent === 'Copied');
    const copied = await m.app.evaluate(({ clipboard }) => clipboard.readText());
    assert.ok(!/Commit|null|undefined/.test(copied), `${name} stamp: the details name no commit and read no null`);
    assert.deepStrictEqual(m.errors, [], `${name} stamp: no page error`);
  } finally {
    await m.close();
  }
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log('APP BUILD OK');
