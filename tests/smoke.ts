// @ts-nocheck
// End-to-end smoke test: opens the real app (headless) with a throwaway data folder, and drives the bridge.
//   node tests/smoke.ts
//   FENMYR_APP=~/.local/lib/fenmyr/app node tests/smoke.ts   (an installed copy, with the Electron install.sh chose)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright';
import { animations } from './smoke/animations.ts';
import { board, noteTags } from './smoke/board.ts';
import { bridge } from './smoke/bridge.ts';
import { boardOrder, clearButtons, cursorEdge, heightGrips, popups, shortcutLabels } from './smoke/chrome.ts';
import { installPageKit, makeSmoke } from './smoke/kit.ts';
import { library } from './smoke/library.ts';
import { look } from './smoke/look.ts';
import { myra } from './smoke/myra.ts';
import { panels } from './smoke/panels.ts';
import { pictures } from './smoke/pictures.ts';
import { reminders } from './smoke/reminders.ts';
import { slash } from './smoke/slash.ts';
import { timers } from './smoke/timers.ts';
import { HEADLESS } from './support/launch.ts';

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
  const installed = process.env.FENMYR_APP ? JSON.parse(fs.readFileSync(path.join(dir, 'install.json'), 'utf8')) : {};
  const app = await electron.launch({
    ...(installed.electron ? { executablePath: installed.electron } : {}),
    args: [dir, '--no-sandbox', ...HEADLESS],
    env: { ...process.env, XDG_DATA_HOME: data, HOME: data, FENMYR_WHISPER_MODEL: path.join(data, 'model.bin') },
  });
  // save dialogs answer themselves: everything lands in out/
  await app.evaluate(({ dialog }, out) => {
    dialog.showSaveDialog = async (_w, o) => ({
      canceled: false,
      filePath: `${out}/${o.defaultPath.split('/').pop()}`,
    });
  }, out);
  const page = await app.firstWindow(),
    errors = [];
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
  const t = makeSmoke({ app, page, data, out, errors }),
    r = {};
  await bridge(t);
  await look(t);
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
  // birthday: set in Settings, celebrated once when you are really there, belated within 14 days, hat all day, and /birthday for demos
  {
    const set = async (m, d) =>
      page.evaluate(
        ([m, d]) => {
          for (const [id, v] of [
            ['setBdMonth', m],
            ['setBdDay', d],
          ]) {
            const el = document.getElementById(id);
            el.value = v;
            el.dispatchEvent(new Event('change'));
          }
        },
        [m, d],
      );
    const due = async iso =>
      page.evaluate(iso => {
        window.__bdNow = new Date(iso).getTime();
        const x = window.__fenmyr.birthdayDue();
        return x ? x.kind + (x.days ? `:${x.days}` : '') : '';
      }, iso);
    const chatText = () =>
      page.evaluate(() => [...document.querySelectorAll('#mcList .mc-msg.myra')].map(m => m.textContent).join(' || '));
    await page.evaluate(() => {
      localStorage.removeItem('fenmyr:birthday');
      window.__fenmyr.dizzyAuto(false);
      document.getElementById('myra').classList.remove('chat');
    });
    await set('3', '14');
    const saved = await page.evaluate(() => window.__fenmyr.bdSetting());
    await set('', '');
    await page.evaluate(() => document.getElementById('setBdClear').click());
    const cleared = await page.evaluate(() => window.__fenmyr.bdSetting());
    await set('3', '14');
    const d1 = [
      await due('2027-03-14T12:00:00'),
      await due('2027-03-13T12:00:00'),
      await due('2027-03-17T12:00:00'),
      await due('2027-03-28T12:00:00'),
      await due('2027-03-29T12:00:00'),
    ];
    await page.evaluate(() => {
      window.__bdNow = new Date('2026-01-01T09:00:00').getTime();
      localStorage.removeItem('fenmyr:birthday');
    });
    await set('2', '29');
    const feb = [await due('2027-02-28T12:00:00'), await due('2028-02-29T12:00:00'), await due('2027-03-01T12:00:00')];
    await page.evaluate(() => {
      window.__bdNow = new Date('2027-02-12T12:00:00').getTime();
    });
    await set('2', '10');
    const lateSet = await due('2027-02-12T12:00:00'); // set after the day: no belated wish for it
    await page.evaluate(() => {
      localStorage.removeItem('fenmyr:birthday');
    });
    await set('', '');
    await page.evaluate(() => {
      window.__bdNow = new Date('2026-01-01T09:00:00').getTime();
    });
    await set('3', '14');
    // on the day, only when really there
    await page.evaluate(() => {
      window.__bdNow = new Date('2027-03-14T12:00:00').getTime();
      window.__birthdayLineStub = due =>
        Promise.resolve(
          due.kind === 'belated'
            ? { say: 'Stub belated wish', card: 'Stub belated card' }
            : { say: 'Stub wishes you well', card: 'Stub card for the day' },
        );
      window.__bdFocus = false;
    });
    const away = await page.evaluate(() => {
      window.__fenmyr.bdActive(500);
      return window.__fenmyr.birthdayCheck(false);
    });
    const idle = await page.evaluate(() => {
      window.__bdFocus = true;
      window.__fenmyr.bdActive(120000);
      return window.__fenmyr.birthdayCheck(false);
    });
    const typing = await page.evaluate(() => {
      window.__fenmyr.bdActive(500, 1000);
      return window.__fenmyr.birthdayCheck(false);
    }); // typed a second ago: she waits
    const notes0 = await page.evaluate(
      () => window.__fenmyr.board.cards.filter(c => c.type === 'note' && /Happy birthday/.test(c.name || '')).length,
    );
    const went = await page.evaluate(() => {
      window.__fenmyr.bdActive(500);
      return window.__fenmyr.birthdayCheck(false);
    });
    await page.waitForTimeout(3200);
    const noteInfo = await page.evaluate(() => {
      const n = window.__fenmyr.board.cards.filter(c => c.type === 'note' && /Happy birthday/.test(c.name || '')).pop();
      return n && { text: n.text, img: n.myraImg, mv: n.myraMv };
    });
    const day = await page.evaluate(() => ({
        hat: window.__fenmyr.hatOn(),
        last: window.__fenmyr.bdState().last,
        notes: window.__fenmyr.board.cards.filter(c => c.type === 'note' && /Happy birthday/.test(c.name || '')).length,
        again: window.__fenmyr.birthdayCheck(true),
        facts: JSON.stringify(window.__fenmyr.birthdayFacts()),
      })),
      text1 = await chatText();
    await page.evaluate(() => {
      window.__fenmyr.stopAnim();
      if (window.__fenmyr.perched()) document.getElementById('mPill').click();
    });
    await page.waitForTimeout(900);
    // missed it: the next time you are there, a belated wish (a different year's state)
    await page.evaluate(() => {
      localStorage.setItem('fenmyr:birthday', JSON.stringify({ setAt: '2026-01-01' }));
      window.__bdNow = new Date('2027-03-17T12:00:00').getTime();
      window.__fenmyr.bdActive(500);
      window.__bdFocus = true;
      window.__fenmyr.birthdayCheck(false);
    });
    await page.waitForTimeout(3200);
    const text2 = await chatText();
    // the demo command stores nothing
    await page.evaluate(() => {
      window.__fenmyr.stopAnim();
      if (window.__fenmyr.perched()) document.getElementById('mPill').click();
      localStorage.setItem('fenmyr:birthday', JSON.stringify({ setAt: '2026-01-01', last: 2027 }));
    });
    await page.waitForTimeout(900);
    await page.evaluate(() => {
      document.getElementById('myra').classList.add('chat');
      window.__fenmyr.birthdayCheck(false);
    });
    await page.waitForTimeout(300);
    const hatBefore = await page.evaluate(() => window.__fenmyr.hatOn()),
      msgs0 = (await chatText()).split(' || ').length;
    await page.fill('#mcInput', '/birthday');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3200);
    const demo = await page.evaluate(() => ({ stored: window.__fenmyr.bdState().hat, hat: window.__fenmyr.hatOn() })),
      msgs1 = (await chatText()).split(' || ').length;
    await page.evaluate(() => {
      document.getElementById('myra').classList.remove('chat');
      window.__bdNow = null;
      window.__birthdayLineStub = null;
      window.__bdFocus = null;
      localStorage.removeItem('fenmyr:birthday');
      document.getElementById('setBdClear').click();
      window.__fenmyr.birthdayCheck(false);
      window.__fenmyr.dizzyAuto(true);
    });
    // with no model line (thinking off): the written pool, a different card each time, with the party stamp
    await page.evaluate(() => {
      localStorage.setItem('fenmyr:birthday', JSON.stringify({ setAt: '2026-01-01', last: 2027 }));
      window.__birthdayLineStub = () => Promise.resolve(null);
    });
    const pool = await page.evaluate(async () => {
      const M = window.__fenmyr,
        texts = [];
      for (let i = 0; i < 8; i++) {
        await M.celebrateBirthday({ kind: 'today', year: 2027, days: 0, date: new Date() }, true);
        texts.push(M.board.cards.filter(c => c.type === 'note' && /Happy birthday/.test(c.name || '')).pop().text);
      }
      return texts;
    });
    await page.evaluate(() => {
      window.__birthdayLineStub = null;
    });
    r.birthdayCard = {
      aiWords:
        !!noteInfo &&
        noteInfo.text === 'Stub card for the day' &&
        !/keep (this|it)|delete (this|it)/i.test(noteInfo.text),
      partyStamp: !!noteInfo && noteInfo.img === 'stamps/myra-party.png' && noteInfo.mv === 'spin',
      poolVaries:
        new Set(pool).size >= 4 &&
        pool.every((t, i) => i === 0 || t !== pool[i - 1]) &&
        pool.every(t => !/keep|delete|\{n\}/i.test(t)),
    };
    r.birthday = {
      saves: saved === '03-14',
      clears: cleared === '',
      due: d1.join('|') === 'today||belated:3|belated:14|',
      leapDay: feb.join('|') === 'today|today|belated:1',
      lateSetNoBelated: lateSet === '',
      waitsWhenAway: away === false && idle === false && typing === false,
      celebrates: went === true && day.hat && day.last === 2027 && day.notes === notes0 + 1 && day.again === false,
      wishesWell: /Stub wishes you well/.test(text1),
      askedFacts: day.facts === '{"birthday":"March 14","birthdayToday":true}',
      belated: /belated/i.test(text2),
      demoStoresNothing: demo.stored === undefined && !hatBefore && demo.hat === true && msgs1 === msgs0 + 1,
    };
  }
  r.errors = errors;
  console.log(JSON.stringify({ ...t.results, ...r, failed: t.failures }, null, 1));
  // every slash command is in Myra's instructions (the app hands over its own list), so a new command is known to her without editing a prompt file
  {
    const names = await page.evaluate(() => window.__fenmyr.slashNames());
    await page.evaluate(() => document.getElementById('myra').classList.add('chat'));
    await page.fill('#mcInput', 'what can you do?');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
    const pr = fs.readFileSync(path.join(data, 'prompt.txt'), 'utf8');
    await page.evaluate(() => {
      document.getElementById('myra').classList.remove('chat');
      document.getElementById('mcInput').blur();
    });
    r.cmdsInPrompt = {
      all: names.length >= 8 && names.every(n => pr.includes(`/${n}`)),
      section: pr.includes('SLASH COMMANDS:'),
      examples: pr.includes('/timer 2m10s tea') && pr.includes('[hop, wiggle'),
      notBoardData: !pr.includes('"commands"'),
    };
  }
  r.errors = errors;
  console.log(JSON.stringify({ ...t.results, ...r, failed: t.failures }, null, 1));
  await app.close();
  const ok =
    Object.values(r.birthdayCard).every(Boolean) &&
    Object.values(r.birthday).every(Boolean) &&
    Object.values(r.cmdsInPrompt).every(Boolean) &&
    !errors.length &&
    !t.failures.length;
  if (process.env.KEEP) console.log('output in', out);
  else fs.rmSync(data, { recursive: true, force: true });
  // on GitHub, a failure also becomes an annotation with the results, since the job log isn't always at hand
  if (!ok && process.env.GITHUB_ACTIONS) {
    const brief = { failed: t.failures, ...t.results, ...r };
    console.log(
      '::error title=Smoke test failed::' +
        JSON.stringify(brief, (_k, v) => (typeof v === 'string' && v.length > 160 ? `${v.slice(0, 60)}…` : v))
          .replace(/%/g, '%25')
          .replace(/\n/g, ' ')
          .slice(0, 6000),
    );
  }
  console.log(ok ? 'SMOKE OK' : 'SMOKE FAILED');
  process.exit(ok ? 0 : 1);
})().catch(e => {
  console.error(e);
  if (process.env.GITHUB_ACTIONS)
    console.log(
      '::error title=Smoke test crashed::' +
        String(e?.stack || e)
          .replace(/%/g, '%25')
          .replace(/\n/g, '%0A')
          .slice(0, 4000),
    );
  process.exit(1);
});
