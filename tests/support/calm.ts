// still() for a board whose view has just moved. The view's "moving" flag is a timer, not an animation, so still() does
// not see it, and the picker, the selection bar and the hints wait for it before they settle where they will rest.
import type { Page } from 'playwright';
import { still } from './settled.ts';

export async function calm(page: Page): Promise<void> {
  // the flag goes up in the first step of a glide, a frame after the call that starts it
  await still(page);
  await page.waitForFunction(() => !document.getElementById('stage')?.classList.contains('moving'));
  await still(page);
}
