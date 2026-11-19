import assert from 'node:assert';
import { TOOLBAR, toolbarOf } from '../src/web/ui/toolbarTable.ts';
import { launch, settle } from './support/launch.ts';

const t = (id: string, priority?: number) => ({ id, label: id, icon: id, priority });
const ids = (xs: readonly { id: string }[]) => xs.map(x => x.id);

const grouped = toolbarOf(['a', t('x'), t('y'), 'b', t('z')]);
assert.deepStrictEqual(
  grouped.tools.map(x => `${x.group}/${x.id}`),
  ['a/x', 'a/y', 'b/z'],
  'the tools come in line order, each in the group above its line',
);
assert.deepStrictEqual(ids(toolbarOf(['a', t('y'), t('x')]).tools), ['y', 'x'], 'moving a line moves the tool');
assert.strictEqual(grouped.tool('y')?.group, 'a', 'y starts in a');
assert.strictEqual(
  toolbarOf(['a', t('x'), 'b', t('y'), t('z')]).tool('y')?.group,
  'b',
  'moving its line under another name moves the tool to that group',
);
assert.strictEqual(grouped.tool('nope'), undefined, 'an id the table does not have is not a tool');

assert.throws(() => toolbarOf(['a', t('x'), t('x')]), /"x"/, 'an id twice names the id');
assert.throws(() => toolbarOf(['a', 'b', t('x')]), /"a"/, 'a group with no tools names the group');
assert.throws(() => toolbarOf(['a', t('x'), 'b']), /"b"/, 'a last group with no tools names the group');
assert.throws(() => toolbarOf(['a', t('x'), 'a', t('y')]), /"a"/, 'a group named twice names the group');

const plain = toolbarOf(['a', t('x'), t('y'), t('z')]);
assert.deepStrictEqual(plain.tuckOrder(['x', 'y', 'z']), ['z', 'y', 'x'], 'with no priority the last tucks first');
assert.deepStrictEqual(plain.tuckOrder(['z', 'x', 'y']), ['y', 'x', 'z'], 'a personal order tucks from its own end');
assert.deepStrictEqual(plain.tuckOrder(['x', 'z']), ['z', 'x'], 'a switched-off tool is not in the bar');
assert.deepStrictEqual(
  toolbarOf(['a', t('x', -1), t('y'), t('z')]).tuckOrder(['x', 'y', 'z']),
  ['x', 'z', 'y'],
  'a lower priority tucks before the rest, which tuck from the end',
);
assert.deepStrictEqual(
  toolbarOf(['a', t('x'), t('y'), t('z', 1)]).tuckOrder(['x', 'y', 'z']),
  ['y', 'x', 'z'],
  'a higher priority stays after the rest',
);
assert.deepStrictEqual(
  toolbarOf(['a', t('x', 1), t('y', 1), t('z')]).tuckOrder(['x', 'y', 'z']),
  ['z', 'y', 'x'],
  'tools of equal priority tuck from the end',
);

const before = toolbarOf(['a', t('x'), t('y'), 'b', t('z')]),
  after = toolbarOf(['a', t('x', 1), t('z'), 'b', t('y')]);
assert.deepStrictEqual(ids(before.tools), ['x', 'y', 'z']);
assert.deepStrictEqual(ids(after.tools), ['x', 'z', 'y'], 'the lines moved, so the bar did');
assert.deepStrictEqual([before.tool('z')?.group, after.tool('z')?.group], ['b', 'a'], 'z moved to the group above it');
assert.deepStrictEqual(before.tuckOrder(ids(before.tools)), ['z', 'y', 'x']);
assert.deepStrictEqual(after.tuckOrder(ids(after.tools)), ['y', 'z', 'x'], 'x was given priority, so it tucks last');

const runs = toolbarOf(['a', t('x'), t('y'), 'b', t('z')]);
assert.deepStrictEqual(runs.starts(['x', 'y', 'z']), ['z'], 'a tool after another group’s starts a row');
assert.deepStrictEqual(
  runs.starts(['x', 'z', 'y']),
  ['z', 'y'],
  'a personal order starts a row at each change of group',
);
assert.strictEqual(runs.rows(['x', 'y', 'z'], 5, false), 2, 'each group fills rows of its own');
assert.strictEqual(runs.rows(['x', 'y', 'z'], 1, false), 3, 'one column holds a tool a row');
assert.strictEqual(runs.rows(['x', 'y', 'z'], 5, true), 2, '··· takes the cell after the last tool');
assert.strictEqual(runs.rows(['x', 'y', 'z'], 1, true), 4, '··· takes a row of its own after a full one');
assert.strictEqual(runs.rows(['x', 'z', 'y'], 5, false), 3, 'a group a personal order splits fills a row a run');

const shipped = ids(TOOLBAR.tools);
assert.deepStrictEqual([...TOOLBAR.tuckOrder(shipped)].sort(), [...shipped].sort(), 'every tool tucks once');

const note = { id: 'n', type: 'note', x: 0, y: 0, w: 220, h: 120, r: 0, color: 'white', text: 'A note' };
const l = await launch({
  boards: [{ id: 'b', name: 'Bare', cards: [note], links: [], tray: [], view: { x: 300, y: 200, z: 1 } }],
  open: 'b',
});
const { page, app } = l;

const toolsOf = (born: string | null) =>
  page.evaluate(html => {
    const box = document.createElement('div');
    box.innerHTML = html ?? document.getElementById('tools')?.innerHTML ?? '';
    return [...box.querySelectorAll<HTMLElement>(':scope > [data-add]')].map(b => {
      const svg = b.querySelector('svg');
      return {
        id: b.dataset.add ?? '',
        tip: b.dataset.tip ?? '',
        aria: b.getAttribute('aria-label'),
        icon: svg?.dataset.ico ?? '',
        drawn: !!svg?.classList.contains('ico') && svg.innerHTML !== '',
        on: b.classList.contains('on'),
        pressed: b.getAttribute('aria-pressed'),
        hidden: b.hidden,
      };
    });
  }, born);

try {
  await app.context().addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () =>
      Reflect.set(window, 'toolsBorn', document.getElementById('tools')?.innerHTML),
    );
  });
  await page.reload();
  await page.waitForFunction(() => window.__fenmyr?.curBoard() && document.querySelector('#cards .card'));
  await settle(page);
  const markup: unknown = await page.evaluate(() => Reflect.get(window, 'toolsBorn'));
  assert.strictEqual(typeof markup, 'string', 'the bar has its buttons by the time the page has loaded');
  const known = await page.evaluate(
    names => names.map(n => window.iconKnown(n)),
    TOOLBAR.tools.map(tool => tool.icon),
  );
  for (const [when, buttons] of [
    ['when built', await toolsOf(typeof markup === 'string' ? markup : null)],
    ['once settled', await toolsOf(null)],
  ] as const) {
    assert.deepStrictEqual(
      buttons.map(b => b.id),
      shipped,
      `${when}: every row has a button and every button a row, in the table’s order`,
    );
    TOOLBAR.tools.forEach((tool, i) => {
      const b = buttons[i],
        who = `${when}: ${tool.id}`;
      assert.ok(b, `${who} has a button`);
      if (tool.key) {
        assert.ok(b.tip.startsWith(`${tool.label} · `), `${who}: the tooltip is its name, then its key`);
        assert.ok(b.tip.endsWith(tool.key.slice(-1)), `${who}: the tooltip ends with its key`);
      } else assert.strictEqual(b.tip, tool.label, `${who}: with no key the tooltip is its name`);
      assert.strictEqual(
        b.aria,
        tool.aria ?? b.tip,
        `${who}: a screen reader hears its aria text, or else the tooltip`,
      );
      assert.strictEqual(b.icon, tool.icon, `${who}: it shows its icon`);
      assert.ok(known[i] && b.drawn, `${who}: its icon is drawn`);
      assert.strictEqual(b.on, !!tool.lit, `${who}: it starts lit only when its row says so`);
      assert.strictEqual(
        b.pressed,
        tool.toggle ? 'false' : null,
        `${who}: it reads as pressed only when its row says so`,
      );
      assert.strictEqual(b.hidden, tool.needs !== undefined, `${who}: a tool that needs a vault hides without one`);
    });
  }

  await page.click('#gearBtn');
  await page.click('#setTabs [data-tab="toolbar"]');
  const listed = await page.$$eval('#setTbList .tbe-row', rows =>
    rows.map(r => [r.getAttribute('data-tb'), r.querySelector('.tbe-name')?.textContent]),
  );
  assert.deepStrictEqual(
    listed,
    TOOLBAR.tools.map(tool => [tool.id, tool.label]),
    'Settings lists every tool in the bar’s order under its name',
  );
  await page.click('#setClose');

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1280, 800));
  await settle(page, 600);
  const bar = await page.$$eval('#tools > [data-add]', bs =>
    bs
      .filter(b => b instanceof HTMLElement && !b.hidden)
      .map(b => [b.getAttribute('data-add') ?? '', b.classList.contains('tb-over')] as const),
  );
  const tucked = bar.filter(([, over]) => over).map(([id]) => id);
  assert.ok(tucked.length > 0, 'at 1280 px some tools tuck into ···');
  assert.deepStrictEqual(
    [...tucked].sort(),
    TOOLBAR.tuckOrder(bar.map(([id]) => id))
      .slice(0, tucked.length)
      .sort(),
    'the tools that tuck are the first in the table’s tuck order',
  );
  await page.click('#tbMore');
  const menu = await page.$$eval('#rowMenu .tbm-row span', spans => spans.map(sp => sp.textContent));
  assert.deepStrictEqual(
    menu,
    bar.filter(([, over]) => over).map(([id]) => TOOLBAR.tool(id)?.label),
    '··· names the tucked tools by the table, in the bar’s order',
  );
  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('toolbarTable: ok');
} finally {
  await l.close();
}
