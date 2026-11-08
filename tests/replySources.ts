// What Myra read and her next steps, under her reply in the real app: "I read 2 notes from your vault" with each note a
// link that opens it in Obsidian, the web pages she opened the same way (http and https only, and only when the web was
// on), and up to three of her own next steps even beside other buttons, which send their words when clicked. All of
// it comes back when the chat closes and opens, when the board opens again and when the app starts again.
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Page } from 'playwright';
import { replyBoard } from './fixtures/boards.ts';
import { type Launched, launch, settle } from './support/launch.ts';

const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-sources-'));
const vaultDir = path.join(data, 'vault');
fs.cpSync(path.join(import.meta.dirname, 'sample-vault'), vaultDir, { recursive: true });
const boards = [replyBoard('read', 'Read'), replyBoard('away', 'Away')];

const failed: string[] = [];
async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
    console.log(`ok    ${name}`);
  } catch (e) {
    failed.push(name);
    console.log(`FAIL  ${name}: ${e instanceof Error ? e.message : e}`);
  }
}

// the bridge's openURL and ask, kept in the page instead of reaching the system or Claude
async function stubBridge(page: Page) {
  await page.evaluate(() => {
    const opened: string[] = [],
      sent: string[] = [];
    Reflect.set(window, 'opened', opened);
    Reflect.set(window, 'sent', sent);
    window.Fenmyr.openURL = async (url: string) => {
      opened.push(url);
      return true;
    };
    window.Fenmyr.ask = async (prompt: string) => {
      sent.push(prompt);
      return JSON.stringify({ say: 'Sure.' });
    };
  });
}
const kept = (page: Page, name: string) =>
  page.evaluate(name => [...(Reflect.get(window, name) ?? [])].map(String), name);

// the boards are written only the first time, so a start after that reads what the app saved
async function start(fresh = false): Promise<Launched> {
  const l = await launch({ boards: fresh ? boards : [], open: 'read', claude: true, data });
  await stubBridge(l.page);
  await l.page.evaluate(() => document.getElementById('mPill')?.click());
  await settle(l.page, 300);
  return l;
}

// each part under the message, in the order it is drawn
const under = (page: Page, text: string) =>
  page.evaluate(text => {
    const d = [...document.querySelectorAll('#mcList .mc-msg')].find(m => m.firstChild?.textContent === text);
    return [...(d?.querySelector('.m-parts')?.children ?? [])].map(el =>
      el.classList.contains('m-sources')
        ? `sources: ${el.querySelector('b')?.textContent} | ${[...el.querySelectorAll('button.m-link')].map(b => b.textContent).join(' | ')}`
        : el.classList.contains('m-summary')
          ? 'summary'
          : `row: ${[...el.querySelectorAll('button')].map(b => b.textContent).join(' | ')}`,
    );
  }, text);
const link = (page: Page, label: string) => page.locator('#mcList .m-sources button.m-link', { hasText: label });

let l = await start(true);
const vault = await l.page.evaluate(async dir => {
  const v = await Fenmyr.vaultAdd(dir);
  return { id: v.id, name: v.obsidian || v.name };
}, vaultDir);
await l.close();
l = await start();

const note = (rel: string, title: string) => ({
  vault: vault.name,
  vaultId: vault.id,
  rel,
  title,
  tags: [],
  props: undefined,
  excerpt: title,
  text: title,
});
const USED = [note('Reading/Cloudberries.md', 'Cloudberries'), note('Daily/2026-10-20.md', '2026-10-20')];
const REPLY = {
  say: 'Read up.',
  edit: [{ id: 'n1', text: 'Cloudberries first' }],
  confirm: 'Make a reading list',
  vaultNotes: [
    { vault: vault.name, path: 'Reading/Cloudberries.md' },
    { vault: vault.name, path: 'Daily/2026-10-20.md' },
  ],
  pages: [
    { url: 'https://example.com/planning', title: 'Planning in phases' },
    { url: 'javascript:alert(1)', title: 'Not a page' },
    { url: 'file:///etc/passwd', title: 'Not a page either' },
    { url: 'https://example.com/planning', title: 'Again' },
  ],
  next: ['Group by season', 'Find recipes', 'Add a map', 'A fourth'],
};
const SOURCES = [
  'sources: I read 2 notes from your vault | Cloudberries | 2026-10-20',
  'sources: I read 1 web page | Planning in phases · example.com',
];
const NEXT = 'row: Group by season | Find recipes | Add a map';

await l.page.evaluate(({ r, used }) => window.__fenmyr.applyMyra(r, 'q', { asked: true, used, web: true }), {
  r: REPLY,
  used: USED,
});
await settle(l.page, 600);

await check(
  'under her words: the summary, Show on board and Undo, her other buttons, what she read, then three next steps',
  async () => {
    assert.deepStrictEqual(await under(l.page, 'Read up.'), [
      'summary',
      'row: Show on board | Undo',
      'row: Make a reading list ✦ | Not now',
      ...SOURCES,
      NEXT,
    ]);
  },
);

await check('a note link opens that note in Obsidian, and a page link opens its address', async () => {
  await link(l.page, 'Cloudberries').click();
  await link(l.page, 'Planning in phases').click();
  assert.deepStrictEqual(await kept(l.page, 'opened'), [
    `obsidian://open?vault=${encodeURIComponent(vault.name)}&file=${encodeURIComponent('Reading/Cloudberries')}`,
    'https://example.com/planning',
  ]);
  assert.deepStrictEqual((await under(l.page, 'Read up.')).slice(-3), [...SOURCES, NEXT], 'and the links stay');
});

await check('pages she lists while the web was off are not shown', async () => {
  await l.page.evaluate(({ r, used }) => window.__fenmyr.applyMyra(r, 'q', { asked: true, used }), {
    r: { say: 'Offline read.', pages: REPLY.pages, vaultNotes: REPLY.vaultNotes.slice(0, 1) },
    used: USED,
  });
  await settle(l.page, 300);
  assert.deepStrictEqual(await under(l.page, 'Offline read.'), [
    'summary',
    'row: Show on board | Undo',
    'sources: I read 1 note from your vault | Cloudberries',
  ]);
});

const LONG = 'Long '.repeat(40).trim();
await check(
  'a page shows its title cut to 80 characters and then its site, the tooltip holds the whole title and address, bidi controls go, and every link is at least 24 px',
  async () => {
    await l.page.evaluate(r => window.__fenmyr.applyMyra(r, 'q', { asked: false, used: [], web: true }), {
      say: 'Long titles.',
      pages: [
        { url: 'https://example.com/long', title: LONG },
        { url: 'https://example.org/rtl', title: 'abc\u202Egpj.exe' },
        { url: 'https://пример.рф/', title: 'x' },
        { url: 'https://example.net/' },
      ],
    });
    await settle(l.page, 300);
    assert.deepStrictEqual(await under(l.page, 'Long titles.'), [
      `sources: I read 4 web pages | ${'Long '.repeat(16).slice(0, 79)}… · example.com | abc gpj.exe · example.org | x · xn--e1afmkfd.xn--p1ai | example.net`,
    ]);
    assert.strictEqual(await link(l.page, 'Long Long').getAttribute('title'), `${LONG}\nhttps://example.com/long`);
    for (const label of ['Long Long', 'gpj.exe', 'xn--', 'example.net']) {
      const box = await link(l.page, label).boundingBox();
      assert.ok(box && box.width >= 24 && box.height >= 24, `${label} link is ${box?.width}×${box?.height}`);
    }
  },
);

const LASTING = ['summary', 'row: Show on board | Undo', ...SOURCES, NEXT];
await check('closing and opening the chat keeps what she read and her next steps', async () => {
  await l.page.evaluate(() => document.getElementById('mcClose')?.click());
  await settle(l.page, 300);
  await l.page.evaluate(() => document.getElementById('mPill')?.click());
  await settle(l.page, 300);
  assert.deepStrictEqual(await under(l.page, 'Read up.'), LASTING);
});

await check('opening the board again keeps them, and they are saved in its file', async () => {
  await l.page.waitForTimeout(500);
  await l.page.evaluate(() => window.__fenmyr.openBoard('away'));
  await settle(l.page, 300);
  await l.page.evaluate(() => window.__fenmyr.openBoard('read'));
  await settle(l.page, 300);
  assert.deepStrictEqual(await under(l.page, 'Read up.'), ['summary', 'row: Show on board', ...SOURCES, NEXT]);
  const file = JSON.parse(fs.readFileSync(path.join(data, 'fenmyr', 'boards', 'read.json'), 'utf8'));
  const read = file.chat
    .find((m: { text: string }) => m.text === 'Read up.')
    .acts.find((a: { kind: string }) => a.kind === 'read');
  assert.deepStrictEqual(read, {
    kind: 'read',
    notes: [
      { vault: vault.id, rel: 'Reading/Cloudberries.md', title: 'Cloudberries' },
      { vault: vault.id, rel: 'Daily/2026-10-20.md', title: '2026-10-20' },
    ],
    pages: [{ url: 'https://example.com/planning', title: 'Planning in phases' }],
  });
});

await check(
  'after the app starts again they are still there, a note still opens, and a bad page in the file is dropped',
  async () => {
    const errors = l.errors;
    await l.close();
    assert.deepStrictEqual(errors, []);
    const file = path.join(data, 'fenmyr', 'boards', 'read.json'),
      board = JSON.parse(fs.readFileSync(file, 'utf8'));
    board.chat
      .find((m: { text: string }) => m.text === 'Read up.')
      .acts.find((a: { kind: string }) => a.kind === 'read')
      .pages.push({ url: 'javascript:alert(1)', title: 'Planted' });
    fs.writeFileSync(file, JSON.stringify(board));
    l = await start();
    assert.deepStrictEqual(await under(l.page, 'Read up.'), ['summary', 'row: Show on board', ...SOURCES, NEXT]);
    await link(l.page, '2026-10-20').click();
    assert.deepStrictEqual(await kept(l.page, 'opened'), [
      `obsidian://open?vault=${encodeURIComponent(vault.name)}&file=${encodeURIComponent('Daily/2026-10-20')}`,
    ]);
  },
);

await check('a next step sends its words as hers to answer, and the steps go once one is used', async () => {
  await l.page.locator('#mcList .m-acts button', { hasText: 'Find recipes' }).click();
  await settle(l.page, 300);
  assert.ok(
    (await kept(l.page, 'sent')).some(s => s.startsWith('Find recipes')),
    'the words are asked',
  );
  assert.deepStrictEqual(await under(l.page, 'Read up.'), ['summary', 'row: Show on board', ...SOURCES]);
});

await check('with the chat closed, a bubble with links stays up as long as one with next steps', async () => {
  await l.page.evaluate(() => document.getElementById('mcClose')?.click());
  await settle(l.page, 300);
  await l.page.evaluate(r => window.__fenmyr.applyMyra(r, 'q', { asked: false, used: [], web: true }), {
    say: 'Only pages.',
    pages: [{ url: 'https://example.com/only', title: 'Only' }],
  });
  await l.page.waitForTimeout(10_500);
  assert.ok(
    await l.page.evaluate(() => document.getElementById('mBubble')?.classList.contains('on')),
    'still up after 10 s',
  );
});

assert.deepStrictEqual(l.errors, []);
await l.close();
fs.rmSync(data, { recursive: true, force: true });
if (failed.length) {
  console.error(`REPLY SOURCES FAILED: ${failed.join('; ')}`);
  process.exit(1);
}
console.log('REPLY SOURCES OK');
