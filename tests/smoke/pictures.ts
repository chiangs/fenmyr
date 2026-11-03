import type { Smoke } from './kit.ts';

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC';

// Pictures never live inside a note: pasted into a note they become a connected picture card (or replace an empty
// note); a linked pair sent to Unsorted comes back together.
export async function pictures(t: Smoke) {
  const { page } = t;
  const putImg = () =>
    page.evaluate(async u => {
      const b = await (await fetch(u)).blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]);
    }, PNG);
  const paste = async () => {
    await putImg();
    await page.keyboard.press('Control+v');
  };
  const clear = () =>
    page.evaluate(() => {
      const M = window.__fenmyr;
      M.board.cards.length = 0;
      M.board.links.length = 0;
      M.board.tray.length = 0;
      delete M.board.trayLinks;
      M.renderAll();
      M.renderTray();
    });
  const snap = () =>
    page.evaluate(() => {
      const M = window.__fenmyr;
      return {
        types: M.board.cards.map(c => c.type).join(),
        text: M.board.cards.find(c => c.type === 'note')?.text,
        links: M.board.links.length,
        w: M.board.links[0]?.w,
        tray: M.board.tray.map(c => c.type + (c.tie ? '*' : '')).join(),
        trayLinks: (M.board.trayLinks || []).length,
        inline: document.querySelectorAll('.card .text img').length,
      };
    });
  const newNote = async (words?: string) => {
    await page.evaluate(() => window.__fenmyr.newNote());
    await page.waitForTimeout(250);
    if (words) await page.keyboard.type(words);
  };
  // where the first card sits on screen, to press on it
  const firstCard = () =>
    page.evaluate(() => {
      const M = window.__fenmyr,
        z = M.view.z,
        rr = window.__t.el('#stage').getBoundingClientRect(),
        c = M.board.cards[0];
      return c ? { x: c.x * z + M.view.x + rr.left + 40, y: c.y * z + M.view.y + rr.top + 30 } : { x: 0, y: 0 };
    });
  const drag = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
  };
  const toTray = async () => {
    const tr = await page.locator('#tray').boundingBox();
    if (!tr) throw new Error('no Unsorted tray');
    await drag(await firstCard(), { x: tr.x + 60, y: tr.y + 60 });
    await page.waitForTimeout(400);
  };
  const pull = async () => {
    const it = page.locator('#trayList .tray-item').first();
    await it.scrollIntoViewIfNeeded();
    const b = await it.boundingBox();
    if (!b) throw new Error('nothing in Unsorted');
    await drag({ x: b.x + 20, y: b.y + 10 }, { x: 500, y: 400 });
    await page.waitForTimeout(500);
  };
  const selectAll = () =>
    page.evaluate(() => {
      const M = window.__fenmyr;
      M.selectOnly(M.board.cards.map(c => c.id));
      M.fit(M.board.cards);
    });

  await clear();
  await newNote('hello');
  await paste();
  await page.waitForTimeout(800);
  const a = await snap();
  await clear();
  await newNote();
  await paste();
  await page.waitForTimeout(800);
  const d = await snap();
  await clear();
  await newNote('pair');
  await paste();
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const l = window.__fenmyr.board.links[0];
    if (l) l.w = 6;
  });
  await selectAll();
  await page.waitForTimeout(300);
  await toTray();
  const away = await snap();
  await pull();
  const back = await snap();
  await clear();
  await page.evaluate(src => {
    const M = window.__fenmyr;
    for (let i = 0; i < 3; i++)
      M.board.cards.push({ id: `cp${i}`, type: 'image', x: i * 300, y: 0, w: 260, h: 180, src, r: 0 });
    M.renderAll();
    M.fit(M.board.cards);
  }, PNG);
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+c');
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__fenmyr.selectOnly([]));
  await newNote('hello');
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const M = window.__fenmyr,
      n = M.board.cards.find(c => c.type === 'note');
    if (n) M.selectOnly([n.id]);
  });
  await paste();
  await page.waitForTimeout(900);
  const images = await page.evaluate(() => window.__fenmyr.board.cards.filter(c => c.type === 'image').length); // the 3 copied ones plus the one pasted, and no re-pasted copies
  // a note inside a group: its picture joins the group; and undo after pulling a tied group out of Unsorted keeps their connectors
  await clear();
  await page.evaluate(src => {
    const M = window.__fenmyr;
    M.board.cards.push(
      { id: 'g1', type: 'note', x: 0, y: 0, w: 220, h: 140, color: 'white', text: 'one', r: 0, group: 'G' },
      { id: 'g2', type: 'image', x: 400, y: 0, w: 220, h: 140, src, r: 0, group: 'G' },
    );
    M.board.links.push({ id: 'gl', a: 'g1', b: 'g2' });
    M.renderAll();
    M.fit(M.board.cards);
    M.selectOnly(['g1']);
  }, PNG);
  await paste();
  await page.waitForTimeout(800);
  const grouped = await page.evaluate(() => window.__fenmyr.board.cards.filter(c => c.group === 'G').length);
  await selectAll();
  await toTray();
  await pull();
  await page.evaluate(() => window.__fenmyr.selectOnly([]));
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(600);
  const undone = await snap();
  await pull();
  const afterUndo = await snap();
  t.checkAll('notePics', {
    beside: a.types === 'note,image' && a.text === 'hello' && a.links === 1 && !a.inline,
    replaced: d.types === 'image' && d.links === 0,
    tied:
      away.types === '' && away.tray.split(',').every(x => x.endsWith('*')) && away.trayLinks === 1 && away.links === 0,
    noDup: images === 4,
    joinsGroup: grouped === 3,
    undoKeepsLinks:
      undone.tray.split(',').length === 3 && afterUndo.links === 2 && afterUndo.types.split(',').length === 3,
    together:
      back.types.split(',').sort().join() === 'image,note' &&
      back.links === 1 &&
      back.w === 6 &&
      back.tray === '' &&
      back.trayLinks === 0,
  });
  await clear();
}
