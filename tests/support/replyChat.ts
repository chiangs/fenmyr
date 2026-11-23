// What the tests of Myra's replies do to feed one in and read where her line landed: Claude's answer, asking the real
// way, and the open board's chat as stored and as drawn.
import type { Page } from 'playwright';
import { still } from './settled.ts';

export function replyChat(page: Page) {
  // Claude's answer, every time it is asked
  const answer = (reply: object) =>
    page.evaluate(r => {
      window.Fenmyr.ask = async () => JSON.stringify(r);
    }, reply);
  // asked the real way, and settled once her answer has landed
  async function ask(q: string) {
    await page.evaluate(q => window.__fenmyr.ask(q), q);
    await still(page);
  }
  // The open board's chat as stored and as drawn, once the drawing has caught up with the board that just opened
  async function chat() {
    await page.waitForFunction(() => {
      const b = window.__fenmyr.curBoard(),
        drawn = [...document.querySelectorAll('#mcList .mc-msg:not(.typing)')].map(
          d => d.firstChild?.textContent ?? '',
        );
      return JSON.stringify(drawn) === JSON.stringify((b.chat ?? []).map(m => m.text));
    });
    await still(page);
    return page.evaluate(() => {
      const b = window.__fenmyr.curBoard();
      return { id: b.id, name: b.name, stored: (b.chat ?? []).map(m => `${m.who}: ${m.text}`) };
    });
  }
  // a board's chat as it is on disk, whether or not it is open
  const diskChat = (id: string) =>
    page.evaluate(async b => ((await window.Fenmyr.load(b))?.chat ?? []).map(m => `${m.who}: ${m.text}`), id);
  return { answer, ask, chat, diskChat };
}
