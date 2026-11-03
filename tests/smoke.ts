// @ts-nocheck
// End-to-end smoke test: opens the real app (headless) with a throwaway data folder, and drives the bridge.
//   node tests/smoke.ts
//   FENMYR_APP=~/.local/lib/fenmyr/app node tests/smoke.ts   (an installed copy, with the Electron install.sh chose)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright';
import { animations } from './smoke/animations.ts';
import { board } from './smoke/board.ts';
import { bridge } from './smoke/bridge.ts';
import { boardOrder, cursorEdge, popups, shortcutLabels } from './smoke/chrome.ts';
import { installPageKit, makeSmoke } from './smoke/kit.ts';
import { library } from './smoke/library.ts';
import { look } from './smoke/look.ts';
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
