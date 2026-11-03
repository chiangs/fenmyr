import fs from 'node:fs';
import path from 'node:path';
import type { Smoke } from './kit.ts';

// Licences, the files the exports wrote, the wireframe panel, and placing elements from it.
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

// the panel's groups, search and folding; every element places; Myra builds screens from them
async function wireframes(t: Smoke) {
  const res = await t.page.evaluate(async () => {
    const T = window.__t,
      M = window.__fenmyr,
      names = M.GROUPS.flatMap(g => g[1]),
      shown = () =>
        T.all('#design [data-piece]')
          .filter(b => !b.hidden)
          .map(b => b.dataset.piece)
          .join(','),
      layouts = () => T.el('.dz-group[data-g="layouts"]');
    const counts = M.GROUPS.map(g => g[1].length).join(','),
      buttons =
        document.querySelectorAll('#design .dz-piece-grid button').length +
        document.querySelectorAll('#design .dz-tools button').length,
      titles = T.all('#design .dz-gh .label')
        .map(e => e.textContent)
        .join('|'),
      layoutsFolded = layouts().classList.contains('closed'),
      iconsKnown = names.every(n => {
        const p = M.PIECES[n];
        return !!p && window.iconKnown(p.icon);
      }),
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
    const s = T.input('#dzSearch'),
      type = (v: string) => {
        s.value = v;
        s.dispatchEvent(new Event('input'));
      };
    type('dialog');
    const dialog = shown(),
      openWhileSearching = !layouts().classList.contains('closed') || layouts().hidden;
    type('zzzz');
    const noneMessage = !T.el('#dzNone').hidden;
    type('faq');
    const faq = shown();
    type('');
    T.click('.dz-group[data-g="basics"] .dz-gh');
    const basicsFolded = T.el('.dz-group[data-g="basics"]').classList.contains('closed'),
      saved: unknown = JSON.parse(localStorage.getItem('fenmyr:dzOpen') || '{}'),
      remembered = !!saved && typeof saved === 'object' && 'basics' in saved && saved.basics === false;
    T.click('.dz-group[data-g="basics"] .dz-gh');
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
    return {
      counts,
      buttons,
      titles,
      layoutsFolded,
      iconsKnown,
      failed,
      dialog,
      openWhileSearching,
      noneMessage,
      faq,
      basicsFolded,
      remembered,
      myraBuilt,
      tabsNotABar,
    };
  });
  t.results.wf = res;
  t.checkAll('wireframes', {
    counts: res.counts === '7,8,8,11',
    buttons: res.buttons === 38,
    titles: res.titles === 'Basics|Buttons & inputs|Building blocks|Layouts',
    layoutsFolded: res.layoutsFolded,
    iconsKnown: res.iconsKnown,
    allPlace: !res.failed.length,
    dialog: res.dialog === 'Modal',
    noneMessage: res.noneMessage,
    faq: res.faq === 'Accordion',
    basicsFolded: res.basicsFolded,
    remembered: res.remembered,
    myraBuilt: res.myraBuilt > 30,
    tabsNotABar: res.tabsNotABar,
  });
}

// a click adds the element at once (middle of the view with nothing selected, stacked inside a selected screen), a drag drops it where released
async function placing(t: Smoke) {
  const { page } = t;
  const sel = () =>
    page.evaluate(() => {
      const M = window.__fenmyr,
        c = M.board.cards.filter(x => M.sel.includes(x.id)),
        z = M.view.z,
        r = window.__t.el('#stage').getBoundingClientRect();
      return {
        n: c.length,
        cards: M.board.cards.length,
        cx: Math.min(...c.map(x => x.x)) * z + M.view.x + r.left,
        cy: Math.min(...c.map(x => x.y)) * z + M.view.y + r.top,
        vw: innerWidth,
        vh: innerHeight,
      };
    });
  const empty = () =>
    page.evaluate(() => {
      const M = window.__fenmyr;
      M.board.cards.length = 0;
      M.selectOnly([]);
      M.renderAll();
    });
  const pickScreen = () =>
    page.evaluate(() => {
      const M = window.__fenmyr,
        f = M.board.cards.find(c => c.type === 'frame');
      if (f) M.selectOnly([f.id]);
    });
  await empty();
  await page.click('[data-piece="Dropdown"]');
  const a = await sel();
  await page.evaluate(async () => {
    const M = window.__fenmyr;
    M.board.cards.length = 0;
    await M.applyMyra({
      say: 'ok',
      screens: [{ name: 'S', device: 'iPhone', items: [{ piece: 'Heading', text: 'Hello' }] }],
    });
  });
  await pickScreen();
  await page.evaluate(() => window.__fenmyr.fit(window.__fenmyr.board.cards));
  for (const n of ['Nav bar', 'Tab bar', 'Dropdown', 'Table', 'Accordion']) {
    await page.click(`[data-piece="${n}"]`);
    await pickScreen();
  }
  const st = await page.evaluate(() => {
    const cards = window.__fenmyr.board.cards,
      f = cards.find(c => c.type === 'frame');
    return {
      outside: cards.filter(c => c.type !== 'frame' && !c.onFrame).length,
      inside: !!f && cards.filter(c => c.onFrame === f.id).every(c => c.y >= f.y && c.y + c.h <= f.y + f.h + 1),
    };
  });
  await empty();
  const bt = page.locator('[data-piece="Video"]');
  await bt.scrollIntoViewIfNeeded();
  const bb = await bt.boundingBox(),
    c0 = (await sel()).cards;
  if (!bb) throw new Error('no Video button');
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.mouse.down();
  await page.mouse.move(bb.x - 60, bb.y + 20, { steps: 4 });
  const dragging = await page.evaluate(() => window.__t.el('#ghost').classList.contains('on'));
  await page.mouse.move(500, 450, { steps: 6 });
  await page.mouse.up();
  const d = await sel();
  t.checkAll('place', {
    centre: a.n >= 1 && a.cx > a.vw * 0.15 && a.cx < a.vw * 0.7 && a.cy > a.vh * 0.1 && a.cy < a.vh * 0.8,
    stacked: st.outside === 0 && st.inside,
    dragging,
    dropped: d.cards > c0 && Math.abs(d.cx - 500) < 200 && Math.abs(d.cy - 450) < 200,
    hintGone: await page.evaluate(() => window.__t.el('#placeHint').hidden),
  });
}
