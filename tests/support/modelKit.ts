// What the tests of Myra's model picker share: the pill and menu read and driven in the real app, and a message sent
// through a stand-in Claude Code that says which --model and --effort it was run with.
import { askStandIn, flagsOf } from './askStandIn.ts';
import type { Launched } from './launch.ts';
import { still } from './settled.ts';

export const MODELS = ['Opus 5.5', 'Fable 5.2', 'Sonnet 5.5', 'Haiku 5.5'];
export const LEVELS = ['Low', 'Medium', 'High', 'Extra', 'Max'];
export const FOLLOWS = 'Default follows your Claude Code settings.';
export const NO_FLAGS = { model: undefined, effort: undefined };

export async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}

export function modelKit(l: Launched) {
  const { page } = l;
  const { sentFor, sentAbout, send } = askStandIn(l);
  const pillText = () => page.evaluate(() => document.getElementById('mcModelText')?.textContent ?? null);
  const attr = (sel: string, name: string) =>
    page.evaluate(([s, n]) => document.querySelector(s ?? '')?.getAttribute(n ?? '') ?? null, [sel, name]);
  const count = (sel: string) => page.locator(sel).count();
  const names = (sel: string) => page.locator(`${sel} .mm-name`).allTextContents();
  // the choice as the settings keep it, or null for none
  const saved = () =>
    page.evaluate(() => {
      const raw: unknown = JSON.parse(localStorage.getItem('fenmyr:settings') ?? '{}');
      return typeof raw === 'object' && raw !== null && 'myraModel' in raw ? raw.myraModel : null;
    });
  async function ask(q: string) {
    const before = await count('#mcList .mc-msg.myra');
    await send(q);
    const run = await sentFor(q);
    await page.waitForFunction(
      n =>
        document.querySelectorAll('#mcList .mc-msg.myra').length > n &&
        !document.querySelector('#mcList .mc-msg.typing'),
      before,
    );
    return flagsOf(run.args);
  }
  async function openMenu() {
    await page.click('#mcModel');
    await page.waitForSelector('#mcModelMenu');
    await still(page);
  }
  const pickModel = async (name: string) => {
    await openMenu();
    await page.locator('#mcModelMenu [role="menuitemradio"]', { hasText: name }).click();
    await still(page);
  };
  // an effort from the flyout, by its name: Default or a level
  const pickEffort = async (name: string) => {
    await openMenu();
    await page.click('#mcModelMenu .mm-effort');
    await page.waitForSelector('.mc-modelfly');
    await still(page);
    await page.locator('.mc-modelfly [role="menuitemradio"]', { hasText: name }).click();
    await still(page);
  };
  const press = async (...keys: string[]) => {
    for (const k of keys) await page.keyboard.press(k);
  };
  return { pillText, attr, count, names, saved, ask, openMenu, pickModel, pickEffort, press, sentAbout };
}
