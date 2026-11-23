import type { Page } from 'playwright';
import { still } from '../tests/support/settled.ts';
import type { Group, Step } from './visual-myra.ts';

// Settings → About with the update check answered as an install made from a clone answers it, since the app runs from
// a checkout here and a checkout has no channel. The Updates line is shown, unlike in the other states, because what it
// says is the point; a base without the Channel row shows the same section without it.
const SHOW_LINE = '#suSub { visibility: visible !important; }';
const clone = (channel: string, more: Record<string, unknown> = {}) => ({
  repo: true,
  since: '2026-11-21',
  notes: [],
  behind: 0,
  channel,
  ...more,
});
const checking = (page: Page) =>
  page.waitForFunction(() => !/Checking/.test(document.getElementById('suSub')?.textContent ?? ''));
const about =
  (answer: Record<string, unknown>, choose?: string): Step =>
  async page => {
    // the app's own check, a few seconds after it opens, must finish first or it would answer over this one
    await checking(page);
    await page.addStyleTag({ content: SHOW_LINE });
    if (!(await page.locator('#settings.on').count())) await page.click('#gearBtn');
    await page.locator('#setTabs [data-tab="about"]').click();
    await page.evaluate(
      ([a, c]) => {
        Reflect.set(Fenmyr, 'updateCheck', async () => a);
        const pick = c ? document.querySelector<HTMLElement>(`#suChannel [data-v="${c}"]`) : null;
        (pick ?? document.getElementById('suCheck'))?.click();
      },
      [answer, choose] as const,
    );
    await checking(page);
    await still(page);
  };

export const CHANNEL_GROUPS: Record<string, Group> = {
  channel: { states: [['about', about(clone('stable', { latest: 'v1.0.0' }))]] },
  'channel-beta': {
    version: '1.1.0-beta.2',
    states: [
      ['about', about(clone('beta', { latest: 'v1.1.0-beta.2' }))],
      ['ready', about(clone('beta', { behind: 1, latest: 'v1.1.0-beta.3', notes: ['A new thing to try'] }))],
      ['stable', about(clone('stable', { latest: 'v1.0.0' }), 'stable')],
    ],
  },
};
