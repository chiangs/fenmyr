// Myra's chat on a prototype board: docked open on the right, her replies inside it, the input's height grip, pictures
// pasted into it going on the board, and no way to close it.
import assert from 'node:assert';
import fs from 'node:fs';
import { launch } from './support/launch.ts';
import { freshRepo, openPrototype } from './support/prototype.ts';

const { work, repo } = freshRepo('fenmyr-proto-chat-');
const note = { id: 'n1', type: 'note', x: 40, y: 40, w: 220, h: 120, text: 'People miss the promo field' };
const l = await launch({ boards: [{ id: 'plain', name: 'Plain', cards: [note], links: [], tray: [] }], open: 'plain' });
const { page } = l;

try {
  await openPrototype(page, repo);
  await page.waitForFunction(() => window.__fenmyr?.curBoard()?.id === 'pb');
  await page.waitForTimeout(800);

  const places = await page.evaluate(() => {
    const r = (s: string) => document.querySelector(s)?.getBoundingClientRect();
    return {
      boardLeft: r('[data-p="canvas"]')?.left,
      chatLeft: r('#prChat')?.left,
      codeRight: r('[data-p="code"]')?.right,
      pill: getComputedStyle(document.getElementById('mPill') ?? document.body).display,
      gooInHeader: !!document.querySelector('#prChat .mc-head #gooSlot'),
    };
  });
  assert.ok(
    (places.boardLeft ?? 99) < 5 && (places.chatLeft ?? 0) >= (places.codeRight ?? 9e9),
    'the board is on the left and Myra on the right',
  );
  assert.ok(places.pill === 'none' && places.gooInHeader, 'her button is gone and she sits in the chat header');
  assert.match(
    await page.evaluate(() => document.getElementById('mcList')?.textContent ?? ''),
    /What are we building\?[\s\S]*the preview runs what I build, and the code pane shows its files/,
    'she asks what she’s building',
  );

  await page.evaluate(() => window.__fenmyr.applyMyra({ say: 'A reply for the chat.', next: ['Build it'] }, 'hello'));
  await page.waitForTimeout(300);
  assert.match(
    await page.evaluate(() => document.getElementById('mcList')?.textContent ?? ''),
    /A reply for the chat\./,
    'her replies land in the chat',
  );
  const inside = await page.evaluate(() => {
    const m = [...document.querySelectorAll('#mcList .mc-msg.myra')].pop()?.getBoundingClientRect(),
      c = document.getElementById('mcList')?.getBoundingClientRect();
    return !!m && !!c && m.left >= c.left && m.right <= c.right && m.top >= c.top && m.bottom <= c.bottom;
  });
  assert.ok(inside, 'and are drawn inside it, not over the board');
  assert.ok(
    !(await page.evaluate(() => document.getElementById('mBubble')?.classList.contains('on'))),
    'never in the bubble',
  );

  assert.strictEqual(
    await page.locator('#prChat .mc-grip.rz-grip svg').count(),
    1,
    'the input’s handle is the panels’ height grip',
  );
  const box = await page.locator('#prChat .mc-grip').boundingBox();
  if (!box) throw new Error('no grip');
  const before = await page.evaluate(() => document.getElementById('mcInput')?.offsetHeight ?? 0);
  await page.mouse.move(box.x + box.width / 2, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 115, { steps: 5 });
  await page.mouse.up();
  const after = await page.evaluate(() => document.getElementById('mcInput')?.offsetHeight ?? 0);
  assert.ok(after >= before + 100, `dragging the handle makes the input taller (${before} to ${after})`);
  await page.dblclick('#prChat .mc-grip');
  assert.strictEqual(
    await page.evaluate(() => document.getElementById('mcInput')?.offsetHeight ?? 0),
    before,
    'and a double-click puts it back',
  );

  const cards = await page.evaluate(() => window.__fenmyr.curBoard()?.cards.length ?? 0);
  await page.evaluate(() => {
    const png = Uint8Array.from(
      atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='),
      c => c.charCodeAt(0),
    );
    const dt = new DataTransfer();
    dt.items.add(new File([png], 'sketch.png', { type: 'image/png' }));
    document
      .getElementById('mcInput')
      ?.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(1500);
  const pasted = await page.evaluate(() => {
    const b = window.__fenmyr.curBoard();
    const img = b?.cards.find(c => c.type === 'image');
    return { n: b?.cards.length ?? 0, selected: !!img && window.__fenmyr.sel.includes(img.id) };
  });
  assert.ok(pasted.n === cards + 1 && pasted.selected, 'a picture pasted into the chat goes on the board, selected');

  await page.keyboard.press('Escape');
  await page.evaluate(() => document.getElementById('mcClose')?.click());
  assert.ok(
    await page.evaluate(() => document.getElementById('myra')?.classList.contains('chat')),
    'neither Esc nor the close button closes it',
  );

  assert.deepStrictEqual(l.errors, []);
  console.log('PROTO CHAT OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
