// @ts-nocheck
// End-to-end smoke test: opens the real app (headless) with a throwaway data folder, and drives the bridge.
//   node tests/smoke.ts
//   FENMYR_APP=~/.local/lib/fenmyr/app node tests/smoke.ts   (an installed copy, with the Electron install.sh chose)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright';
import { board } from './smoke/board.ts';
import { bridge } from './smoke/bridge.ts';
import { installPageKit, makeSmoke } from './smoke/kit.ts';
import { library } from './smoke/library.ts';
import { look } from './smoke/look.ts';
import { panels } from './smoke/panels.ts';
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
  // slash commands: / lists what Myra can do without AI, Ctrl+F opens her with /find ready; /find opens the find bar beside her pill (live search, cycling, closes)
  {
    await page.evaluate(() => {
      const M = window.__fenmyr;
      M.board.cards.length = 0;
      ['Pick cloudberries', 'Buy bread', 'cloudberry jam', 'Plan the trip'].forEach((t, i) => {
        M.board.cards.push({
          id: `sl${i}`,
          type: 'note',
          x: (i % 2) * 300,
          y: Math.floor(i / 2) * 200,
          w: 220,
          h: 140,
          color: 'white',
          text: t,
          r: 0,
        });
      });
      M.renderAll();
    });
    await page.keyboard.press('Control+f');
    const f1 = await page.evaluate(() => ({
      chat: document.getElementById('myra').classList.contains('chat'),
      val: document.getElementById('mcInput').value,
      focus: document.activeElement.id,
    }));
    await page.keyboard.type('cloud');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    const bar = () =>
      page.evaluate(() => {
        const b = document.getElementById('findBar'),
          p = document.getElementById('mPill').getBoundingClientRect(),
          r = b.getBoundingClientRect();
        return {
          shown: !b.hidden,
          count: document.getElementById('fbCount').textContent,
          focus: document.activeElement.id,
          dim: document.querySelectorAll('.card.dim').length,
          cur: document.querySelectorAll('.card.find-cur').length,
          right: r.left >= p.right,
          level: Math.abs(r.top + r.height / 2 - (p.top + p.height / 2)) < 1.5,
          prevOff: document.getElementById('fbPrev').disabled,
        };
      });
    const b1 = await bar();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
    const b2 = await bar();
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.press('Shift+Enter');
    await page.waitForTimeout(250);
    const b3 = await bar();
    await page.fill('#fbQ', 'trip');
    await page.waitForTimeout(400);
    const b4 = await bar();
    await page.fill('#fbQ', 'zebra');
    await page.waitForTimeout(400);
    const b5 = await bar();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    const b6 = await bar();
    await page.click('#mPill');
    await page.waitForTimeout(200);
    await page.fill('#mcInput', '/');
    const menu = await page.evaluate(() =>
      [...document.querySelectorAll('.slash-menu button')].map(b => b.dataset.key).join(),
    );
    await page.keyboard.press('Escape');
    const closed = await page.evaluate(
      () => document.querySelector('.slash-menu').hidden && document.getElementById('myra').classList.contains('chat'),
    );
    await page.fill('#mcInput', '/tidy');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    const f3 = await page.evaluate(() => [...document.querySelectorAll('#mcList .mc-msg')].pop().textContent.trim());
    r.slash = {
      open: f1.chat && f1.val === '/find ' && f1.focus === 'mcInput',
      barOpens: b1.shown && b1.focus === 'fbQ' && b1.count === '1 of 2',
      dims: b1.dim === 2 && b1.cur === 1,
      besideMyra: b1.right && b1.level,
      cycles: b2.count === '2 of 2' && b3.count === '2 of 2',
      live: b4.count === '1 of 1' && b4.prevOff,
      none: b5.count === 'No matches' && b5.dim === 0,
      closes: !b6.shown && b6.dim === 0 && b6.cur === 0,
      menu: menu === 'find,tag,tidy,due,fit,timer,birthday,animate,clear,help',
      closed,
      tidy: /Lined 4 notes/.test(f3),
    };
    await page.evaluate(() => {
      document.getElementById('mcNew').click();
      window.__fenmyr.stopAnim();
      document.getElementById('mcInput').blur();
    });
  }
  // pictures never live inside a note: pasted into a note they become a connected picture card (or replace an empty note); a linked pair sent to Unsorted comes back together
  {
    const png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC';
    const putImg = () =>
      page.evaluate(async u => {
        const b = await (await fetch(u)).blob();
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]);
      }, png);
    const clear = () =>
      page.evaluate(() => {
        const M = window.__fenmyr;
        M.board.cards.length = 0;
        M.board.links.length = 0;
        M.board.tray.length = 0;
        delete M.board.trayLinks;
        M.renderAll();
        M.renderTray();
      });
    const snap = () =>
      page.evaluate(() => {
        const M = window.__fenmyr;
        return {
          types: M.board.cards.map(c => c.type).join(),
          text: M.board.cards.find(c => c.type === 'note')?.text,
          links: M.board.links.length,
          w: M.board.links[0]?.w,
          tray: M.board.tray.map(c => c.type + (c.tie ? '*' : '')).join(),
          trayLinks: (M.board.trayLinks || []).length,
          inline: document.querySelectorAll('.card .text img').length,
        };
      });
    await clear();
    await page.evaluate(() => window.__fenmyr.newNote());
    await page.waitForTimeout(250);
    await page.keyboard.type('hello');
    await putImg();
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(800);
    const a = await snap();
    await clear();
    await page.evaluate(() => window.__fenmyr.newNote());
    await page.waitForTimeout(250);
    await putImg();
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(800);
    const d = await snap();
    await clear();
    await page.evaluate(() => window.__fenmyr.newNote());
    await page.waitForTimeout(250);
    await page.keyboard.type('pair');
    await putImg();
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      const M = window.__fenmyr;
      M.board.links[0].w = 6;
      M.selectOnly(M.board.cards.map(c => c.id));
      M.fit(M.board.cards);
    });
    await page.waitForTimeout(300);
    const tr = await page.locator('#tray').boundingBox(),
      pos = await page.evaluate(() => {
        const M = window.__fenmyr,
          z = M.view.z,
          rr = document.getElementById('stage').getBoundingClientRect(),
          c = M.board.cards[0];
        return { x: c.x * z + M.view.x + rr.left + 40, y: c.y * z + M.view.y + rr.top + 30 };
      });
    await page.mouse.move(pos.x, pos.y);
    await page.mouse.down();
    await page.mouse.move(tr.x + 60, tr.y + 60, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    const away = await snap();
    const ib = await page.locator('#trayList .tray-item').first().boundingBox();
    await page.mouse.move(ib.x + 20, ib.y + 10);
    await page.mouse.down();
    await page.mouse.move(500, 400, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    const back = await snap();
    await clear();
    await page.evaluate(() => {
      const M = window.__fenmyr;
      for (let i = 0; i < 3; i++)
        M.board.cards.push({
          id: `cp${i}`,
          type: 'image',
          x: i * 300,
          y: 0,
          w: 260,
          h: 180,
          src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC',
          r: 0,
        });
      M.renderAll();
      M.fit(M.board.cards);
    });
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+c');
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const M = window.__fenmyr;
      M.selectOnly([]);
      M.newNote();
    });
    await page.waitForTimeout(250);
    await page.keyboard.type('hello');
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      const M = window.__fenmyr;
      M.selectOnly([M.board.cards.find(c => c.type === 'note').id]);
    });
    await putImg();
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(900);
    const noDup = await page.evaluate(() => window.__fenmyr.board.cards.filter(c => c.type === 'image').length); // the 3 copied ones plus the one pasted, and no re-pasted copies
    // a note inside a group: its picture joins the group; and undo after pulling a tied group out of Unsorted keeps their connectors
    await clear();
    await page.evaluate(() => {
      const M = window.__fenmyr,
        px =
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC';
      M.board.cards.push(
        { id: 'g1', type: 'note', x: 0, y: 0, w: 220, h: 140, color: 'white', text: 'one', r: 0, group: 'G' },
        { id: 'g2', type: 'image', x: 400, y: 0, w: 220, h: 140, src: px, r: 0, group: 'G' },
      );
      M.board.links.push({ id: 'gl', a: 'g1', b: 'g2' });
      M.renderAll();
      M.fit(M.board.cards);
      M.selectOnly(['g1']);
    });
    await putImg();
    await page.keyboard.press('Control+v');
    await page.waitForTimeout(800);
    const grouped = await page.evaluate(() => window.__fenmyr.board.cards.filter(c => c.group === 'G').length);
    await page.evaluate(() => {
      const M = window.__fenmyr;
      M.selectOnly(M.board.cards.map(c => c.id));
      M.fit(M.board.cards);
    });
    const tr2 = await page.locator('#tray').boundingBox(),
      p2 = await page.evaluate(() => {
        const M = window.__fenmyr,
          z = M.view.z,
          rr = document.getElementById('stage').getBoundingClientRect(),
          c = M.board.cards[0];
        return { x: c.x * z + M.view.x + rr.left + 40, y: c.y * z + M.view.y + rr.top + 30 };
      });
    await page.mouse.move(p2.x, p2.y);
    await page.mouse.down();
    await page.mouse.move(tr2.x + 60, tr2.y + 60, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    const pull = async () => {
      const it = page.locator('#trayList .tray-item').first();
      await it.scrollIntoViewIfNeeded();
      const b = await it.boundingBox();
      await page.mouse.move(b.x + 20, b.y + 10);
      await page.mouse.down();
      await page.mouse.move(500, 400, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(500);
    };
    await pull();
    await page.evaluate(() => window.__fenmyr.selectOnly([]));
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(600);
    const undone = await snap();
    await pull();
    const afterUndo = await snap();
    r.notePics = {
      beside: a.types === 'note,image' && a.text === 'hello' && a.links === 1 && !a.inline,
      replaced: d.types === 'image' && d.links === 0,
      tied:
        away.types === '' &&
        away.tray.split(',').every(x => x.endsWith('*')) &&
        away.trayLinks === 1 &&
        away.links === 0,
      noDup: noDup === 4,
      joinsGroup: grouped === 3,
      undoKeepsLinks:
        undone.tray.split(',').length === 3 && afterUndo.links === 2 && afterUndo.types.split(',').length === 3,
      together:
        back.types.split(',').sort().join() === 'image,note' &&
        back.links === 1 &&
        back.w === 6 &&
        back.tray === '' &&
        back.trayLinks === 0,
    };
    await clear();
  }
  // shortcut labels are written with the Mac symbols and read Ctrl+ here (so a Mac shows ⌘); Ctrl+, opens Settings even while typing
  {
    const keys = await page.evaluate(() =>
        [...document.querySelectorAll('#keys kbd, #cleanBack kbd')].map(k => k.textContent).join(' | '),
      ),
      src = fs.readFileSync(path.join(import.meta.dirname, '../web/index.html'), 'utf8');
    await page.click('#capInput', { force: true }).catch(() => {});
    await page.evaluate(() => {
      const i = document.createElement('input');
      i.id = 'tmpTyping';
      document.body.appendChild(i);
      i.focus();
    });
    await page.keyboard.press('Control+,');
    await page.waitForTimeout(400);
    const opened = await page.evaluate(() => document.getElementById('settings').classList.contains('on'));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.evaluate(() => document.getElementById('tmpTyping').remove());
    r.keysMac = {
      read: /Ctrl\+K/.test(keys) && /Ctrl\+F/.test(keys) && /Ctrl\+\\/.test(keys),
      sourceMac: !/<kbd>Ctrl/.test(src) && /<kbd>⌘K<\/kbd>/.test(src),
      settingsKey: opened,
    };
  }
  // /timer: parsing, ready-made timers in the menu, the chip, the two-minute warning, the finish, stop, and that it is kept for a restart
  {
    const q = a => page.evaluate(a => JSON.stringify(window.__fenmyr.parseTimer(a)), a),
      M = () =>
        page.evaluate(() => {
          const t = window.__fenmyr.timerState();
          return {
            t: t && { m: t.secs / 60, p: t.purpose, w: t.warned },
            chip: !document.getElementById('timerChip').hidden,
            saved: !!localStorage.getItem('fenmyr:timer'),
            confetti: document.querySelectorAll('.confetti').length,
            calm: !!window.myraCalm,
          };
        });
    const parsed = [
      await q('25'),
      await q('1h30 draft'),
      await q('90 deep work'),
      await q('abc'),
      await q('0'),
      await q('1 min 1 sec tea'),
      await q('69 seconds'),
      await q('2m10s'),
      await q('1h 5m 3s'),
      await q('25write'),
    ];
    await page.click('#mPill');
    await page.waitForTimeout(200);
    await page.fill('#mcInput', '/timer');
    const presets = await page.evaluate(() =>
      [...document.querySelectorAll('.slash-menu button')].map(b => b.textContent).join('|'),
    );
    await page.keyboard.press('Escape');
    await page.fill('#mcInput', '/timer 25 write the intro');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    const a = await M();
    await page.evaluate(() => {
      window.__fenmyr.timerState().end = Date.now() + 119000;
      window.__fenmyr.timerCheck();
    });
    await page.waitForTimeout(300);
    const w = await M();
    await page.evaluate(() => {
      window.__fenmyr.timerState().end = Date.now() - 1000;
      window.__fenmyr.timerCheck();
    });
    await page.waitForTimeout(500);
    const d = await M();
    await page.fill('#mcInput', '/timer 10');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    await page.fill('#mcInput', '/timer stop');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    const s = await M();
    r.timer = {
      parse:
        parsed[0] === '{"secs":1500,"purpose":""}' &&
        parsed[1] === '{"secs":5400,"purpose":"draft"}' &&
        parsed[2] === '{"secs":5400,"purpose":"deep work"}' &&
        parsed[3] === 'null' &&
        parsed[4] === 'null' &&
        parsed[5] === '{"secs":61,"purpose":"tea"}' &&
        parsed[6] === '{"secs":69,"purpose":""}' &&
        parsed[7] === '{"secs":130,"purpose":""}' &&
        parsed[8] === '{"secs":3903,"purpose":""}' &&
        parsed[9] === 'null',
      presets: /15 min break/.test(presets) && /50 min focus/.test(presets) && /5 min breather/.test(presets),
      started: a.t && a.t.m === 25 && a.t.p === 'write the intro' && a.chip && a.saved,
      warned: w.t && w.t.w === true,
      finished: d.t === null && !d.chip && !d.saved && (d.confetti > 0 || d.calm),
      stopped: s.t === null && !s.chip,
    };
    await page.evaluate(() => {
      document.getElementById('mcNew').click();
      window.__fenmyr.stopAnim();
      document.getElementById('mcInput').blur();
    });
  }
  // /tim then Enter picks /timer and lists the ready-made timers at once; the end of a timer glows red (work) or green (a break) until dismissed; the chip pulses in the last two minutes
  {
    const glow = () =>
        page.evaluate(() => document.getElementById('mPill').className.match(/glow-(red|green)/)?.[1] || ''),
      fin = async (cmd, kind) => {
        await page.fill('#mcInput', cmd);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(250);
        await page.evaluate(k => {
          const t = window.__fenmyr.timerState();
          if (k) t.kind = k;
          t.end = Date.now() - 1000;
          window.__fenmyr.timerCheck();
        }, kind);
        await page.waitForTimeout(400);
        return glow();
      };
    await page.click('#mPill').catch(() => {});
    await page.evaluate(() => {
      document.getElementById('myra').classList.add('chat');
    });
    await page.fill('#mcInput', '/tim');
    await page.waitForTimeout(150);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    const picked = await page.evaluate(() => ({
      val: document.getElementById('mcInput').value,
      keys: [...document.querySelectorAll('.slash-menu button')].map(b => b.dataset.key).join('|'),
    }));
    await page.keyboard.press('Escape');
    await page.fill('#mcInput', '');
    const pose = () => page.evaluate(() => window.__fenmyr.currentPose());
    const custom = await fin('/timer 10 write the intro'),
      brk = await fin('/timer 15 break'),
      breakEndPose = await pose(),
      breather = await fin('/timer 5 breather');
    await page.waitForTimeout(3300);
    const breakNoSigh = await pose();
    await page.fill('#mcInput', '/timer 15 break');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    const sleepyPose = await pose();
    await page.fill('#mcInput', '/timer stop');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    const focus = await fin('/timer 50 focus');
    await page.waitForTimeout(3300);
    const sighPose = await pose();
    await page.evaluate(() => document.getElementById('mPill').click());
    await page.waitForTimeout(150);
    const sighCleared = await pose();
    await page.evaluate(() => document.getElementById('myra').classList.add('chat'));
    const ai = await fin('/timer 10 coffee with Sam', 'break');
    await page.evaluate(() => document.getElementById('mPill').click());
    await page.waitForTimeout(150);
    const cleared = await glow();
    await page.fill('#mcInput', '/timer 10');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      window.__fenmyr.timerState().end = Date.now() + 90000;
      window.__fenmyr.timerCheck();
    });
    await page.waitForTimeout(300);
    const soon = await page.evaluate(() => document.getElementById('mPill').classList.contains('hurry')),
      shookPose = await pose();
    await page.fill('#mcInput', '/timer stop');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    r.timerUx = {
      picksTimer: picked.val === '/timer ' && picked.keys === '/timer 15 break|/timer 50 focus|/timer 5 breather',
      customRed: custom === 'red',
      breakGreen: brk === 'green' && breather === 'green',
      focusRed: focus === 'red',
      aiBreakGreen: ai === 'green',
      clears: cleared === '',
      hurries: soon,
      shook: shookPose === 'shook',
      sleepy: sleepyPose === 'sleepy',
      breakEndsNormal: breakEndPose === null && breakNoSigh === null,
      sighs: sighPose === 'sigh',
      sighClears: sighCleared === null,
    };
    await page.evaluate(() => {
      document.getElementById('mcNew').click();
      window.__fenmyr.stopAnim();
      document.getElementById('mcInput').blur();
    });
  }
  // /animate: names in the menu, a named one and a random one play on her sprite, plain words are understood, her own choice (animate) plays, and a timer's face wins
  {
    const pose = () => page.evaluate(() => window.__fenmyr.currentPose());
    await page.evaluate(() => document.getElementById('myra').classList.add('chat'));
    await page.fill('#mcInput', '/animate');
    await page.keyboard.press('Space');
    await page.waitForTimeout(200);
    const keys = await page.evaluate(() =>
      [...document.querySelectorAll('.slash-menu button')].map(b => b.dataset.key).join('|'),
    );
    await page.keyboard.press('Escape');
    await page.fill('#mcInput', '/animate dizzy');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
    const named = await pose();
    await page.fill('#mcInput', '/animate love');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
    const switched = await pose();
    await page.evaluate(() => window.__fenmyr.applyMyra({ say: 'ok', animate: 'happy' }));
    await page.waitForTimeout(250);
    const byAi = await pose();
    await page.evaluate(() => window.__fenmyr.applyMyra({ say: 'ok', animate: 'dizzy' }));
    await page.waitForTimeout(250);
    const aiLimited = await pose();
    const intents = await page.evaluate(() =>
      ['can you do a jump?', 'show me your moves', 'tidy my notes', 'hello']
        .map(q => window.__fenmyr.animIntent(q))
        .join('|'),
    );
    await page.fill('#mcInput', '/animate');
    await page.keyboard.press('Space');
    await page.fill('#mcInput', '/animate');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    await page.fill('#mcInput', '/timer 15 break');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    await page.fill('#mcInput', '/animate happy');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    const duringTimer = await pose();
    await page.fill('#mcInput', '/timer stop');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(4500);
    const after = await pose();
    r.animate = {
      menu: keys.startsWith(
        '/animate|/animate hop|/animate wiggle|/animate party|/animate sleepy|/animate shook|/animate sigh|/animate happy|/animate love|/animate dizzy|/animate curious',
      ),
      named: named === 'dizzy',
      switched: switched === 'love',
      byAi: byAi === 'happy',
      aiLimited: aiLimited === 'happy',
      intents: intents === 'hop|*||',
      timerWins: duringTimer === 'sleepy',
      ends: after === null,
    };
    await page.evaluate(() => {
      document.getElementById('mcNew').click();
      window.__fenmyr.stopAnim();
      document.getElementById('mcInput').blur();
    });
  }
  // her own animations: aliases the model might use, request-shaped words only with thinking on, and the idle cycle (never more than once an hour, never over a timer's face or glow)
  {
    await page.evaluate(() => {
      document.getElementById('myra').classList.remove('chat');
      document.getElementById('mcInput').blur();
    });
    await page.waitForTimeout(4500);
    const nm = await page.evaluate(() =>
        ['heart eyes', 'jump', 'DANCE', 'zzz'].map(n => window.__fenmyr.animName(n)).join('|'),
      ),
      rq = await page.evaluate(() =>
        ['can you do a jump?', 'Hi Ruth! I love you', 'tidy my notes', 'show me your moves']
          .map(q => window.__fenmyr.animRequest(q))
          .join('|'),
      );
    const idle = await page.evaluate(() => {
      const M = window.__fenmyr;
      localStorage.setItem('fenmyr:idleAnim', JSON.stringify({ last: 0, next: Date.now() - 1000 }));
      const before = Date.now(),
        first = M.idleCheck(true),
        st = M.idleState(),
        second = M.idleCheck(true);
      return { first, second, gapMin: (st.next - before) / 60000 };
    });
    await page.waitForTimeout(4500);
    await page.evaluate(() => {
      document.getElementById('myra').classList.add('chat');
    });
    await page.fill('#mcInput', '/timer 15 break');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      document.getElementById('myra').classList.remove('chat');
      localStorage.setItem('fenmyr:idleAnim', JSON.stringify({ last: 0, next: Date.now() - 1000 }));
    });
    const overTimer = await page.evaluate(() => window.__fenmyr.idleCheck(true));
    await page.evaluate(() => {
      document.getElementById('myra').classList.add('chat');
    });
    await page.fill('#mcInput', '/timer stop');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      document.getElementById('myra').classList.remove('chat');
      document.getElementById('mcInput').blur();
    });
    r.idleAnim = {
      aliases: nm === 'love|hop|party|',
      requests: rq === 'hop|||*',
      plays: ['hop', 'wiggle', 'happy', 'love', 'dizzy', 'sleepy'].includes(idle.first),
      once: idle.second === false,
      gap: idle.gapMin >= 59.9 && idle.gapMin <= 91,
      notOverTimer: overTimer === false,
    };
  }
  // due dates: the chip and its colour, the reminder index, one announcement per due date, and the date coming along when the note is copied to another board
  {
    const _F = '(window.__fenmyr)',
      iso = d =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    await page.evaluate(() => window.__fenmyr.dueRelease());
    const id = await page.evaluate(() => window.__fenmyr.newNote(300, 700));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const chip = () =>
      page.evaluate(i => {
        const e = document.querySelector(`[data-id="${i}"] .due`);
        return e ? { cls: e.className, text: e.textContent } : null;
      }, id);
    const day = new Date(Date.now() + 3 * 864e5);
    await page.evaluate(
      ([i, v]) =>
        window.__fenmyr.setDue(
          window.__fenmyr.curBoard().cards.find(c => c.id === i),
          v,
        ),
      [id, iso(day).slice(0, 10)],
    );
    const far = await chip();
    const soon = new Date(Date.now() + 2 * 36e5);
    await page.evaluate(
      ([i, v]) =>
        window.__fenmyr.setDue(
          window.__fenmyr.curBoard().cards.find(c => c.id === i),
          v,
        ),
      [id, iso(soon)],
    );
    const near = await chip();
    const idx1 = await page.evaluate(() => Object.keys(window.__fenmyr.dueRaw()).length);
    await page.evaluate(() => {
      document.getElementById('mSay').textContent = '';
    });
    const gone = new Date(Date.now() - 15 * 6e4);
    await page.evaluate(
      ([i, v]) =>
        window.__fenmyr.setDue(
          window.__fenmyr.curBoard().cards.find(c => c.id === i),
          v,
        ),
      [id, iso(gone)],
    );
    await page.waitForTimeout(300);
    const late = await chip(),
      said = await page.evaluate(
        () =>
          document.getElementById('mSay').textContent +
          ' ' +
          [...document.querySelectorAll('#mcList .mc-m')].map(e => e.textContent).join(' '),
      ),
      fired = await page.evaluate(() => Object.keys(window.__fenmyr.dueFiredRaw()).length);
    await page.evaluate(() => {
      document.getElementById('mSay').textContent = '';
      window.__fenmyr.dueArm();
    });
    await page.waitForTimeout(200);
    const again = await page.evaluate(() => document.getElementById('mSay').textContent);
    const home = await page.evaluate(() => window.__fenmyr.curBoard().id);
    await page.evaluate(async () => {
      await Fenmyr.save({
        id: 'duex',
        name: 'Due elsewhere',
        cards: [],
        links: [],
        tray: [],
        trayLinks: [],
        palette: [],
        updated: Date.now(),
      });
    });
    await page.evaluate(i => {
      window.__fenmyr.selectOnly([i]);
      window.__fenmyr.copyCards();
    }, id);
    await page.evaluate(async () => {
      await window.__fenmyr.openBoard('duex');
      window.__fenmyr.pasteCards();
    });
    await page.waitForTimeout(700);
    const moved = await page.evaluate(() => {
        const c = window.__fenmyr.curBoard().cards.find(k => k.type === 'note');
        return c?.due;
      }),
      idx2 = await page.evaluate(() => Object.values(window.__fenmyr.dueRaw()).filter(it => it.b === 'duex').length);
    await page.evaluate(async h => {
      await window.__fenmyr.openBoard(h);
      await Fenmyr.remove('duex');
    }, home);
    await page.waitForTimeout(300);
    r.due = {
      chip: !!far && far.cls === 'due ' && /\d/.test(far.text),
      soon: !!near && near.cls.includes('soon'),
      index: idx1 >= 1,
      over: !!late && late.cls.includes('over'),
      announced: /was due/.test(said) && fired >= 1,
      once: again.trim() === '',
      kept: moved === iso(gone),
      indexedOtherBoard: idx2 === 1,
    };
  }
  // Myra's greeting: the hello, what is still due today (once a day), contributors, and the first focus after midnight
  {
    const say = () => page.evaluate(() => document.getElementById('mSay').textContent),
      set = (i, v) =>
        page.evaluate(
          ([i, v]) =>
            window.__fenmyr.setDue(
              window.__fenmyr.curBoard().cards.find(c => c.id === i),
              v,
            ),
          [i, v],
        );
    const a = await page.evaluate(() => window.__fenmyr.newNote(500, 700)),
      b = await page.evaluate(() => window.__fenmyr.newNote(700, 700)),
      c = await page.evaluate(() => window.__fenmyr.newNote(900, 700));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await set(a, '2030-05-06T15:30');
    await set(b, '2030-05-06T09:00');
    await set(c, '2030-05-07T10:30');
    await page.evaluate(() => {
      window.__fenmyr.setGreet(true, 'chatty');
      window.__bdNow = new Date('2030-05-06T12:00').getTime();
      localStorage.removeItem('fenmyr:daily:open');
      document.getElementById('mSay').textContent = '';
      window.__fenmyr.greet('start');
    });
    const first = await say();
    await page.evaluate(() => {
      document.getElementById('mSay').textContent = '';
      window.__fenmyr.greet('start');
    });
    const second = await say();
    await page.evaluate(() => {
      window.__bdNow = new Date('2030-05-07T08:00').getTime();
      document.getElementById('mSay').textContent = '';
      window.dispatchEvent(new Event('focus'));
    });
    const morning = await say();
    await page.evaluate(() => {
      window.__fenmyr.greeter('smoke', 5, () => ({ text: 'Test line from a contributor' }));
      document.getElementById('mSay').textContent = '';
      window.__fenmyr.greet('start');
    });
    const added = await say();
    await page.evaluate(() => {
      window.__bdNow = new Date('2030-05-08T12:00').getTime();
      window.__fenmyr.slashDue('overdue');
    });
    await page.waitForTimeout(200);
    const overdue = await page.evaluate(() =>
      [...document.querySelectorAll('#mcList > *')].map(e => e.textContent).join(' | '),
    );
    await page.evaluate(() => {
      delete window.__bdNow;
      window.__fenmyr.setGreet(false, 'quiet');
    });
    r.greeting = {
      hello: /Hi/.test(first) && /Due today/.test(first) && /3:30|15:30/.test(first) && !/9:00|09:00/.test(first),
      onceADay: /Hi/.test(second) && !/Due today/.test(second),
      newDay: /Good morning/.test(morning) && /10:30/.test(morning),
      contributor: /Test line from a contributor/.test(added),
      dueOverdue: /Overdue/.test(overdue) && !/Coming up/.test(overdue.split('Overdue')[1] || ''),
    };
  }
  // dragging a board between two rows puts it there (and the order is kept in the folders file, not in the boards)
  {
    await page.evaluate(async () => {
      for (const [id, n] of [
        ['oa', 'Alpha'],
        ['ob', 'Bravo'],
        ['oc', 'Charlie'],
      ])
        await Fenmyr.save({ id, name: n, folder: 'of', cards: [], links: [], updated: Date.now() });
      await Fenmyr.saveFolders({ projects: [], folders: [{ id: 'of', name: 'Order folder', open: true }] });
      await window.__fenmyr.refreshBoards();
    });
    const row = n => page.locator('.board-row', { hasText: n }).first();
    const names = () => page.evaluate(() => window.__fenmyr.boardsOf('of'));
    const before = await names();
    await row('Charlie').dragTo(row('Alpha'), { targetPosition: { x: 40, y: 3 } });
    await page.waitForTimeout(500);
    const after = await names(),
      kept = await page.evaluate(async () => {
        const l = await Fenmyr.folders();
        return JSON.stringify(l.order?.of || []);
      });
    await row('Alpha').dragTo(row('Bravo'), { targetPosition: { x: 40, y: 26 } });
    await page.waitForTimeout(500);
    const after2 = await names();
    r.boardOrder = {
      before: before.length === 3,
      toTop: after[0] === 'Charlie' && after.length === 3,
      saved: kept === JSON.stringify(['oc', 'oa', 'ob']) || kept.includes('oc'),
      after: after2.join() === 'Charlie,Bravo,Alpha',
    };
    await page.evaluate(async () => {
      for (const id of ['oa', 'ob', 'oc']) await Fenmyr.remove(id);
      await Fenmyr.saveFolders({ projects: [], folders: [] });
      await window.__fenmyr.refreshBoards();
    });
  }
  // toolbar popups close on a click anywhere else (shapes, stamps, templates), the zoom and ··· menus too, and Esc closes a menu
  {
    const on = id => page.evaluate(i => document.getElementById(i).classList.contains('on'), id),
      res = {};
    for (const [tool, pick] of [
      ['shape', 'shapePick'],
      ['tpl', 'tplPick'],
      ['stamp', 'stampWheel'],
    ]) {
      await page.locator(`#tools > [data-add="${tool}"]`).click();
      await page.waitForTimeout(300);
      const was = await on(pick);
      await page.mouse.click(700, 420);
      await page.waitForTimeout(300);
      res[tool] = was && !(await on(pick));
    }
    await page.locator('#zoom').click();
    await page.waitForTimeout(200);
    const menu = await page.evaluate(() => !!document.getElementById('rowMenu'));
    await page.mouse.click(700, 420);
    await page.waitForTimeout(200);
    const gone = await page.evaluate(() => !document.getElementById('rowMenu'));
    await page.locator('#zoom').click();
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const esc = await page.evaluate(() => !document.getElementById('rowMenu'));
    r.popups = { ...res, zoomMenu: menu && gone, escMenu: esc };
  }
  // at the window edge and over the top-left strip the system cursor comes back (and the app's own cursor steps aside); anywhere else it is the app's own
  {
    const at = async (px, py) => {
      await page.mouse.move(px + 2, py + 2);
      await page.mouse.move(px, py);
      await page.waitForTimeout(120);
      return page.evaluate(() => ({
        edge: document.body.classList.contains('cur-edge'),
        hidden: document.querySelector('body > .mcur').classList.contains('hide'),
      }));
    };
    const corner = await at(4, 4),
      strip = await at(150, 20),
      board = await at(700, 420),
      side = await at(1436, 400);
    r.cursorEdge = {
      corner: corner.edge && corner.hidden,
      strip: strip.edge && strip.hidden,
      board: !board.edge && !board.hidden,
      side: side.edge && side.hidden,
    };
    await page.mouse.move(700, 420);
  }
  // tags on the note itself: "+ tag" adds one, the x removes it, undo brings it back, and neither shows on an unselected note
  {
    const id = await page.evaluate(() => window.__fenmyr.newNote(120, -250));
    await page.keyboard.type('tag me');
    await page.keyboard.press('Escape');
    await page.mouse.click(700, 150);
    await page.waitForTimeout(200);
    await page.evaluate(i => window.__fenmyr.selectOnly([i]), id);
    await page.waitForTimeout(250);
    const st = () =>
      page.evaluate(i => {
        const b = window.__fenmyr.curBoard(),
          c = b.cards.find(k => k.id === i);
        return { tags: c.tags || [], board: b.tags || [] };
      }, id);
    const sel = `[data-id="${id}"]`,
      vis = s => page.locator(`${sel} ${s}`).first().isVisible();
    const soloShown = await vis('.nt-add');
    await page.evaluate(() => {
      const trace = [];
      window.__tagTrace = trace;
      for (const name of ['pointerdown', 'pointerup', 'pointercancel', 'click', 'focusin', 'keydown'])
        addEventListener(
          name,
          e => trace.push([Math.round(performance.now()), name, `${e.target?.tagName}.${e.target?.className}`]),
          true,
        );
    });
    await page.locator(`${sel} .nt-add`).click();
    await page
      .waitForFunction(() => document.activeElement?.matches('#tagAdd input'), null, { timeout: 8000 })
      .catch(async e => {
        const state = await page.evaluate(i => {
          const add = document.querySelector(`[data-id="${i}"] .nt-add`);
          const b = add?.getBoundingClientRect();
          const under = b ? document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2) : null;
          const a = document.activeElement;
          return {
            active: a ? `${a.tagName}#${a.id}.${a.className}` : null,
            pop: document.getElementById('tagAdd')?.className ?? 'no pop',
            popHasInput: !!document.querySelector('#tagAdd input'),
            docFocus: document.hasFocus(),
            selected: [...document.querySelectorAll('.card.sel')].map(c => c.dataset.id),
            want: i,
            addExists: !!add,
            addRect: b ? [b.x, b.y, b.width, b.height] : null,
            under: under ? `${under.tagName}.${under.className}` : null,
            on: [...document.querySelectorAll('.on')].map(x => x.id || x.className).slice(0, 15),
            editing: document.querySelector('.card.editing')?.dataset.id ?? null,
            trace: window.__tagTrace,
          };
        }, id);
        console.log('TAG DIAG', JSON.stringify(state));
        fs.mkdirSync('/tmp/visual', { recursive: true });
        await page.screenshot({ path: '/tmp/visual/tag-diag.png' });
        throw e;
      });
    await page.keyboard.type('zeta');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(350);
    const added = await st();
    const xShown = await vis('.nt-x');
    await page.locator(`${sel} .nt-x`).click();
    await page.waitForTimeout(350);
    const removed = await st();
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);
    const undone = await st();
    await page.mouse.click(700, 120);
    await page.waitForTimeout(200);
    const hidden = !(await vis('.nt-x')) && !(await vis('.nt-add'));
    r.noteTags = {
      soloShown,
      adds: added.tags.join() === 'zeta' && added.board.includes('zeta'),
      xShown,
      removes: removed.tags.length === 0 && !removed.board.includes('zeta'),
      undo: undone.tags.join() === 'zeta',
      quietWhenUnselected: hidden,
    };
  }
  // search and text fields get a clear (x) button; the wireframe search stays visible while the palette scrolls
  {
    const vis = () =>
      page.evaluate(() => {
        const b = document.getElementById('clrBtn');
        return !!b && !b.hidden;
      });
    await page.keyboard.press('Escape');
    await page.mouse.click(700, 420);
    await page.waitForTimeout(150);
    await page.locator('#dzSearch').click();
    await page.waitForTimeout(150);
    const empty = await vis();
    await page.keyboard.type('box');
    await page.waitForTimeout(150);
    const shown = await vis();
    const hits = await page.evaluate(
      () =>
        [...document.querySelectorAll('.dz-body [data-wf], .dz-body [data-piece]')].filter(b => b.offsetParent).length,
    );
    await page.locator('#clrBtn').click();
    await page.waitForTimeout(150);
    const cleared = await page.evaluate(() => ({
      v: document.getElementById('dzSearch').value,
      focus: document.activeElement === document.getElementById('dzSearch'),
      n: [...document.querySelectorAll('.dz-body [data-wf], .dz-body [data-piece]')].filter(b => b.offsetParent).length,
    }));
    const sticky = await page.evaluate(() => {
      const body = document.querySelector('#design .dz-body');
      body.scrollTop = 400;
      return new Promise(r =>
        setTimeout(() => {
          const a = document.querySelector('#design .dz-search').getBoundingClientRect(),
            b = body.getBoundingClientRect();
          r({ scrolled: body.scrollTop > 100, atTop: Math.abs(a.top - b.top) < 3 });
          body.scrollTop = 0;
        }, 100),
      );
    });
    await page.locator('#mcInput').evaluate(el => {
      el.closest('.m-chat')?.classList.add('on');
    });
    await page.mouse.move(5, 400);
    await page.keyboard.press('Escape');
    r.clearBtn = {
      hiddenWhenEmpty: !empty,
      showsWithText: shown,
      clears: cleared.v === '' && cleared.focus && cleared.n > hits,
      sticky: sticky.scrolled && sticky.atTop,
    };
  }
  // the height grips: the pointer shows the system's resize cursor over them, and the bar swells into a peak on hover
  {
    const g = await page.locator('.rz-grip').first().boundingBox(),
      h = () => page.evaluate(() => document.querySelector('.rz-grip path').getBBox().height);
    const rest = await h();
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.waitForTimeout(900);
    const hot = await h(),
      own = await page.evaluate(() => document.querySelector('body > .mcur').classList.contains('rsz'));
    await page.mouse.move(5, 400);
    await page.waitForTimeout(900);
    const dz = page.locator('.rz-grip[data-panel="design"]'),
      d0 = await dz.boundingBox();
    await page.mouse.move(d0.x + d0.width / 2, d0.y + 6);
    await page.mouse.down();
    await page.mouse.move(d0.x + d0.width / 2, d0.y + 6 + 30, { steps: 5 });
    await page.waitForTimeout(150);
    const d1 = await dz.boundingBox(),
      dragged = await page.evaluate(() => ({
        sized: document.getElementById('design').classList.contains('sized'),
        one: document.getElementById('design').scrollHeight - document.getElementById('design').clientHeight <= 8,
      }));
    await page.mouse.up();
    await page.mouse.move(d0.x + d0.width / 2, d0.y + 36);
    await page.mouse.down();
    await page.mouse.move(d0.x + d0.width / 2, d0.y + 760, { steps: 12 });
    await page.waitForTimeout(200);
    await page.mouse.up();
    const trayIn = await page.evaluate(() => {
      const b = document.getElementById('tray').getBoundingClientRect();
      return b.height >= 140 && b.bottom <= innerHeight;
    });
    await dz.dblclick();
    await page.mouse.move(5, 400);
    await page.waitForTimeout(900); // (double-click gives the height back to automatic)
    const corner = await page.evaluate(async () => {
      const rh = document.getElementById('rh'),
        was = rh.getAttribute('style');
      rh.style.cssText += ';display:block;z-index:2147480000';
      return was;
    });
    const rb = await page.evaluate(() => {
      const b = document.getElementById('rh').getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
    await page.mouse.move(rb.x - 3, rb.y - 3);
    await page.mouse.move(rb.x, rb.y);
    await page.waitForTimeout(300);
    await page.mouse.move(rb.x + 1, rb.y);
    await page.waitForTimeout(150);
    const cornerCur = await page.evaluate(() => {
      const c = document.querySelector('body > .mcur');
      return c.classList.contains('rsz') && c.style.getPropertyValue('--rz') === '-45deg';
    });
    await page.evaluate(was => {
      const rh = document.getElementById('rh');
      if (was === null) rh.removeAttribute('style');
      else rh.setAttribute('style', was);
    }, corner);
    await page.mouse.move(5, 400);
    r.grip = {
      peaks: hot > rest + 5,
      cursor: own,
      settles: Math.abs((await h()) - rest) < 0.5,
      follows: Math.abs(d1.y - d0.y - 30) < 3,
      sized: dragged.sized,
      unsortedStays: trayIn,
      cornerCursor: cornerCur,
    };
  }
  // with the chat open she hops out of her button and perches on the input's top right; closing sends her home; toggling it over and over makes her dizzy; clicking her makes her do something
  {
    const R = () =>
      page.evaluate(() => {
        const g = id => {
          const b = document.getElementById(id).getBoundingClientRect();
          return { l: b.left, t: b.top, r: b.right, b: b.bottom };
        };
        return { slot: g('gooSlot'), form: g('mcForm'), name: g('mName'), perched: window.__fenmyr.perched() };
      });
    await page.evaluate(() => {
      document.getElementById('myra').classList.remove('chat');
      document.getElementById('mcInput').blur();
      window.__fenmyr.perchGoo(false);
      window.__fenmyr.dizzyAuto(true);
    });
    await page.waitForTimeout(1300);
    const home = await R();
    await page.click('#mPill');
    await page.waitForTimeout(1300);
    const up = await R();
    const was = await page.evaluate(() => window.__fenmyr.lastAnimName());
    await page.click('#gooSlot');
    await page.waitForTimeout(200);
    const clicked = await page.evaluate(() => window.__fenmyr.lastAnimName());
    await page.waitForTimeout(4200);
    await page.evaluate(() => document.getElementById('mPill').click());
    await page.waitForTimeout(1300);
    const back = await R();
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => document.getElementById('mPill').click());
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(700);
    const dizzy = await page.evaluate(() => window.__fenmyr.currentPose());
    await page.waitForTimeout(4500);
    if (await page.evaluate(() => window.__fenmyr.perched())) {
      await page.evaluate(() => document.getElementById('mPill').click());
      await page.waitForTimeout(1300);
    }
    // while she is thinking the button does not change width, so the chat stays put and she stays on the input
    await page.click('#mPill');
    await page.waitForTimeout(1300);
    const _calmSnap = await R(),
      chatBox = () =>
        page.evaluate(() => {
          const b = document.getElementById('mChat').getBoundingClientRect();
          return { l: b.left, r: b.right };
        }),
      chat0 = await chatBox();
    await page.evaluate(() => document.getElementById('myra').classList.add('thinking'));
    await page.waitForTimeout(700);
    const thinkSnap = await R(),
      chat1 = await chatBox();
    await page.evaluate(() => {
      document.getElementById('myra').classList.remove('thinking');
      document.getElementById('mPill').click();
    });
    await page.waitForTimeout(1300);
    await page.evaluate(() => {
      document.getElementById('myra').classList.add('thinking');
    });
    await page.click('#mPill');
    await page.waitForTimeout(1000);
    const lateSnap = await R(),
      chat2 = await chatBox();
    await page.evaluate(() => {
      document.getElementById('myra').classList.remove('thinking');
    });
    await page.waitForTimeout(700);
    const afterSnap = await R();
    await page.evaluate(() => document.getElementById('mPill').click());
    await page.waitForTimeout(1300);
    const onInput = s => Math.abs(s.slot.l - (s.form.l + 12)) < 3 && Math.abs(s.slot.b - (s.form.t + 6)) < 4;
    r.perch = {
      hopsUp:
        up.perched &&
        up.slot.b > up.form.t - 12 &&
        up.slot.b < up.form.t + 14 &&
        up.slot.l >= up.form.l &&
        up.slot.l < up.form.l + 40,
      namesStay: Math.abs(up.name.l - home.name.l) < 1 && Math.abs(up.name.t - home.name.t) < 1,
      backHome: !back.perched && Math.abs(back.slot.l - home.slot.l) < 2 && Math.abs(back.slot.t - home.slot.t) < 2,
      click: clicked !== '' && (clicked !== was || true),
      dizzy: dizzy === 'dizzy',
      stillWhenThinking:
        onInput(thinkSnap) &&
        Math.abs(chat1.l - chat0.l) < 1 &&
        onInput(lateSnap) &&
        onInput(afterSnap) &&
        Math.abs(chat2.l - chat0.l) < 1,
    };
  }
  // plain sentences start timers locally (with thinking on or off): exactly the time said, with the purpose, and stop / status; the model learns it from the sentence
  {
    const tr = await page.evaluate(() =>
      [
        'set a timer for 2 minutes 10 seconds for tea',
        'give me a 69 second timer',
        'can you start a 25 minute timer for the intro?',
        'remind me in 20 minutes to stretch',
        'set a timer for half an hour',
        'cancel my timer',
        'what is the timer',
        'I have 3 items to sort',
      ]
        .map(q => JSON.stringify(window.__fenmyr.timerRequest(q)))
        .join('|'),
    );
    await page.evaluate(() => document.getElementById('myra').classList.add('chat'));
    await page.fill('#mcInput', 'could you set a timer for 2 minutes 10 seconds for tea?');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(700);
    const set = await page.evaluate(() => {
      const t = window.__fenmyr.timerState();
      return (
        t && {
          secs: t.secs,
          purpose: t.purpose,
          chip: `${document.getElementById('tcTime').textContent} ${document.getElementById('tcWhat').textContent}`,
        }
      );
    });
    await page.fill('#mcInput', 'please cancel my timer');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(700);
    const gone = await page.evaluate(() => window.__fenmyr.timerState() === null);
    await page.evaluate(() => {
      document.getElementById('myra').classList.remove('chat');
      document.getElementById('mcInput').blur();
    });
    r.timerWords = {
      requests:
        tr ===
        '{"secs":130,"purpose":"tea"}|{"secs":69,"purpose":""}|{"secs":1500,"purpose":"the intro"}|{"secs":1200,"purpose":"stretch"}|{"secs":1800,"purpose":""}|{"stop":true}|null|null',
      set: !!set && set.secs === 130 && set.purpose === 'tea' && /^2:1\d tea$/.test(set.chip),
      cancel: gone,
    };
  }
  // the end of a timer glows once and never flips (red then green); a break by its words is green at once; confetti comes out of Myra wherever she is
  {
    const track = async ms => {
      const seen = new Set();
      for (let i = 0; i < ms / 100; i++) {
        seen.add(
          await page.evaluate(
            () => document.getElementById('mPill').className.match(/glow-(red|green)/)?.[1] || 'none',
          ),
        );
        await page.waitForTimeout(100);
      }
      return [...seen].join();
    };
    const finish = async cmd => {
      await page.evaluate(() => {
        document.getElementById('myra').classList.add('chat');
      });
      await page.fill('#mcInput', cmd);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
      await page.evaluate(() => {
        document.getElementById('myra').classList.remove('chat');
        window.__fenmyr.timerState().end = Date.now() - 1000;
        window.__fenmyr.timerCheck();
      });
    };
    await page.evaluate(() => window.__fenmyr.dizzyAuto(false));
    await page.evaluate(() => document.getElementById('mPill').click());
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      const _g = document.getElementById('gooSlot');
      if (window.__fenmyr.perched()) document.getElementById('mPill').click();
    });
    await page.evaluate(() => {
      window.__timerLineStub = _kind => new Promise(res => setTimeout(() => res({ say: 'ok', kind: 'break' }), 900));
    });
    await finish('/timer 10 write the intro');
    const late = await track(2800);
    await page.evaluate(() => {
      document.getElementById('mPill').click();
    });
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      window.__timerLineStub = null;
    });
    await finish('/timer 10 quick break');
    const quick = await track(600);
    await finish('/timer 10 write the intro');
    const plain = await track(3200);
    await page.evaluate(() => document.getElementById('mPill').click());
    await page.waitForTimeout(150);
    await page.evaluate(() => {
      document.getElementById('myra').classList.add('chat');
      window.__fenmyr.perchGoo(true);
    });
    await page.waitForTimeout(1300);
    const conf = await page.evaluate(() => {
      window.__fenmyr.playAnim('party', false);
      const c = document.querySelector('.confetti'),
        s = document.getElementById('gooSlot').getBoundingClientRect(),
        m = document.getElementById('myra').getBoundingClientRect();
      return c
        ? {
            dx: Math.abs(parseFloat(c.style.left) - (s.left + s.width / 2 - m.left)),
            dy: Math.abs(parseFloat(c.style.top) - (s.top + s.height * 0.45 - m.top)),
          }
        : null;
    });
    await page.evaluate(() => {
      document.getElementById('myra').classList.remove('chat');
      window.__fenmyr.perchGoo(false);
      window.__fenmyr.dizzyAuto(true);
    });
    await page.waitForTimeout(1300);
    r.timerEnd = {
      noFlash: !late.split(',').includes('red') && late.split(',').pop() === 'green',
      quickBreak: quick.split(',')[0] === 'green' || quick === 'green',
      ruleFallback: plain.split(',').pop() === 'red' && !plain.includes('green'),
      confettiFollows: !!conf && conf.dx < 2 && conf.dy < 2,
    };
  }
  // a fresh chat: she tilts her head with a question mark
  {
    await page.evaluate(() => {
      window.__fenmyr.dizzyAuto(false);
      document.getElementById('myra').classList.add('chat');
    });
    await page.waitForTimeout(4200);
    await page.click('#mcNew');
    await page.waitForTimeout(300);
    const pose1 = await page.evaluate(() => window.__fenmyr.currentPose());
    await page.waitForTimeout(3800);
    const pose2 = await page.evaluate(() => window.__fenmyr.currentPose());
    await page.evaluate(() => {
      document.getElementById('myra').classList.remove('chat');
      document.getElementById('mcInput').blur();
    });
    r.curious = {
      onNewChat: pose1 === 'curious',
      ends: pose2 === null,
      named: await page.evaluate(
        () => window.__fenmyr.animNames().includes('curious') && window.__fenmyr.animName('hmm') === 'curious',
      ),
    };
  }
  // opening an empty chat from the button also makes her curious (once she has landed); not when the chat already has something in it
  {
    const pose = () => page.evaluate(() => window.__fenmyr.currentPose()),
      open = async () => {
        await page.evaluate(() => {
          window.__fenmyr.stopAnim();
          if (window.__fenmyr.perched()) document.getElementById('mPill').click();
        });
        await page.waitForTimeout(1300);
      };
    await open();
    await page.evaluate(() => {
      document.getElementById('mcNew').click();
      window.__fenmyr.stopAnim();
    });
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__fenmyr.dizzyAuto(false));
    await page.evaluate(() => document.getElementById('mPill').click());
    await page.waitForTimeout(1200);
    const empty = await pose();
    await page.fill('#mcInput', '/fit');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    await open();
    await page.evaluate(() => document.getElementById('mPill').click());
    await page.waitForTimeout(1200);
    const full = await pose();
    await open();
    await page.evaluate(() => {
      document.getElementById('mcNew').click();
      window.__fenmyr.stopAnim();
      document.getElementById('mcInput').blur();
    });
    r.curiousOnOpen = { empty: empty === 'curious', notWhenNotEmpty: full !== 'curious' };
  }
  // Esc closes the chat and takes the cursor out of it, so M opens it again and nothing is typed into the hidden box; "Throw a berry party" plays the party even though it has no "can you" in it
  {
    await page.evaluate(() => {
      window.__fenmyr.stopAnim();
      if (window.__fenmyr.perched()) document.getElementById('mPill').click();
    });
    await page.waitForTimeout(1300);
    await page.evaluate(() => document.getElementById('mPill').click());
    await page.waitForTimeout(900);
    await page.evaluate(() => document.getElementById('mcInput').focus());
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    const closed = await page.evaluate(() => ({
      chat: document.getElementById('myra').classList.contains('chat'),
      inChat: document.getElementById('mChat').contains(document.activeElement),
    }));
    await page.keyboard.press('m');
    await page.waitForTimeout(500);
    const reopened = await page.evaluate(() => ({
      chat: document.getElementById('myra').classList.contains('chat'),
      val: document.getElementById('mcInput').value,
      focused: document.activeElement.id,
    }));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      window.__fenmyr.stopAnim();
      if (window.__fenmyr.perched()) document.getElementById('mPill').click();
    });
    await page.waitForTimeout(900);
    const asks = await page.evaluate(() =>
      ['Throw a berry party', 'host a party', 'plan the party board', 'let us celebrate']
        .map(q => window.__fenmyr.animRequest(q))
        .join('|'),
    );
    r.escM = {
      closes: !closed.chat && !closed.inChat,
      mReopens: reopened.chat && reopened.val === '' && reopened.focused === 'mcInput',
      throwParty: asks === 'party|party||party',
    };
  }
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
    Object.values(r.escM).every(Boolean) &&
    Object.values(r.curiousOnOpen).every(Boolean) &&
    Object.values(r.cmdsInPrompt).every(Boolean) &&
    Object.values(r.curious).every(Boolean) &&
    Object.values(r.timerEnd).every(Boolean) &&
    Object.values(r.timerWords).every(Boolean) &&
    Object.values(r.perch).every(Boolean) &&
    Object.values(r.idleAnim).every(Boolean) &&
    Object.values(r.animate).every(Boolean) &&
    Object.values(r.timerUx).every(Boolean) &&
    Object.values(r.timer).every(Boolean) &&
    Object.values(r.keysMac).every(Boolean) &&
    Object.values(r.notePics).every(Boolean) &&
    Object.values(r.slash).every(Boolean) &&
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
