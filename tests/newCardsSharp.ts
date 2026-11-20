// A card that has just been made is drawn sharp once its pop-in is over. The pop animation used to hold its end state for as
// long as the card lived, which kept the card on a layer of its own; a tilted card on one is drawn from a rotated bitmap, so a
// new note and a pasted picture stayed soft on a zoomed-in board. This makes both, waits out the pop, and checks that no
// animation is left on any card and that taking the pop class off changes no pixel of the tilted card.
import assert from 'node:assert';
import type { Page } from 'playwright';
import { launch, settle } from './support/launch.ts';

const note = { id: 'n', type: 'note', x: 0, y: 0, w: 220, h: 120, r: 0, color: 'white', text: 'An old note' };
const board = { id: 'b', name: 'B', cards: [note], links: [], tray: [], view: { x: 400, y: 200, z: 2 } };

// a picture pasted on the board, as the clipboard hands it over
const pastePicture = (page: Page) =>
  page.evaluate(async () => {
    const c = Object.assign(document.createElement('canvas'), { width: 40, height: 30 });
    const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/png'));
    if (!blob) throw new Error('no picture');
    const data = new DataTransfer();
    data.items.add(new File([blob], 'pasted.png', { type: 'image/png' }));
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });

// how many pixels differ between two screenshots, read back through a canvas
const differing = (page: Page, a: Buffer, b: Buffer) =>
  page.evaluate(
    async ([a, b]) => {
      const read = async (s: string) => {
        const img = new Image();
        img.src = `data:image/png;base64,${s}`;
        await img.decode();
        const c = Object.assign(document.createElement('canvas'), { width: img.width, height: img.height }),
          ctx = c.getContext('2d');
        if (!ctx) throw new Error('no canvas');
        ctx.drawImage(img, 0, 0);
        return ctx.getImageData(0, 0, c.width, c.height).data;
      };
      const [da, db] = await Promise.all([read(a ?? ''), read(b ?? '')]);
      let n = 0;
      for (let i = 0; i < da.length; i += 4)
        if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2]) n++;
      return { n, total: da.length / 4 };
    },
    [a.toString('base64'), b.toString('base64')],
  );

const l = await launch({ boards: [board], open: 'b', settings: { tilt: true } });
try {
  const { page } = l;
  await settle(page);
  // a note the way a person makes one: a double-click on empty board, then typing
  await page.mouse.dblclick(900, 600);
  await page.keyboard.type('a new note');
  await page.keyboard.press('Escape');
  await page.mouse.click(200, 700);
  await pastePicture(page);
  // the pop lasts half a second
  await page.waitForTimeout(1500);

  const cards = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('#cards .card')].map(el => ({
      id: el.dataset.id ?? '',
      type: [...el.classList].find(c => c === 'note' || c === 'image') ?? '',
      popped: el.classList.contains('pop'),
      animations: el
        .getAnimations()
        .map(a => `${a instanceof CSSAnimation ? a.animationName : 'an animation'}: ${a.playState}`),
    })),
  );
  const made = cards.filter(c => c.popped);
  assert.ok(
    made.some(c => c.type === 'note') && made.some(c => c.type === 'image'),
    `a new note and a pasted picture were made with the pop: ${JSON.stringify(cards)}`,
  );
  for (const c of cards) assert.deepStrictEqual(c.animations, [], `card ${c.id} (${c.type}) has no animation left`);

  // the new note, drawn with the pop class and without it, is the same picture
  const box = await page.evaluate(() => {
    const el = [...document.querySelectorAll<HTMLElement>('#cards .card.note')].find(e => e.classList.contains('pop'));
    const r = el?.getBoundingClientRect();
    return r ? { x: r.left, y: r.top, width: r.width, height: r.height } : null;
  });
  assert.ok(box, 'the new note is on the board');
  const clip = { x: box.x - 10, y: box.y - 10, width: box.width + 20, height: box.height + 20 };
  await page.mouse.move(1300, 800);
  const withPop = await page.screenshot({ clip });
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('#cards .card.pop')) el.classList.remove('pop');
  });
  await page.waitForTimeout(500);
  const without = await page.screenshot({ clip });
  const d = await differing(page, withPop, without);
  assert.strictEqual(d.n, 0, `taking the pop class off changes ${d.n} of ${d.total} pixels of the new note`);
  assert.deepStrictEqual(l.errors, [], 'no page errors');
  console.log('newCardsSharp: ok');
} finally {
  await l.close();
}
