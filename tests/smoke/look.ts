import type { Smoke } from './kit.ts';

// Icons, the default board font, the starter boards and the Kanban template.
export async function look(t: Smoke) {
  const { page } = t;
  // icons: everything the page draws is in the icon set, the Icon style setting switches the weight, and a name nobody drew shows a placeholder
  const ico = await page.evaluate(async () => {
    const T = window.__t,
      shown = (sel: string) => [...document.querySelectorAll(sel)].some(g => getComputedStyle(g).display !== 'none'), // SVG groups, so not T.all
      drawn = [...document.querySelectorAll('svg[data-ico]')].flatMap(s =>
        s instanceof SVGElement && s.dataset.ico ? [s.dataset.ico] : [],
      ),
      res = {
        gridShapes: T.all('#gridShapes button')
          .map(b => b.dataset.gshape)
          .join(),
        missing: [...new Set(drawn.filter(n => !window.iconKnown(n) || n === 'missing'))],
        count: document.querySelectorAll('#tools svg.ico').length,
        pick: window.iconList().length,
        placeholder: /data-ico="move_horiz"[^>]*><title>move_horiz/.test(window.Icon('move_horiz')),
        regular: shown('#tools .ico-r') && !shown('#tools .ico-d'),
        duo: false,
      };
    T.click('[data-seg="iconStyle"] [data-v="duotone"]');
    await T.wait(100);
    res.duo =
      document.body.classList.contains('icons-duo') &&
      shown('#tools .ico-d') &&
      !shown('#tools .ico-r') &&
      document.querySelectorAll('#tools svg.ico .ico-d .t').length > 10;
    T.click('[data-seg="iconStyle"] [data-v="regular"]');
    return res;
  });
  t.check('gridShapes', ico.gridShapes === 'dot,cross,square,cloudberry,berry,leaf', ico.gridShapes);
  t.checkAll('icons', {
    noneMissing: !ico.missing.length,
    count: ico.count >= 19,
    pick: ico.pick > 150,
    placeholder: ico.placeholder,
    regular: ico.regular,
    duo: ico.duo,
  });
  // Settings → Board → Default font: board text and docs change, the app's own panels don't, and choosing Myra's own puts it back
  const font = await page.evaluate(async () => {
    const T = window.__t,
      fam = (sel: string) => getComputedStyle(T.el(sel)).fontFamily;
    T.click('#gearBtn');
    await T.wait(300);
    T.click('#setTabs [data-tab="board"]');
    await T.wait(200);
    const before = fam('.card.title .text');
    T.click('#defaultFontBtn');
    await T.wait(200);
    const pick = T.all('#fontPop .dp-font').find(
      b => b.dataset.bfont && b.dataset.bfont !== 'Figtree' && !b.querySelector('small'),
    ); // a font installed here (no network in the test)
    const name = pick?.dataset.bfont ?? '';
    pick?.click();
    await T.wait(300);
    const chosen =
      !!name &&
      fam('.card.title .text').includes(name) &&
      fam('.box').includes('Figtree') &&
      !fam('.box').includes(name) &&
      T.text('#defaultFontBtn') === name;
    T.click('#defaultFontBtn');
    await T.wait(200);
    T.click('#fontPop [data-bfont=""]');
    await T.wait(300);
    const back = fam('.card.title .text') === before;
    T.click('#setClose');
    await T.wait(200);
    return { chosen, back };
  });
  t.checkAll('defaultFont', font);
  // the new starter boards open as their own boards, with their cards (and, for the tree, its lines)
  const starters = await page.evaluate(async () => {
    const T = window.__t,
      res: Record<string, { name: boolean; cards: number }> = {};
    for (const [name, key] of [
      ['OKRs and opportunities', 'tree'],
      ['Product kickoff', 'kickoff'],
    ]) {
      T.click('#tools [data-add="tpl"]');
      await T.wait(200);
      T.click(`[data-starter="${name}"]`);
      await T.wait(1500);
      res[key ?? ''] = { name: T.input('#boardName').value === name, cards: document.querySelectorAll('.card').length };
    }
    return res;
  });
  t.checkAll('starters', {
    tree: starters.tree?.name && (starters.tree.cards ?? 0) >= 12,
    kickoff: starters.kickoff?.name && (starters.kickoff.cards ?? 0) >= 18,
  });
  // Kanban adds columns with names and counts to the board; right-clicking a name offers the column menu
  const kanban = await page.evaluate(async () => {
    const T = window.__t;
    T.click('#tools [data-add="tpl"]');
    await T.wait(200);
    T.click('[data-tpl="kanban"]');
    await T.wait(1200);
    const hs = T.all('.kb-h');
    return {
      cols: hs.map(h => h.querySelector('.text')?.textContent).join(),
      counts: hs.map(h => h.querySelector('.kb-n')?.textContent).join(),
    };
  });
  await page.evaluate(() => {
    document.getElementById('newsOk')?.click();
    document.getElementById('onboard')?.classList.remove('on');
  });
  await page.waitForTimeout(800);
  const at = await page.evaluate(() => {
    const q = window.__t.all('.kb-h')[1]?.getBoundingClientRect();
    return q ? [q.x + 20, q.y + 12] : [0, 0];
  });
  await page.mouse.click(at[0] ?? 0, at[1] ?? 0, { button: 'right' });
  await page.waitForTimeout(300);
  const menu = await page.evaluate(() => window.__t.all('#rowMenu button').map(b => b.textContent ?? ''));
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 300);
  t.checkAll('kanban', {
    cols: kanban.cols === 'To do,Doing,Done',
    counts: kanban.counts === '2,1 / 3,1',
    menu: menu.includes('Rename column') && menu.includes('Delete column') && menu.includes('Limit 5'),
  });
  // the Workshop planning board: nine sections (phases, risks, modules, lessons), the four kanbans, a checklist for every list of checks, risks as a kanban, and nothing drawn on top of anything else
  const before = await page.evaluate(() => window.__fenmyr.board.id);
  const opened = await page.evaluate(async () => {
    const T = window.__t;
    T.click('#tools [data-add="tpl"]');
    await T.wait(200);
    T.click('[data-starter="Workshop planning"]');
    await T.wait(1800);
    return {
      name: T.input('#boardName').value === 'Workshop planning',
      cards: document.querySelectorAll('.card').length,
    };
  });
  const workshop = await page.evaluate(() => {
    const cards = window.__fenmyr.board.cards,
      inColl = new Set(cards.flatMap(c => (c.type === 'coll' ? c.kids : []))),
      top = cards.filter(c => c.type !== 'section' && c.type !== 'title' && !inColl.has(c.id)),
      kanbans = cards.flatMap(c => (c.type === 'coll' && c.kanban ? [c] : []));
    const overlaps = top.filter((a, i) =>
      top.slice(i + 1).some(b => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h),
    ).length;
    const risks = kanbans.find(k => k.text?.startsWith('9 ·'));
    return {
      sections: cards.filter(c => c.type === 'section').length,
      kanbans: kanbans.length,
      todos: cards.filter(c => c.type === 'todo').length,
      overlaps,
      risks: risks?.kids.length === 6 && risks.colNames?.join() === 'To assess,High impact,Medium impact,Low impact',
      due: !!cards.find(c => c.type === 'note' && c.name === 'T-0'),
    };
  });
  t.checkAll('workshop', {
    opens: opened.name && opened.cards >= 110,
    sections: workshop.sections === 9,
    kanbans: workshop.kanbans === 4,
    todos: workshop.todos === 16,
    noOverlap: workshop.overlaps === 0,
    risks: workshop.risks,
    timeline: workshop.due,
  });
  await page.evaluate(id => window.__fenmyr.openBoard(id), before);
  await page.waitForTimeout(500);
}
