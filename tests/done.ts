// The done test from the Rapid Prototyping plan, start to finish as a person goes: link a project to a new repo,
// make a prototype in its prototyping folder, select a card and ask Myra to build the flow, see it run, point at an
// element to change it, commit and push, then close Fenmyr, open it again and find the prototype and its chat as they
// were. A picture of each stage goes to DONE_OUT (or a temporary folder, named at the end).
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { type Launched, launch } from './support/launch.ts';

const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-done-')));
const repo = path.join(work, 'acme'),
  github = path.join(work, 'github.git'),
  bin = path.join(work, 'bin'),
  data = path.join(work, 'data'),
  out = process.env.DONE_OUT ?? path.join(work, 'stages');
for (const d of [repo, bin, data, out]) fs.mkdirSync(d, { recursive: true });
execFileSync('git', ['init', '-q', '--bare', '-b', 'main', github]);

// Stand-ins for Claude Code. Asked as Myra, it hands the request to the builder. Run as the builder, it writes the
// screen: "Pay now" once the person has pointed at the heading and asked for it, "Checkout" before that.
fs.writeFileSync(
  path.join(bin, 'claude'),
  `#!/bin/sh
case "$*" in
  *stream-json*)
    case "$2" in
      *Pay\\ now*) title='Pay now' ;;
      *) title='Checkout' ;;
    esac
    printf '%s\\n' "export function App() { const title = '$title'; return <main><h1>{title}</h1></main>; }" > src/App.tsx
    printf '%s\\n' '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Write","input":{"file_path":"'"$PWD"'/src/App.tsx"}}]}}'
    printf '%s\\n' '{"type":"result","is_error":false,"result":"I built the checkout from your note.\\nCARDS: src/App.tsx=n1"}' ;;
  *)
    case "$2" in
      *Pay\\ now*) req='Change the heading to Pay now' ;;
      *) req='Build the checkout screen from the selected note' ;;
    esac
    printf '%s\\n' '{"type":"result","is_error":false,"result":"{\\"say\\": \\"Writing it now.\\", \\"build\\": {\\"request\\": \\"'"$req"'\\"}}"}' ;;
esac
`,
  { mode: 0o755 },
);
const env = { PATH: `${bin}:${process.env.PATH ?? ''}` };

let l: Launched = await launch({ data, env });
let page = l.page;
let stage = 0;
const shot = async (name: string) => {
  stage++;
  await page.screenshot({ path: path.join(out, `${String(stage).padStart(2, '0')}-${name}.png`) });
};
const until = async (check: () => Promise<boolean>, what: string) => {
  const end = Date.now() + 30000;
  while (Date.now() < end) {
    if (await check().catch(() => false)) return;
    await page.waitForTimeout(250);
  }
  assert.fail(what);
};
const myra = () =>
  page.evaluate(() => [...document.querySelectorAll('#mcList .mc-msg.myra')].map(m => m.textContent ?? '').join(' | '));
// the chat's words, without the buttons under them, which last only as long as the window
const said = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('#mcList .mc-msg')]
      .map(m =>
        [...m.childNodes]
          .filter(n => n.nodeType === Node.TEXT_NODE)
          .map(n => n.textContent)
          .join(''),
      )
      .join(' | '),
  );
const frame = () => page.frameLocator('#pr-preview iframe');
const heading = () =>
  frame()
    .locator('h1')
    .textContent({ timeout: 1000 })
    .catch(() => '');
const press = async (action: string) => {
  await page.click(`.rl-body [data-a="${action}"]`);
  await page.waitForFunction(
    () => !document.querySelector('.rl-body') || !!document.querySelector('.rl-body button:not([disabled])'),
  );
};
const ask = async (words: string) => {
  await page.fill('#mcInput', words);
  await page.press('#mcInput', 'Enter');
};
const git = (...a: string[]) =>
  execFileSync('git', ['-C', repo, ...a])
    .toString()
    .trim();

try {
  await l.app.evaluate(({ dialog }, dir) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
  }, repo);
  await page.evaluate(async () => {
    await window.Fenmyr.saveFolders({ projects: [{ id: 'p1', name: 'Acme', open: true }], folders: [], order: {} });
    await window.__fenmyr.refreshBoards();
  });

  // link the project to a new repo, saying who commits
  await page.evaluate(() => {
    const head = [...document.querySelectorAll('#boards .node.project .node-head')].find(h =>
      h.textContent?.includes('Acme'),
    );
    head?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200 }));
  });
  await page.click('#rowMenu [data-m="repo"]');
  await press('pick');
  await press('init');
  await page.fill('#rlName', 'Ann Lee');
  await page.fill('#rlEmail', 'ann@example.com');
  await press('identity');
  await page.waitForFunction(() => /Branch/.test(document.querySelector('.rl-body')?.textContent ?? ''));
  await shot('linked');
  await press('done');
  assert.ok(fs.existsSync(path.join(repo, '.git')), 'the folder is a repo');

  // a prototype in the prototyping folder linking made, through + Board
  const folder = JSON.parse(fs.readFileSync(path.join(data, 'fenmyr', 'folders.json'), 'utf8')).folders[0];
  assert.strictEqual(folder?.kind, 'prototyping', 'linking made a prototyping folder');
  await page.evaluate(id => window.__fenmyr.openHome(`folder:${id}`), folder.id);
  await page.click('#newBoard');
  await page.fill('#npName', 'Checkout');
  await page.click('#npOk');
  await until(async () => (await page.evaluate(() => window.__fenmyr.curBoard()?.kind)) === 'prototype', 'it opens');
  await until(async () => (await heading()) === 'Checkout', 'its starter runs');
  assert.ok(
    !(await page.evaluate(() => document.getElementById('home')?.classList.contains('on'))),
    'and the folder’s home closes for it',
  );
  await shot('new-prototype');

  // a note on the board, selected, and Myra asked to build the flow
  await page.evaluate(() => {
    const H = window.__fenmyr;
    H.board.cards.push({
      id: 'n1',
      type: 'note',
      x: 600,
      y: 200,
      w: 220,
      h: 120,
      text: 'Checkout: show the total first',
    });
    H.renderAll();
    H.selectOnly(['n1']);
  });
  await ask('Build this flow');
  await until(async () => /I built the checkout from your note/.test(await myra()), 'Myra builds it');
  await until(async () => (await heading()) === 'Checkout', 'and it runs in the preview');
  await shot('built');

  // point at the heading and ask for a change
  await page.click('[data-pv="point"]');
  await frame().locator('h1').click();
  await until(async () => /\[this: .*h1.*“Checkout”/.test(await page.inputValue('#mcInput')), 'pointing names it');
  await shot('pointed');
  await page.fill('#mcInput', `${await page.inputValue('#mcInput')} make it say Pay now`);
  await page.press('#mcInput', 'Enter');
  await until(async () => (await heading()) === 'Pay now', 'the change runs');
  await shot('changed');

  // commit, then push to GitHub's stand-in
  git('remote', 'add', 'origin', github);
  await page.click('#prGit [data-git="commit"]');
  await until(
    async () => /Commit \d+ changed files? in acme\/prototypes\/checkout/.test(await myra()),
    'Myra asks first',
  );
  await page
    .locator('#mcList .m-acts button', { hasText: /^Commit$/ })
    .last()
    .click();
  await until(async () => /Committed\./.test(await myra()), 'the commit is made');

  await page.click('#prGit [data-git="push"]');
  await until(async () => /Push main of acme to /.test(await myra()), 'Myra asks before pushing');
  await page.locator('#mcList .m-acts button.danger', { hasText: 'Push main to' }).last().click();
  await until(async () => /Pushed\./.test(await myra()), 'the push is made');

  assert.match(
    execFileSync('git', ['-C', github, 'show', 'main:prototypes/checkout/src/App.tsx']).toString(),
    /Pay now/,
    'GitHub’s stand-in has the change',
  );
  await shot('pushed');
  assert.deepStrictEqual(l.errors, []);

  // close Fenmyr and open it again
  // a board saves a moment after its last change
  await page.waitForTimeout(1000);
  const chatBefore = await said();
  await l.app.close();
  l = await launch({ data, env });
  page = l.page;
  await until(async () => (await page.evaluate(() => window.__fenmyr.curBoard()?.name)) === 'Checkout', 'it reopens');
  await until(async () => (await heading()) === 'Pay now', 'the prototype runs as it was left');
  assert.strictEqual(await said(), chatBefore, 'and its chat is all there');
  assert.match(
    await page.evaluate(() => document.getElementById('prGit')?.textContent ?? ''),
    /GitHub has every commit/,
    'with everything on GitHub',
  );
  await shot('reopened');
  assert.deepStrictEqual(l.errors, []);
  console.log(`DONE OK, stages in ${out}`);
} finally {
  await l.app.close().catch(() => {});
  if (!process.env.DONE_OUT) fs.rmSync(work, { recursive: true, force: true });
}
