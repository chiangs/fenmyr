// The Channel row in Settings → About → Updates, in the app. Only a clone install shows it. It starts on Stable, or
// on Beta for a prerelease, until someone chooses, and keeps what they chose; a damaged saved value is ignored. Choosing
// runs a fresh check for that channel, Update now names it, and Stable on a beta says when it will move. The what's-new
// card counts a beta as coming before its release. Update checks are answered from the page's own variable.
import assert from 'node:assert';
import type { Page } from 'playwright';
import { everyOfflineCard } from './fixtures/boards.ts';
import { appCopy } from './support/appCopy.ts';
import { type Launched, launch } from './support/launch.ts';
import { still } from './support/settled.ts';

const SINCE = '2026-11-21';
const clone = (channel: string, more: Record<string, unknown> = {}) => ({
  repo: true,
  since: SINCE,
  notes: [],
  behind: 0,
  channel,
  ...more,
});

async function aboutOf(dir?: string, settings: Record<string, unknown> = {}): Promise<Launched> {
  const l = await launch({ dir, settings, boards: [everyOfflineCard()], open: 'every' });
  await l.page.evaluate(() => {
    const calls: [string, unknown][] = [];
    Reflect.set(window, '__calls', calls);
    Reflect.set(Fenmyr, 'updateCheck', async (channel: unknown) => {
      calls.push(['check', channel]);
      return Reflect.get(window, '__answer') ?? {};
    });
    Reflect.set(Fenmyr, 'updateNow', async (channel: unknown) => {
      calls.push(['now', channel]);
      return 'updating';
    });
  });
  await l.page.click('#gearBtn');
  await l.page.click('#setTabs [data-tab="about"]');
  await l.page.waitForFunction(() => document.getElementById('aboutVersion')?.textContent);
  return l;
}
const idle = (page: Page) =>
  page.waitForFunction(() => !/Checking/.test(document.getElementById('suSub')?.textContent ?? ''));
async function answer(page: Page, a: Record<string, unknown>, then: string) {
  await page.evaluate(
    ([x, selector]) => {
      Reflect.set(window, '__answer', x);
      document.querySelector(selector ?? '')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    },
    [a, then] as const,
  );
  await idle(page);
  await still(page);
}
const calls = (page: Page) => page.evaluate((): unknown => Reflect.get(window, '__calls'));
const text = async (page: Page, selector: string) => (await page.textContent(selector)) ?? '';
const chosen = (page: Page) => page.textContent('#suChannel .on');
const saved = (page: Page) =>
  page.evaluate(() => {
    const raw: unknown = JSON.parse(localStorage.getItem('fenmyr:settings') ?? '{}');
    return typeof raw === 'object' && raw !== null ? Reflect.get(raw, 'updateChannel') : undefined;
  });
// whether the row is out of sight, as the person sees it, not whether its attribute says so
const hidden = async (page: Page) => !(await page.isVisible('#suChannelRow'));

// a release: the row follows the answer, starts on Stable, and keeps each choice
const l = await aboutOf();
try {
  const { page } = l;
  await answer(page, { repo: true, since: SINCE, notes: [], behind: 0 }, '#suCheck');
  assert.strictEqual(await hidden(page), true, 'a checkout has no channel, so no row');
  await answer(page, {}, '#suCheck');
  assert.strictEqual(await hidden(page), true, 'nor does an install that updates another way');

  await answer(page, clone('stable', { latest: 'v1.0.0' }), '#suCheck');
  assert.strictEqual(await hidden(page), false, 'a clone install shows the row');
  assert.strictEqual(await chosen(page), 'Stable', 'on Stable until someone chooses');
  assert.strictEqual(await text(page, '#suChannelNote'), 'Tested releases.', 'with its line under Channel');
  assert.strictEqual(await saved(page), undefined, 'and nothing is saved before they choose');
  assert.deepStrictEqual(
    await page.$$eval('#suChannel button', bs => bs.map(b => [b.textContent, b.getAttribute('aria-pressed')])),
    [
      ['Stable', 'true'],
      ['Beta', 'false'],
      ['Every change', 'false'],
    ],
    'three choices, with the chosen one marked for a screen reader',
  );

  const next = clone('beta', { behind: 1, latest: 'v1.1.0-beta.2', notes: ['A new thing'] });
  await answer(page, next, '#suChannel [data-v="beta"]');
  assert.strictEqual(await chosen(page), 'Beta', 'choosing Beta marks it');
  assert.strictEqual(
    await text(page, '#suChannelNote'),
    'New things early, with some rough edges. Stable releases come too.',
    'and changes the line',
  );
  assert.strictEqual(await saved(page), 'beta', 'and it is saved');
  const checks = JSON.stringify(await calls(page));
  assert.ok(checks.includes('["check","beta"]'), `choosing runs a fresh check for Beta: ${checks}`);
  assert.match(
    await text(page, '#suSub'),
    /^Version 1\.1\.0-beta\.2 is ready \(you have 1\.0\.0/,
    'it says which release',
  );
  assert.strictEqual(await text(page, '#ubText'), 'Fenmyr 1.1.0-beta.2 is ready', 'the bar names it');
  assert.strictEqual(await text(page, '#suNotes li'), 'A new thing', 'with its notes');

  await page.click('#suGo');
  await page.waitForFunction(() => JSON.stringify(Reflect.get(window, '__calls')).includes('"now"'));
  assert.ok(JSON.stringify(await calls(page)).includes('["now","beta"]'), 'Update now says which channel');

  await answer(page, clone('main', { behind: 2 }), '#suChannel [data-v="main"]');
  assert.strictEqual(await chosen(page), 'Every change', 'Every change can be chosen');
  assert.strictEqual(
    await text(page, '#suChannelNote'),
    'Each change as it’s merged. For people working on Fenmyr.',
    'with its line',
  );
  assert.match(await text(page, '#suSub'), /^2 updates since your version/, 'and counts changes as it always did');
  assert.strictEqual(await saved(page), 'main', 'and is saved');
  assert.ok(JSON.stringify(await calls(page)).includes('["check","main"]'), 'after a fresh check for it');
  assert.deepStrictEqual(l.errors, [], 'no page errors');
} finally {
  await l.close();
}

// what was saved is read back, and a damaged value is ignored
for (const [value, shown] of [
  ['beta', 'Beta'],
  ['main', 'Every change'],
  ['nightly', 'Stable'],
  [7, 'Stable'],
] as const) {
  const m = await aboutOf(undefined, { updateChannel: value });
  try {
    await answer(m.page, clone('stable'), '#suCheck');
    assert.strictEqual(await chosen(m.page), shown, `a saved ${JSON.stringify(value)} reads as ${shown}`);
    const asked = JSON.stringify(await calls(m.page));
    assert.ok(
      asked.includes(`["check","${shown === 'Every change' ? 'main' : shown.toLowerCase()}"]`),
      'and is the channel asked for',
    );
  } finally {
    await m.close();
  }
}

// a beta: the row starts on Beta, About says Beta, and leaving it never downgrades
const betaApp = appCopy('1.0.0-beta.1');
const b = await aboutOf(betaApp.dir);
try {
  const { page } = b;
  await answer(page, clone('beta', { latest: 'v1.0.0-beta.1' }), '#suCheck');
  assert.strictEqual(await chosen(page), 'Beta', 'a prerelease starts on Beta');
  assert.match(await text(page, '#aboutVersion'), /^1\.0\.0-beta\.1 · Beta/, 'About says Beta');
  assert.match(
    await text(page, '#suSub'),
    /^You’re up to date \(1\.0\.0-beta\.1 · Beta/,
    'and the Updates line names the beta',
  );

  await answer(page, clone('stable', { latest: 'v0.9.0' }), '#suChannel [data-v="stable"]');
  assert.strictEqual(
    await text(page, '#suSub'),
    'You’re on 1.0.0-beta.1. You’ll move to Stable with the next stable release.',
    'Stable on a beta says when it will move',
  );
  assert.ok(JSON.stringify(await calls(page)).includes('["check","stable"]'), 'after a fresh check for Stable');
  await answer(page, clone('stable', { behind: 1, latest: 'v1.0.0' }), '#suCheck');
  assert.match(
    await text(page, '#suSub'),
    /^Version 1\.0\.0 is ready \(you have 1\.0\.0-beta\.1 · Beta/,
    'and offers the release once it exists',
  );

  // the what's-new card for 1.0.0 is not shown for a beta of 1.0.0, but is for 1.0.0 itself
  const card = (p: Page) =>
    p.evaluate(async () => {
      localStorage.removeItem('fenmyr:newsSeen');
      await window.__fenmyr.maybeNews();
      return document.getElementById('news')?.classList.contains('on');
    });
  assert.strictEqual(await card(page), false, 'a beta of 1.0.0 does not show the 1.0.0 card');
  assert.deepStrictEqual(b.errors, [], 'no page errors');
} finally {
  await b.close();
  betaApp.remove();
}
// the card lists every version's news after the one last seen, up to the running version, and nothing newer
const news = (p: Page, seen: string | null) =>
  p.evaluate(async seen => {
    if (seen) localStorage.setItem('fenmyr:newsSeen', seen);
    else localStorage.removeItem('fenmyr:newsSeen');
    document.getElementById('news')?.classList.remove('on');
    await window.__fenmyr.maybeNews();
    const on = document.getElementById('news')?.classList.contains('on') ?? false;
    return { on, list: document.getElementById('newsList')?.textContent ?? '' };
  }, seen);
const release = await launch({ boards: [everyOfflineCard()], open: 'every' });
try {
  const fresh = await news(release.page, null);
  assert.strictEqual(fresh.on, true, '1.0.0 shows its own card');
  assert.ok(!fresh.list.includes('Prototypes'), 'and not the news of a later beta');
} finally {
  await release.close();
}
const nextBeta = appCopy('1.1.0-beta.1');
const n = await launch({ dir: nextBeta.dir, boards: [everyOfflineCard()], open: 'every' });
try {
  const fresh = await news(n.page, null);
  assert.ok(fresh.on && fresh.list.includes('Prototypes'), 'a new install of the beta shows its news');
  assert.ok(fresh.list.includes('Hello, I’m Myra'), 'after 1.0.0’s, since it never saw those');
  const after = await news(n.page, '1.0.0');
  assert.ok(after.on && after.list.includes('Six themes'), 'coming from 1.0.0 shows the beta’s news');
  assert.ok(!after.list.includes('Hello, I’m Myra'), 'and not 1.0.0’s again');
  assert.strictEqual((await news(n.page, '1.1.0-beta.1')).on, false, 'and once seen, it stays shut');
  assert.deepStrictEqual(n.errors, [], 'no page errors');
} finally {
  await n.close();
  nextBeta.remove();
}
console.log('UPDATE CHANNEL OK');
