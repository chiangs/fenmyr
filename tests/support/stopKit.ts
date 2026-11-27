// What the tests of Stop share: the stand-in Claude Code, and the page's send button, chat and bridge as they show.
import assert from 'node:assert';
import { setTimeout as pause } from 'node:timers/promises';
import { askStandIn } from './askStandIn.ts';
import { alive } from './buildStandIn.ts';
import type { Launched } from './launch.ts';

export const LINE = 'Okay, I’ve stopped.';

export async function stopKit(l: Launched) {
  const { page } = l;
  const stand = askStandIn(l);
  const { started } = stand;
  const until = async (what: string, ok: () => boolean | Promise<boolean>) => {
    for (const end = Date.now() + 20000; Date.now() < end; await pause(50)) if (await ok()) return;
    assert.fail(`never happened: ${what}`);
  };
  const begun = (q: string) => started().find(s => s.q.endsWith(q));
  const running = async (q: string) => {
    await until(`${q} reached Claude Code`, () => !!begun(q));
    return begun(q)?.pid ?? 0;
  };

  // The send button as it shows: its state, its name and tip, and how much of each glyph is there.
  const button = (where = '.mc-send') =>
    page.evaluate(sel => {
      const b = document.querySelector(sel);
      if (!(b instanceof HTMLElement)) throw new Error(`no ${sel}`);
      const shown = (g: string) => Number(getComputedStyle(b.querySelector(g) ?? b).opacity);
      return {
        stop: b.classList.contains('stop'),
        label: b.getAttribute('aria-label'),
        tip: b.dataset.tip,
        arrow: shown('.ms-go'),
        square: shown('.ms-stop'),
        title: b.getAttribute('title'),
      };
    }, where);
  const asStop = (where?: string) =>
    page.waitForFunction(sel => document.querySelector(sel ?? '.mc-send')?.classList.contains('stop'), where);
  const asSend = (where?: string) =>
    page.waitForFunction(sel => document.querySelector(sel ?? '.mc-send')?.classList.contains('stop') === false, where);
  const mac = await page.evaluate(() => window.Fenmyr.platform === 'mac');
  const TIP = { send: mac ? 'Send (⌘↩)' : 'Send (Ctrl+Enter)', stop: mac ? 'Stop (⌘.)' : 'Stop (Ctrl+.)' };

  // a question typed while she works goes behind, as Enter in the box does
  const queue = async (words: string) => {
    await page.fill('#mcInput', words);
    await page.press('#mcInput', 'Control+Enter');
  };
  const mine = () =>
    page.locator('#mcList .mc-msg.me').evaluateAll(els =>
      els.map(e => ({
        words: e.firstChild?.textContent ?? '',
        mark: e.querySelector('.mc-stopped')?.textContent ?? null,
      })),
    );
  const said = () => page.locator('#mcList .mc-msg.myra:not(.typing)').allTextContents();
  const lines = async (text: string) => (await said()).filter(t => t === text).length;
  const cards = () => page.evaluate(() => JSON.stringify(window.__fenmyr.board.cards));
  const inBox = () => page.inputValue('#mcInput');
  const heard = () => page.evaluate(() => document.getElementById('mcSendSay')?.textContent ?? '');
  const gone = (pid: number) => until(`the process ${pid} ends`, () => !alive(pid));
  // What the bridge's askStop answered, as the window asked it, and how many questions the bridge has answered or failed.
  // While `lost` is set a stop reaches nothing, as when the process had already ended and its answer is in the post.
  const watchBridge = () =>
    page.evaluate(() => {
      const stop = window.Fenmyr.askStop,
        ask = window.Fenmyr.ask,
        calls: [string, boolean][] = [];
      Reflect.set(window, 'stops', calls);
      Reflect.set(window, 'ended', 0);
      window.Fenmyr.askStop = async id => {
        const stopped = Reflect.get(window, 'lost') ? false : await stop(id);
        calls.push([id, stopped]);
        return stopped;
      };
      window.Fenmyr.ask = (...args) =>
        ask(...args).finally(() => Reflect.set(window, 'ended', Number(Reflect.get(window, 'ended')) + 1));
    });
  const lose = (on: boolean) => page.evaluate(on => Reflect.set(window, 'lost', on), on);
  const ended = (): Promise<number> => page.evaluate(() => Number(Reflect.get(window, 'ended')));
  const stops = (): Promise<[string, boolean][]> => page.evaluate(() => Reflect.get(window, 'stops'));
  const forget = () => page.evaluate(() => Reflect.get(window, 'stops').splice(0));
  return {
    ...stand,
    until,
    begun,
    running,
    button,
    asStop,
    asSend,
    TIP,
    queue,
    mine,
    said,
    lines,
    cards,
    inBox,
    heard,
    gone,
    watchBridge,
    lose,
    ended,
    stops,
    forget,
  };
}
