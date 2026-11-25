// The app page's Content Security Policy (#233): any violation in the app's own page fails the test that caused it, and a
// prototype preview breaking the policy of its own frame does not.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Page } from 'playwright';
import { everyOfflineCard } from './fixtures/boards.ts';
import { launch } from './support/launch.ts';

// A voice memo is stored as a data: URL and played from one, so media-src must allow it. It is silent and tiny: a 44-byte
// header, then the samples.
function silentWav(samples: number) {
  const bytes = samples * 2,
    head = Buffer.alloc(44);
  head.write('RIFF', 0);
  head.writeUInt32LE(36 + bytes, 4);
  head.write('WAVEfmt ', 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(8000, 24);
  head.writeUInt32LE(16000, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36);
  head.writeUInt32LE(bytes, 40);
  return `data:audio/wav;base64,${Buffer.concat([head, Buffer.alloc(bytes)]).toString('base64')}`;
}

// Markup that would run a script if it reached the page as HTML: the image can't load, and its error handler sets a
// number a test can read. The number says which route let it through.
const inject = (n: number) => `<img src=x onerror="window.__pwned=${n}">`;
const pwned = (p: Page) => p.evaluate(() => Reflect.get(window, '__pwned'));

const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-policy-')));
const repo = path.join(work, 'acme');
fs.mkdirSync(repo);
execFileSync('git', ['-C', repo, 'init', '-q', '-b', 'main']);

const l = await launch();
const { page } = l;
// read through a call: an assertion that errors is [] would otherwise narrow it to never[] for the rest of the file
const errors = (): string[] => l.errors;
// The launcher's listener was added first, so it has run by the time one of these resolves.
const policyMessage = (from: 'app' | 'preview') =>
  page.waitForEvent(
    'console',
    m =>
      m.text().includes('Content Security Policy') &&
      m.location().url.startsWith('fenmyrpreview:') === (from === 'preview'),
  );

try {
  assert.deepStrictEqual(errors(), [], 'the app starts with no policy violations');

  // a prototype whose script reaches past its own policy: connect-src allows https only
  const seen = policyMessage('preview');
  const plain = await page.evaluate(async repo => {
    await window.Fenmyr.saveFolders({
      projects: [{ id: 'p1', name: 'Acme', open: true, repo: { path: repo } }],
      folders: [{ id: 'pf', name: 'Prototypes', project: 'p1', kind: 'prototyping', open: true }],
      order: {},
    });
    const proto = await window.Fenmyr.protoCreate({ root: repo, name: 'Landing', stack: 'html' });
    await window.Fenmyr.save({
      id: 'hb',
      name: 'Landing',
      folder: 'pf',
      kind: 'prototype',
      proto,
      cards: [],
      links: [],
      tray: [],
    });
    return proto.dir;
  }, repo);
  fs.writeFileSync(path.join(repo, plain, 'script.js'), "fetch('file:///etc/hostname').catch(() => {});");
  await page.evaluate(async () => {
    await window.__fenmyr.refreshBoards();
    await window.__fenmyr.openBoard('hb');
  });
  assert.match((await seen).location().url, /^fenmyrpreview:\/\//, 'the preview broke its own policy');
  assert.deepStrictEqual(errors(), [], 'a preview breaking its own policy is not the app page’s violation');

  // the app page breaking a policy it was given
  const reported = policyMessage('app');
  await page.evaluate(() => {
    const meta = document.createElement('meta');
    meta.httpEquiv = 'Content-Security-Policy';
    meta.content = "img-src 'none'";
    document.head.append(meta);
    const img = document.createElement('img');
    img.src = 'https://example.com/a.png';
    document.body.append(img);
  });
  await reported;
  assert.ok(
    errors().some(e => e.includes('Content Security Policy')),
    `a violation in the app page is collected: ${JSON.stringify(errors())}`,
  );

  // a voice memo plays: its data: URL is allowed as media
  const card = everyOfflineCard().cards.find(c => c.type === 'audio');
  assert.ok(card, 'the fixture has an audio card');
  const memo = await launch({
    boards: [
      {
        id: 'memo',
        name: 'Memo',
        cards: [{ ...card, x: 0, y: 0, src: silentWav(800), dur: 0.1 }],
        links: [],
        tray: [],
        view: { x: 160, y: 140, z: 1 },
      },
    ],
    open: 'memo',
  });
  try {
    // The player is private to the app, so watch the element it makes: `playing` fires only once sound is being played.
    const seen = await memo.page.evaluateHandle(() => {
      const out = { playing: 0, failed: '' },
        play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        this.addEventListener('playing', () => {
          out.playing++;
        });
        this.addEventListener('error', () => {
          out.failed = this.error?.message || 'error';
        });
        return play.call(this);
      };
      return out;
    });
    await memo.page.click('[data-id="audio"] .au-play');
    await memo.page.waitForFunction(o => o.playing > 0 || o.failed, seen);
    assert.deepStrictEqual(await seen.jsonValue(), { playing: 1, failed: '' }, 'the voice memo starts playing');
    assert.deepStrictEqual(memo.errors, [], 'playing a voice memo breaks no policy');
  } finally {
    await memo.close();
  }

  // a board with every offline card type opens under the policy and breaks none of it
  const every = everyOfflineCard();
  const all = await launch({ boards: [every], open: every.id });
  try {
    const drawn = await all.page.evaluate(() => document.querySelectorAll('#cards .card').length);
    assert.strictEqual(drawn, every.cards.length, 'every card of the board is drawn');
    assert.deepStrictEqual(all.errors, [], 'a board with every offline card type breaks no policy');
  } finally {
    await all.close();
  }

  // Text that reaches the page as markup runs no script. First through the paths of the app itself, which escape it, so it
  // shows as the words it is.
  const words = inject(1);
  const hostile = everyOfflineCard();
  const named: Record<string, Record<string, unknown>> = {
    note: { name: words, text: words, tags: [words], tagText: words },
    myranote: { name: words, text: words },
    todo: { text: words, items: [{ t: words, done: false }] },
    swatch: { label: words },
    text: { text: words },
    title: { text: words },
    doc: { text: words },
    canvas: { text: words },
    shape: { text: words },
    font: { text: words },
    link: { url: 'https://example.com/page', title: words, desc: words },
    audio: { title: words, text: words },
    vnote: { title: words },
    coll: { text: words },
    kanban: { text: words, colNames: [words, 'Doing', 'Done'] },
    frame: { name: words },
    section: { text: words },
    box: { img: words },
  };
  hostile.cards = hostile.cards.map(c => ({ ...c, ...named[c.id] }));
  hostile.name = words;
  const unsorted = [1, 2].map(n => ({
    id: `t${n}`,
    type: 'note',
    x: 0,
    y: 0,
    w: 220,
    h: 140,
    r: 0,
    color: 'white',
    text: words,
  }));
  hostile.tray = unsorted;
  const attack = await launch({ boards: [hostile], open: hostile.id, claude: true });
  try {
    const shown = await attack.page.evaluate(
      ({ ids, words }) =>
        ids.filter(id => !document.querySelector(`#cards [data-id="${id}"]`)?.textContent?.includes(words)),
      { ids: Object.keys(named), words },
    );
    assert.deepStrictEqual(shown, [], 'every card shows the markup as words');
    assert.strictEqual(
      await attack.page.evaluate(() => document.querySelectorAll('#trayList .tray-item').length),
      unsorted.length,
      'the tray is drawn',
    );
    assert.ok(
      await attack.page.evaluate(
        words => [...document.querySelectorAll('#trayList .tray-item')].every(i => i.textContent === words),
        words,
      ),
      'and shows it as words',
    );

    // and through a reply from Myra
    const said = inject(2),
      added = inject(3);
    await attack.page.click('#mPill');
    await attack.page.evaluate(
      ({ say, text }) => window.__fenmyr.applyMyra({ say, add: [{ type: 'note', text }] }, 'q'),
      { say: said, text: added },
    );
    await attack.page.waitForFunction(
      said => [...document.querySelectorAll('#mcList .mc-msg')].some(m => m.textContent?.includes(said)),
      said,
    );
    assert.ok(
      await attack.page.evaluate(
        ({ said, added }) =>
          [...document.querySelectorAll('#mcList .mc-msg')].some(m => m.firstChild?.textContent === said) &&
          [...document.querySelectorAll('#cards .card .text')].some(t => t.textContent === added),
        { said, added },
      ),
      'her line and her note show as words',
    );
    assert.strictEqual(
      await attack.page.evaluate(() => document.querySelectorAll('img[src="x"], [onerror]').length),
      0,
      'none of it became an element',
    );
    assert.strictEqual(await pwned(attack.page), undefined, 'no script ran');
  } finally {
    await attack.close();
  }

  // Then through a stray innerHTML, the bug the policy is the last line against: there the handler does get into the page,
  // and only the policy stops it.
  const stray = await launch({ boards: [everyOfflineCard()], open: 'every' });
  try {
    // Chromium words it "Executing inline event handler violates the following Content Security Policy directive 'script-src …'"
    const refused = stray.page.waitForEvent(
      'console',
      m => /inline event handler/.test(m.text()) && m.text().includes('Content Security Policy'),
    );
    // so a policy that lets the handler run fails on the check below, not when this wait ends with the page
    refused.catch(() => {});
    const ran = await stray.page.evaluate(
      () =>
        new Promise(done => {
          document.body.insertAdjacentHTML('beforeend', '<img src=x onerror="window.__pwned=4">');
          // the image's own handler is attached first, so by the time this listener runs it has run or been refused
          document.body.lastElementChild?.addEventListener('error', () => done(Reflect.get(window, '__pwned')));
        }),
    );
    assert.strictEqual(ran, undefined, `the injected handler ran: it set __pwned to ${JSON.stringify(ran)}`);
    await refused;
    assert.ok(
      stray.errors.some(e => e.includes('Content Security Policy') && e.includes('script-src')),
      `the refusal is collected as a script-src violation: ${JSON.stringify(stray.errors)}`,
    );
    assert.strictEqual(await pwned(stray.page), undefined, 'and still no script has run');
  } finally {
    await stray.close();
  }
  console.log('POLICY OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
