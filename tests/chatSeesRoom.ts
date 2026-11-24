// The room in the "Myra sees" strip at the top of Myra's chat, in the real app: the chips have at least 8 px below them
// as they have above, and a strip of many chips still shows two rows and the top 10 px of a third, scrolls, and has the
// same room below its last row once scrolled to it.
import assert from 'node:assert';
import { replyBoard } from './fixtures/boards.ts';
import { launch } from './support/launch.ts';
import { rect, still } from './support/settled.ts';

const ROOM = 8,
  GLIMPSE = 10;

const l = await launch({ boards: [replyBoard('room', 'Room')], open: 'room', claude: true });
const { page } = l;

async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
  } catch (e) {
    console.error(`FAIL ${name}`);
    throw e;
  }
}

const strip = () => rect(page, '#mcSees');
const bottomOf = (r: { y: number; height: number }) => r.y + r.height;

await page.click('#mPill');
await page.waitForFunction(() => document.getElementById('mChat')?.checkVisibility({ visibilityProperty: true }));
await still(page);

await check('the chips have as much room below them as above', async () => {
  const box = await strip(),
    chip = await rect(page, '#mcSees .mcs-chip.board');
  assert.strictEqual(chip.y - box.y, ROOM, 'room above the chips');
  assert.ok(
    bottomOf(box) - bottomOf(chip) >= ROOM,
    `the chips end ${bottomOf(box) - bottomOf(chip)} px above the strip's bottom edge, not ${ROOM} or more`,
  );
});

// each name is as wide as the chat, so each chip fills a row of its own and the strip has more rows than it shows
await page.evaluate(() => {
  const dt = new DataTransfer();
  for (const n of [1, 2, 3, 4]) {
    const name = `a-picture-with-a-name-so-long-that-it-takes-a-whole-row-of-the-strip-number-${n}.png`;
    dt.items.add(new File([new Uint8Array([0])], name, { type: 'image/png' }));
  }
  document.getElementById('mcInput')?.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
});
await page.waitForFunction(() => document.querySelectorAll('#mcSees [data-chip="added"]').length === 4);
await still(page);

// the chips and + Add, top to bottom: the board chip, the four added ones, + Add. The lead sits in the middle of a row, so it
// is left out
const children = async () => {
  const n = await page.locator('#mcSees > :not(.mcs-lead)').count();
  return Promise.all(Array.from({ length: n }, (_, i) => rect(page, `#mcSees > :not(.mcs-lead):nth-child(${i + 2})`)));
};
// where each row starts, top to bottom
const rowTops = (kids: { y: number }[]) => [...new Set(kids.map(k => Math.round(k.y)))];

await check('with many chips the third row shows its top 10 px, and the strip scrolls', async () => {
  const [box, kids] = [await strip(), await children()],
    tops = rowTops(kids);
  assert.ok(tops.length >= 3, `the chips make ${tops.length} rows, not three or more`);
  const third = kids.find(k => Math.round(k.y) === tops[2]);
  assert.ok(third, 'a chip starts the third row');
  const shown = bottomOf(box) - third.y;
  assert.ok(shown >= GLIMPSE, `the third row shows ${shown} px of itself, not ${GLIMPSE} or more`);
  assert.ok(shown < third.height, `and only a glimpse of it, not the ${shown} px of ${third.height}`);
  const { client, scroll } = await page.evaluate(() => {
    const el = document.getElementById('mcSees');
    return { client: el?.clientHeight ?? 0, scroll: el?.scrollHeight ?? 0 };
  });
  assert.ok(scroll > client, `the strip holds ${scroll} px in ${client}, so it scrolls`);
});

await check('scrolled to its end, the last row has the same room below it', async () => {
  await page.evaluate(() => document.getElementById('mcSees')?.scrollTo({ top: 1e6, behavior: 'instant' }));
  const [box, kids] = [await strip(), await children()],
    add = kids.at(-1);
  assert.ok(add, 'the strip ends with + Add');
  assert.ok(
    bottomOf(box) - bottomOf(add) >= ROOM,
    `+ Add ends ${bottomOf(box) - bottomOf(add)} px above the strip's bottom edge, not ${ROOM} or more`,
  );
});

assert.deepStrictEqual(l.errors, [], 'no page errors');
await l.close();
console.log('SEES ROOM OK');
