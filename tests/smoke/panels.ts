import fs from 'node:fs';
import path from 'node:path';
import { openPicker, type Smoke } from './kit.ts';

// Licences, the files the exports wrote, the Pieces picker, and placing pieces from it.
export async function panels(t: Smoke) {
  await licences(t);
  await exportsWritten(t);
  await wireframes(t);
  await placing(t);
}

// About → Licenses lists Myra's license and every third-party notice; Chromium's own file ships next to Electron
async function licences(t: Smoke) {
  const items = await t.page.evaluate(async () => {
    const T = window.__t;
    T.click('#openLicenses');
    await T.wait(700);
    const items = T.all('#licBody .lic-item summary b').map(b => b.textContent ?? '');
    T.click('#licClose');
    return items;
  });
  const exe = await t.app.evaluate(({ app }) => app.getPath('exe'));
  t.checkAll('licences', {
    count: items.length > 60,
    mochiboard: items.includes('Mochiboard'),
    jszip: items.includes('jszip'),
    phosphor: items.includes('Phosphor Icons') && !items.includes('Lucide'),
    chromium: fs.existsSync(path.join(path.dirname(exe), 'LICENSES.chromium.html')),
  });
}

// the picture, PDF and Word files the bridge checks saved, and the board file itself
async function exportsWritten(t: Smoke) {
  await t.page.screenshot({ path: path.join(t.out, 'window.png') });
  const files = fs.readdirSync(t.out),
    png = fs.readFileSync(path.join(t.out, 'shot.png')),
    pages = (fs.readFileSync(path.join(t.out, 'Doc.pdf'), 'latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  t.checkAll('exports', {
    pngAtScale: png.readUInt32BE(16) === 600,
    pdfPages: pages >= 2,
    pdf: files.includes('shot.pdf'),
    docx: files.includes('Doc.docx'),
    boardOnDisk: fs.existsSync(path.join(t.data, 'fenmyr/boards/smoke1.json')),
  });
}

// the picker holds every piece in its groups and finds them by search; every piece places; Myra builds screens from them
async function wireframes(t: Smoke) {
  const { page } = t;
  const res = await page.evaluate(async () => {
    const M = window.__fenmyr,
      names = M.PIECE_GROUPS.flatMap(g => g.cells.flatMap(c => (c.kind === 'piece' ? [c.name] : []))),
      counts = M.PIECE_GROUPS.map(g => g.cells.filter(c => c.kind === 'piece').length).join(','),
      failed: string[] = [];
    for (const n of names) {
      const b = M.board.cards.length;
      try {
        M.placePiece(n, { x: 3000, y: 3000 });
      } catch (e) {
        failed.push(`${n}: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (M.board.cards.length <= b) failed.push(`${n}: placed nothing`);
    }
    const n0 = M.board.cards.length;
    await M.applyMyra({
      say: 'ok',
      screens: [
        {
          name: 'Settings',
          device: 'iPhone',
          items: [
            { piece: 'Tabs', tabs: ['A', 'B'] },
            { piece: 'Dropdown', label: 'Country', text: 'Norway' },
            { piece: 'Radio', options: ['Monthly', 'Yearly'] },
            { piece: 'Textarea', label: 'Note' },
            { piece: 'Table', cols: ['Name', 'Role'], cells: [['Ada', 'Lead']] },
            { piece: 'Accordion' },
            { piece: 'Modal', title: 'Sure?' },
            { piece: 'Video' },
            { piece: 'Map' },
            { piece: 'Divider' },
            { piece: 'Space', h: 20 },
          ],
        },
      ],
    });
    const myraBuilt = M.board.cards.length - n0,
      m1 = M.board.cards.length;
    await M.applyMyra({
      say: 'ok',
      screens: [
        { name: 'Only tabs', device: 'iPhone', items: [{ piece: 'Tabs', tabs: ['One', 'Two'] }, { piece: 'Table' }] },
      ],
    });
    const added = M.board.cards.slice(m1),
      tabsNotABar =
        !added.some(c => c.type === 'icon' && c.name === 'circle') &&
        added.some(c => c.type === 'text' && c.text === 'One');
    return { names: names.join(','), counts, failed, myraBuilt, tabsNotABar };
  });
  await openPicker(t);
  const shown = () =>
    page.evaluate(() =>
      window.__t
        .all('#pkGrid [data-pk-piece]')
        .filter(b => !b.hidden)
        .map(b => b.dataset.pkPiece)
        .join(','),
    );
  const cells = await shown();
  await page.fill('#pkSearch', 'dialog');
  const dialog = await shown();
  await page.fill('#pkSearch', 'zzzz');
  const noneMessage = await page.evaluate(() => !window.__t.el('#pkGrid .pk-none').hidden);
  await page.fill('#pkSearch', 'faq');
  const faq = await shown();
  await page.fill('#pkSearch', '');
  await page.keyboard.press('Escape');
  const all = { ...res, cells, dialog, noneMessage, faq };
  t.results.wf = all;
  t.checkAll('wireframes', {
    counts: all.counts === '7,8,8,11',
    cells: all.cells === all.names,
    allPlace: !all.failed.length,
    dialog: all.dialog === 'Modal',
    noneMessage: all.noneMessage,
    faq: all.faq === 'Accordion',
    myraBuilt: all.myraBuilt > 30,
    tabsNotABar: all.tabsNotABar,
  });
}

// a click in the picker stacks the piece inside its screen, and a drag out of it drops the piece where released
async function placing(t: Smoke) {
  const { page } = t;
  const sel = () =>
    page.evaluate(() => {
      const M = window.__fenmyr,
        c = M.board.cards.filter(x => M.sel.includes(x.id)),
        z = M.view.z,
        r = window.__t.el('#stage').getBoundingClientRect();
      return {
        cards: M.board.cards.length,
        cx: Math.min(...c.map(x => x.x)) * z + M.view.x + r.left,
        cy: Math.min(...c.map(x => x.y)) * z + M.view.y + r.top,
      };
    });
  await page.evaluate(async () => {
    const M = window.__fenmyr;
    M.board.cards.length = 0;
    M.selectOnly([]);
    M.renderAll();
    await M.applyMyra({
      say: 'ok',
      screens: [{ name: 'S', device: 'iPhone', items: [{ piece: 'Heading', text: 'Hello' }] }],
    });
  });
  await openPicker(t);
  for (const n of ['Nav bar', 'Tab bar', 'Dropdown', 'Table', 'Accordion']) {
    await page.click(`#pkGrid [data-pk-piece="${n}"]`);
    await page.waitForTimeout(100);
  }
  const st = await page.evaluate(() => {
    const cards = window.__fenmyr.board.cards,
      f = cards.find(c => c.type === 'frame');
    return {
      outside: cards.filter(c => c.type !== 'frame' && !c.onFrame).length,
      inside: !!f && cards.filter(c => c.onFrame === f.id).every(c => c.y >= f.y && c.y + c.h <= f.y + f.h + 1),
    };
  });
  const bt = page.locator('#pkGrid [data-pk-piece="Video"]');
  await bt.scrollIntoViewIfNeeded();
  const bb = await bt.boundingBox(),
    c0 = (await sel()).cards,
    to = await page.evaluate(() => {
      const M = window.__fenmyr,
        f = M.board.cards.find(c => c.type === 'frame'),
        r = window.__t.el('#stage').getBoundingClientRect();
      if (!f) throw new Error('no screen');
      return { x: (f.x + f.w / 2) * M.view.z + M.view.x + r.left, y: (f.y + f.h / 2) * M.view.z + M.view.y + r.top };
    });
  if (!bb) throw new Error('no Video cell');
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.mouse.down();
  await page.mouse.move(bb.x - 60, bb.y + 20, { steps: 4 });
  const dragging = await page.evaluate(() => window.__t.el('#ghost').classList.contains('on'));
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  const d = await sel();
  await page.keyboard.press('Escape');
  t.checkAll('place', {
    stacked: st.outside === 0 && st.inside,
    dragging,
    dropped: d.cards > c0 && Math.abs(d.cx - to.x) < 200 && Math.abs(d.cy - to.y) < 200,
    hintGone: await page.evaluate(() => window.__t.el('#placeHint').hidden),
  });
}
