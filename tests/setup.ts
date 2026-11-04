// Settings → Helpers → Git and GitHub, with real git and a stand-in gh that signs in once the test approves it.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch } from './support/launch.ts';

const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-setup-')));
const bin = path.join(work, 'bin');
fs.mkdirSync(bin);
const signedIn = '{"hosts":{"github.com":[{"state":"success","active":true,"host":"github.com","login":"ann-lee"}]}}';
fs.writeFileSync(
  path.join(bin, 'gh'),
  `#!/bin/sh
case "$*" in
  "auth status --json hosts") if [ -f ${work}/in ]; then echo '${signedIn}'; else echo '{"hosts":{}}'; fi ;;
  "auth login"*)
    echo "! One-time code (WXYZ-2345) copied to clipboard" >&2
    echo "Open this URL to continue in your web browser: https://github.com/login/device" >&2
    while [ ! -f ${work}/approve ]; do sleep 0.1; done
    touch ${work}/in ;;
  "auth setup-git"*) git config --global credential.https://github.com.helper '!gh auth git-credential' ;;
esac
`,
  { mode: 0o755 },
);

const l = await launch({ env: { PATH: `${bin}:${process.env.PATH ?? ''}`, GIT_CONFIG_NOSYSTEM: '1' } });
const opened: string[] = [];
await l.app.evaluate(({ shell }) => {
  const seen: string[] = [];
  Reflect.set(globalThis, '__opened', seen);
  shell.openExternal = async url => {
    seen.push(url);
  };
});
const { page } = l;
const text = () => page.evaluate(() => document.getElementById('gitSetup')?.innerText ?? '');
const press = async (action: string) => {
  await page.click(`#gitSetup [data-g="${action}"]`);
  await page.waitForTimeout(400);
};
const until = async (re: RegExp, what: string) => {
  const end = Date.now() + 8000;
  while (Date.now() < end) {
    if (re.test(await text())) return;
    await page.waitForTimeout(150);
  }
  assert.fail(`${what}: ${await text()}`);
};

try {
  await page.evaluate(() =>
    window.__fenmyr.applyMyra({ say: 'The button below opens it.', gitSetup: true }, 'set up git'),
  );
  await page.locator('button:visible', { hasText: 'Set up git and GitHub' }).first().click();
  await until(/Your name and email/, 'the steps show');
  assert.match(await text(), /Git\s*Installed\./, 'git is found');
  assert.match(await text(), /GitHub’s gh tool\s*Installed\./, 'gh is found');
  assert.match(await text(), /start private/, 'it says new GitHub repos start private');

  await page.fill('#gsName', 'Ann Lee');
  await page.fill('#gsEmail', 'nope');
  await press('saveName');
  assert.match(await text(), /Type an email address/, 'a bad email is explained');
  assert.strictEqual(await page.inputValue('#gsName'), 'Ann Lee', 'what was typed is kept');
  await page.fill('#gsEmail', 'ann@example.com');
  await press('saveName');
  await until(/Ann Lee · ann@example\.com/, 'the name and email are saved');
  const global = execFileSync('git', ['config', '--file', path.join(l.data, '.gitconfig'), 'user.email']).toString();
  assert.strictEqual(global.trim(), 'ann@example.com', 'saved for every repo on this computer');

  assert.doesNotMatch(await text(), /Set it up/, 'git can only use a sign-in once there is one');
  await press('signIn');
  await until(/WXYZ-2345/, 'GitHub’s one-time code shows');
  await press('openGitHub');
  opened.push(...(await l.app.evaluate(() => [...(Reflect.get(globalThis, '__opened') ?? [])].map(String))));
  assert.deepStrictEqual(opened, ['https://github.com/login/device'], 'GitHub’s device page opens');
  fs.writeFileSync(path.join(work, 'approve'), '');
  await until(/ann-lee in use/, 'the account shows once GitHub approves');
  assert.doesNotMatch(await text(), /WXYZ-2345/, 'the code goes away');

  await press('setupGit');
  await until(/Pushes to GitHub use your sign-in/, 'git uses the sign-in');
  fs.rmSync(path.join(work, 'approve'));
  await press('signIn');
  await until(/WXYZ-2345/, 'adding another account shows a new code');
  await press('cancelSignIn');
  await page.waitForTimeout(800);
  assert.doesNotMatch(await text(), /WXYZ-2345/, 'cancelling takes the code away');
  const said = await page.evaluate(() => document.querySelector('#gitSetup .rl-problem')?.textContent ?? '');
  assert.strictEqual(said, '', 'and shows no error when gh stops');
  assert.deepStrictEqual(l.errors, []);
  console.log('SETUP OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
