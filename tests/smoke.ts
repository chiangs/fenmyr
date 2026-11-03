// End-to-end smoke test: opens the real app (headless) with a throwaway data folder, and drives the bridge.
//   node tests/smoke.ts
//   FENMYR_APP=~/.local/lib/fenmyr/app node tests/smoke.ts   (an installed copy, with the Electron install.sh chose)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright';
import { animations } from './smoke/animations.ts';
import { birthday } from './smoke/birthday.ts';
import { board, noteTags } from './smoke/board.ts';
import { bridge } from './smoke/bridge.ts';
import { boardOrder, clearButtons, cursorEdge, heightGrips, popups, shortcutLabels } from './smoke/chrome.ts';
import { installPageKit, makeSmoke } from './smoke/kit.ts';
import { library } from './smoke/library.ts';
import { collectionCount, look } from './smoke/look.ts';
import { myra } from './smoke/myra.ts';
import { panels } from './smoke/panels.ts';
import { pictures } from './smoke/pictures.ts';
import { reminders } from './smoke/reminders.ts';
import { commandsInPrompt, slash } from './smoke/slash.ts';
import { timers } from './smoke/timers.ts';
import { HEADLESS, MOUSE } from './support/launch.ts';

(async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-smoke-')),
    out = path.join(data, 'out');
  fs.mkdirSync(out);
  // stand-ins for Claude Code and whisper.cpp, found where the real ones usually live (~/.local/bin)
  const bin = path.join(data, '.local/bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(
    path.join(bin, 'claude'),
    `#!/bin/sh
if [ "$1" = mcp ]; then echo "claude.ai Mobbin: https://mobbin - ✓ Connected"; echo "claude.ai higgsfield: https://h - ! Needs authentication"; exit 0; fi
printf '%s' "$2" > "${data}/prompt.txt"; echo "$@" > "${data}/args.txt"
echo '{"type":"result","is_error":false,"result":"{\\"say\\": \\"hi from fake claude\\"}","usage":{"input_tokens":10,"cache_read_input_tokens":5,"output_tokens":3},"total_cost_usd":0.01}'
`,
    { mode: 0o755 },
  );
  fs.writeFileSync(
    path.join(bin, 'whisper-cli'),
    `#!/bin/sh
for a; do case "$a" in *.wav) head -c 4 "$a" > "${data}/wav-magic.txt";; esac; done
echo " [BLANK_AUDIO] hello from whisper"
`,
    { mode: 0o755 },
  );
  fs.writeFileSync(path.join(data, 'model.bin'), 'x');
  const dir = process.env.FENMYR_APP || path.join(import.meta.dirname, '..');
  // an installed copy says which Electron it runs on
  const installed: unknown = process.env.FENMYR_APP
      ? JSON.parse(fs.readFileSync(path.join(dir, 'install.json'), 'utf8'))
      : {},
    electronPath =
      installed && typeof installed === 'object' && 'electron' in installed && typeof installed.electron === 'string'
        ? installed.electron
        : undefined;
  const app = await electron.launch({
    ...(electronPath ? { executablePath: electronPath } : {}),
    args: [dir, '--no-sandbox', ...HEADLESS, MOUSE],
    env: { ...process.env, XDG_DATA_HOME: data, HOME: data, FENMYR_WHISPER_MODEL: path.join(data, 'model.bin') },
  });
  // save dialogs answer themselves: everything lands in out/
  await app.evaluate(({ dialog }, out) => {
    dialog.showSaveDialog = async (...a: unknown[]) => {
      const o = a.find(x => !!x && typeof x === 'object' && 'defaultPath' in x),
        name = o && typeof o === 'object' && 'defaultPath' in o ? String(o.defaultPath).split('/').pop() : 'file';
      return { canceled: false, filePath: `${out}/${name}` };
    };
  }, out);
  const page = await app.firstWindow(),
    errors: string[] = [];
  await page.exposeFunction('__readArgs', () => fs.readFileSync(path.join(data, 'args.txt'), 'utf8'));
  page.on('pageerror', e => errors.push(e.message));
  page.on(
    'console',
    m =>
      m.type() === 'error' && !/fonts\.(googleapis|gstatic)\.com/.test(m.location().url || '') && errors.push(m.text()),
  ); // Google Fonts can't be reached from every test machine
  await page.waitForFunction(() => window.Fenmyr && document.querySelector('#side'));
  await page.waitForTimeout(2000);
  await page.addInitScript(installPageKit);
  await page.evaluate(installPageKit);
  const t = makeSmoke({ app, page, data, out, errors });
  await bridge(t);
  await look(t);
  await collectionCount(t);
  await library(t);
  await board(t);
  await panels(t);
  await page.evaluate(() => window.__fenmyr.dizzyAuto(false)); // opening and closing the chat over and over makes her dizzy, which would land in the middle of other checks; it is switched back on for its own check below
  await slash(t);
  await pictures(t);
  await shortcutLabels(t);
  await timers(t);
  await animations(t);
  await reminders(t);
  await boardOrder(t);
  await popups(t);
  await cursorEdge(t);
  await noteTags(t);
  await clearButtons(t);
  await heightGrips(t);
  await myra(t);
  await birthday(t);
  await commandsInPrompt(t);
  console.log(JSON.stringify({ ...t.results, errors, failed: t.failures }, null, 1));
  await app.close();
  const ok = !errors.length && !t.failures.length;
  if (process.env.KEEP) console.log('output in', out);
  else fs.rmSync(data, { recursive: true, force: true });
  // on GitHub, a failure also becomes an annotation with the results, since the job log isn't always at hand
  if (!ok && process.env.GITHUB_ACTIONS) {
    const brief = { failed: t.failures, errors, ...t.results };
    console.log(
      '::error title=Smoke test failed::' +
        JSON.stringify(brief, (_k, v) => (typeof v === 'string' && v.length > 160 ? `${v.slice(0, 60)}…` : v))
          .replace(/%/g, '%25')
          .replace(/\n/g, ' ')
          .slice(0, 6000),
    );
  }
  if (t.failures.length) console.log('failed checks:', t.failures.join(', '));
  console.log(ok ? 'SMOKE OK' : 'SMOKE FAILED');
  process.exit(ok ? 0 : 1);
})().catch(e => {
  console.error(e);
  if (process.env.GITHUB_ACTIONS)
    console.log(
      '::error title=Smoke test crashed::' +
        String((e instanceof Error && e.stack) || e)
          .replace(/%/g, '%25')
          .replace(/\n/g, '%0A')
          .slice(0, 4000),
    );
  process.exit(1);
});
