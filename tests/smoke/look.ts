import fs from 'node:fs';
import path from 'node:path';
import type { Smoke } from './kit.ts';

// every icon the code asks for by name, wherever it is on screen: Icon('name') anywhere in the renderer
function namedIcons() {
  const root = path.join(import.meta.dirname, '../../src/web'),
    names = new Set<string>(),
    walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.ts'))
          for (const m of fs.readFileSync(p, 'utf8').matchAll(/\bIcon\('([a-z0-9-]+)'/g)) names.add(m[1] ?? '');
      }
    };
  walk(root);
  return [...names];
}

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
  const unknown = await page.evaluate(names => names.filter(n => !window.iconKnown(n)), namedIcons());
  t.checkAll('icons', {
    noneMissing: !ico.missing.length,
    namesKnown: !unknown.length,
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
      // frosted sections sit behind the collections they hold (in front, they would blur the collection headers)
      behind: (() => {
        const z = (cls: string) =>
          Number(getComputedStyle(document.querySelector(`#cards > .card.${cls}`) ?? document.body).zIndex);
        return z('section') < z('coll');
      })(),
    };
  });
  // the header of a collection and of a kanban column is what you click, not the frosted section behind it
  const headHit = await page.evaluate(async () => {
    const M = window.__fenmyr,
      coll = M.board.cards.find(c => c.type === 'coll' && c.kanban);
    if (!coll) return false;
    M.view.z = 1;
    M.view.x = innerWidth / 2 - (coll.x + coll.w / 2);
    M.view.y = innerHeight / 2 - (coll.y + 60);
    M.applyView();
    await new Promise(r => setTimeout(r, 400));
    const head = document.querySelector(`[data-id="${coll.id}"] .coll-head`)?.getBoundingClientRect(),
      hit = head && document.elementFromPoint(head.x + head.width / 2, head.y + head.height / 2);
    return hit?.closest('.card')?.getAttribute('data-id') === coll.id;
  });
  t.checkAll('workshop', {
    headerClickable: headHit,
    opens: opened.name && opened.cards >= 110,
    sections: workshop.sections === 9,
    kanbans: workshop.kanbans === 4,
    todos: workshop.todos === 16,
    noOverlap: workshop.overlaps === 0,
    risks: workshop.risks,
    timeline: workshop.due,
    sectionsBehind: workshop.behind,
  });
  await page.evaluate(id => window.__fenmyr.openBoard(id), before);
  await page.waitForTimeout(500);
}

// a collection's header can show how many cards are inside: from the selection bar or the right-click menu, following the
// cards as they come and go, and not available while the header is hidden
export async function collectionCount(t: Smoke) {
  const { page } = t;
  const state = () =>
    page.evaluate(() => {
      const M = window.__fenmyr,
        c = M.board.cards.find(x => x.type === 'coll' && x.text === 'Count me'),
        badge = document.querySelector(`[data-id="${c?.id}"] .coll-head .kb-n`),
        btn = document.querySelector('#selbar [data-sb="count"]');
      return {
        id: c?.id ?? '',
        saved: c?.type === 'coll' ? !!c.count : null,
        shown: badge?.textContent ?? null,
        tip: badge?.getAttribute('title') ?? null,
        btn: btn instanceof HTMLButtonElement ? { on: btn.classList.contains('on'), disabled: btn.disabled } : null,
      };
    });
  const select = () =>
    page.evaluate(() => {
      const M = window.__fenmyr,
        c = M.board.cards.find(x => x.type === 'coll' && x.text === 'Count me');
      if (c) {
        M.selectOnly([c.id]);
        M.fit([c]);
      }
      document.getElementById('selbar')?.removeAttribute('data-key');
      M.placeSelbar();
    });
  const menu = async () => {
    const box = await page.locator('.card.coll:has-text("Count me")').boundingBox();
    if (!box) throw new Error('no collection');
    await page.mouse.click(box.x + 20, box.y + 20, { button: 'right' }); // the header, or the frame when the header is hidden
    await page.waitForTimeout(250);
    const items = await page.evaluate(() =>
      window.__t.all('#rowMenu button').map(b => ({ text: b.textContent ?? '', disabled: b.hasAttribute('disabled') })),
    );
    return items;
  };
  await page.evaluate(async () => {
    await window.__fenmyr.applyMyra({
      say: 'ok',
      collections: [{ name: 'Count me', x: 0, y: 1500 }],
      add: [
        { type: 'note', text: 'one', in: 'Count me' },
        { type: 'note', text: 'two', in: 'Count me' },
      ],
    });
  });
  await page.waitForTimeout(600);
  await select();
  await page.waitForTimeout(200);
  const before = await state();
  await page.click('#selbar [data-sb="count"]');
  await page.waitForTimeout(400);
  const on = await state();
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  const undone = await state();
  await select();
  await page.click('#selbar [data-sb="count"]');
  await page.waitForTimeout(400);
  await page.evaluate(async () => {
    await window.__fenmyr.applyMyra({ say: 'ok', add: [{ type: 'note', text: 'three', in: 'Count me' }] });
  });
  await page.waitForTimeout(500);
  const three = await state();
  // right-click: Hide count turns it off, then Show count turns it back on
  const countItem = async (label: string) => {
    const items = await menu(),
      item = items.find(i => i.text === label);
    if (item && !item.disabled) await page.locator('#rowMenu button', { hasText: label }).click();
    else await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    return item;
  };
  const hideItem = await countItem('Hide count'),
    viaMenuOff = await state(),
    showItem = await countItem('Show count'),
    viaMenuOn = await state();
  await page.mouse.click(5, 300);
  await select();
  await page.click('#selbar [data-sb="head"]');
  await page.waitForTimeout(400);
  const noHeader = await state();
  const itemsOff = await menu(),
    showOff = itemsOff.find(i => i.text.endsWith('count'));
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 300);
  await select();
  await page.click('#selbar [data-sb="head"]'); // header back: the count is still on
  await page.waitForTimeout(400);
  const headBack = await state();
  t.checkAll('collectionCount', {
    offByDefault: before.shown === null && before.saved === false,
    buttonReady: before.btn?.disabled === false && before.btn.on === false,
    barShows: on.shown === '2' && on.tip === '2 cards' && on.saved === true && on.btn?.on === true,
    undo: undone.shown === null && undone.saved === false,
    followsCards: three.shown === '3',
    menuHides: !!hideItem && !hideItem.disabled && viaMenuOff.shown === null && viaMenuOff.saved === false,
    menuShows: !!showItem && !showItem.disabled && viaMenuOn.shown === '3' && viaMenuOn.saved === true,
    headerOffDisablesBar: noHeader.shown === null && noHeader.btn?.disabled === true,
    headerOffDisablesMenu: !!showOff && showOff.disabled,
    headerBackKeepsCount: headBack.shown === '3' && headBack.btn?.disabled === false,
  });
}
