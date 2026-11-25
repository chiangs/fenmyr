// The selection bar offers Add a label only for a card that shows its label. Every card on the board carries a label,
// and for each one the bar offers, the label must be on screen. Wireframe pieces hide theirs, so the bar must not offer
// it for them (#443).
import assert from 'node:assert';
import { everyOfflineCard } from './fixtures/boards.ts';
import { launch } from './support/launch.ts';
import { still } from './support/settled.ts';

const board = everyOfflineCard();
for (const c of board.cards) Object.assign(c, { tagText: 'Label' });

const l = await launch({ boards: [board], open: 'every' });
const { page } = l;
await still(page);

const wrong: string[] = [];
const offeredFor: string[] = [];
for (const c of board.cards) {
  await page.evaluate(id => window.__fenmyr.selectOnly([id]), c.id);
  await still(page);
  const seen = await page.evaluate(id => {
    const offered = !!document.querySelector('#selbar.on [data-sb="tag"]'),
      tag = document.querySelector(`.card[data-id="${id}"] .tag`),
      box = tag?.getBoundingClientRect(),
      shown = !!tag && !!box && box.width > 0 && box.height > 0 && getComputedStyle(tag).visibility !== 'hidden';
    return { offered, shown };
  }, c.id);
  if (seen.offered) offeredFor.push(c.type);
  if (seen.offered && !seen.shown) wrong.push(`${c.id} (${c.type})`);
}

await l.close();
assert.ok(offeredFor.includes('note'), 'a note is still offered a label');
assert.deepStrictEqual(wrong, [], `the bar offers a label these cards never show: ${wrong.join(', ')}`);
console.log(`labelOffered: ok, ${offeredFor.length} cards offered a label, each shows it`);
