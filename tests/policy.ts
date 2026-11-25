// The app page's Content Security Policy (#233): any violation in the app's own page fails the test that caused it, and a
// prototype preview breaking the policy of its own frame does not.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch } from './support/launch.ts';

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
  console.log('POLICY OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
