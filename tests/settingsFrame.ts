// Settings' tab strip reads General, Appearance, Layout, Board, Myra, Connections, About, and fills the width of the rows
// under it on every tab, with a scrollbar or without. It stays at the top while the body scrolls, on a band the colour of
// the panel so nothing shows between it and the rows, and in a window too narrow for all seven it scrolls sideways instead
// of running out of the panel. Every miss is listed together, so one run says which tabs are off.
import assert from 'node:assert';
import { launch } from './support/launch.ts';
import { rect, still } from './support/settled.ts';

const TABS = ['general', 'appearance', 'layout', 'board', 'myra', 'connections', 'about'];
const NAMES = ['General', 'Appearance', 'Layout', 'Board', 'Myra', 'Connections', 'About'];
const EDGE = 0.5;

const note = { id: 'n', type: 'note', x: 0, y: 0, w: 220, h: 120, r: 0, color: 'butter', text: 'A note' },
  board = { id: 'b', name: 'B', cards: [note], links: [], tray: [], view: { x: 300, y: 200, z: 1 } };

const l = await launch({ boards: [board], open: 'b', settings: { theme: 'light' } });
try {
  const { page } = l;
  const problems: string[] = [];
  const expect = (ok: boolean, what: string) => {
    if (!ok) problems.push(what);
  };
  const same = (a: number, b: number) => Math.abs(a - b) <= EDGE;
  const openTab = async (tab: string) => {
    await page.click(`#setTabs [data-tab="${tab}"]`);
    await still(page);
  };

  await page.click('#gearBtn');
  await still(page);
  const names = await page.$$eval('#setTabs button', bs => bs.map(b => b.textContent));
  expect(names.join(', ') === NAMES.join(', '), `the tabs read ${names.join(', ')}, not ${NAMES.join(', ')}`);

  // the strip's, the first visible row's and the first visible section's edges, and how far the body has scrolled
  const measure = async () => {
    await still(page);
    return page.evaluate(() => {
      const first = (selector: string) =>
        [...document.querySelectorAll<HTMLElement>(selector)].find(e => e.checkVisibility());
      const edges = (e: Element | null | undefined) => {
        const r = e?.getBoundingClientRect();
        return { left: r?.left ?? NaN, right: r?.right ?? NaN, top: r?.top ?? NaN };
      };
      const body = document.querySelector<HTMLElement>('#settings .set-body');
      const strip = document.querySelector<HTMLElement>('#setTabs');
      return {
        strip: edges(strip),
        row: edges(first('#settings .set-row')),
        section: edges(first('#settings .set-body section')),
        body: edges(body),
        panel: edges(document.querySelector('#settings .set-panel')),
        scrolled: body?.scrollTop ?? 0,
        sideways: body ? body.scrollWidth - body.clientWidth : NaN,
        stripScrolls: strip ? strip.scrollWidth - strip.clientWidth : NaN,
      };
    });
  };

  const rowEnds: string[] = [];
  const rowEdge: number[] = [];
  for (const tab of TABS) {
    await openTab(tab);
    const m = await measure();
    expect(
      same(m.strip.right, m.row.right),
      `${tab}: the strip ends at ${m.strip.right}, its first row at ${m.row.right}`,
    );
    expect(
      same(m.strip.right, m.section.right),
      `${tab}: the strip ends at ${m.strip.right}, its first section at ${m.section.right}`,
    );
    expect(
      same(m.strip.left, m.row.left),
      `${tab}: the strip starts at ${m.strip.left}, its first row at ${m.row.left}`,
    );
    rowEdge.push(m.row.right);
    rowEnds.push(`${tab} ${m.row.right}`);
  }
  expect(
    rowEdge.every(r => same(r, rowEdge[0] ?? NaN)),
    `rows end in different places on different tabs: ${rowEnds.join(', ')}`,
  );

  // scrolled, the strip is still at the top of the body
  await openTab('appearance');
  await page.evaluate(() => {
    const body = document.querySelector('#settings .set-body');
    if (body) body.scrollTop = 400;
  });
  const scrolled = await measure();
  expect(scrolled.scrolled > 300, `Appearance scrolled to ${scrolled.scrolled}, not 400, so the strip was not tested`);
  expect(
    same(scrolled.strip.top, scrolled.body.top),
    `scrolled, the strip is at ${scrolled.strip.top} and the body at ${scrolled.body.top}`,
  );

  // and what is under its corners and just below it answers for the strip, not for a row scrolling past
  const strip = await rect(page, '#setTabs');
  const holes = await page.evaluate(r => {
    const tabs = document.querySelector<HTMLElement>('#setTabs');
    const body = document.querySelector<HTMLElement>('#settings .set-body');
    const band = body && tabs ? [...body.children].find(c => c.contains(tabs)) : undefined;
    if (!band) return ['everywhere: the strip is not at the top of the body'];
    const left = r.x,
      right = r.x + r.width,
      top = r.y,
      bottom = r.y + r.height;
    const below = bottom + 1;
    const at = [
      ['top left', left + 0.5, top + 0.5],
      ['top right', right - 0.5, top + 0.5],
      ['bottom left', left + 0.5, bottom - 0.5],
      ['bottom right', right - 0.5, bottom - 0.5],
      ['just below, left', left + 0.5, below],
      ['just below, middle', (left + right) / 2, below],
      ['just below, right', right - 0.5, below],
    ] as const;
    return at.filter(([, x, y]) => !band.contains(document.elementFromPoint(x, y))).map(([name]) => name);
  }, strip);
  expect(holes.length === 0, `scrolled, a row shows through at the strip's ${holes.join(', ')}`);

  // the band is the colour of the panel in light, dark and on a Caelestia desktop, or it shows as a stripe
  const colours = async () => {
    await still(page);
    return page.evaluate(() => {
      const strip = document.querySelector<HTMLElement>('#setTabs');
      const body = document.querySelector<HTMLElement>('#settings .set-body');
      const band = body && strip ? [...body.children].find(c => c.contains(strip)) : undefined;
      const panel = document.querySelector('#settings .set-panel');
      return {
        band: band ? getComputedStyle(band).backgroundColor : 'no band',
        panel: panel ? getComputedStyle(panel).backgroundColor : 'no panel',
      };
    });
  };
  const checkBand = async (where: string) => {
    const c = await colours();
    expect(
      c.band === c.panel && c.band !== 'rgba(0, 0, 0, 0)',
      `${where}: the band is ${c.band} on a panel of ${c.panel}`,
    );
  };
  await checkBand('light');
  await page.click('#settings [data-seg="theme"] [data-v="dark"]');
  await checkBand('dark');
  // the desktop's own panel colour is what Following Caelestia puts on the body
  await page.evaluate(() => {
    document.body.classList.add('following-caelestia');
    document.body.style.setProperty('--panel', '#2b3a4a');
  });
  await checkBand('caelestia');
  await page.evaluate(() => {
    document.body.classList.remove('following-caelestia');
    document.body.style.removeProperty('--panel');
  });
  await page.click('#settings [data-seg="theme"] [data-v="light"]');

  // a window too narrow for the seven tabs: the strip scrolls, and neither the panel nor the body spills sideways
  await l.app.evaluate(({ BrowserWindow }, w) => BrowserWindow.getAllWindows()[0]?.setSize(w, 900), 420);
  await page.waitForFunction(() => innerWidth === 420);
  for (const tab of ['general', 'appearance', 'about']) {
    await openTab(tab);
    const m = await measure();
    const at = `420 px, ${tab}`;
    expect(
      m.strip.right <= m.panel.right + EDGE,
      `${at}: the strip ends at ${m.strip.right}, past the panel at ${m.panel.right}`,
    );
    expect(
      m.strip.left >= m.panel.left - EDGE,
      `${at}: the strip starts at ${m.strip.left}, before the panel at ${m.panel.left}`,
    );
    expect(m.sideways <= EDGE, `${at}: the body scrolls sideways by ${m.sideways}`);
    expect(m.stripScrolls > 0, `${at}: the strip does not scroll, so it was not too narrow to test`);
    expect(
      same(m.strip.right, m.row.right),
      `${at}: the strip ends at ${m.strip.right}, its first row at ${m.row.right}`,
    );
  }
  expect(
    await page.locator('#settings section[data-tab="about"]').first().isVisible(),
    'About is not reached by clicking it when the strip scrolls',
  );

  assert.deepStrictEqual(problems, [], 'the tab strip');
  assert.deepStrictEqual(l.errors, [], 'no page errors');
} finally {
  await l.close();
}
console.log('settingsFrame: ok');
