// Settings → Layout shows each tool's shortcut to the left of its switch, in one column. The key reads the way the tool's
// tooltip spells it for this computer (⇧V is Shift+V on Windows and Linux), a tool with no key leaves its cell empty, every
// key ends at the same edge, and none wraps or spills out of its cell.
import assert from 'node:assert';
import { TOOLBAR } from '../src/web/ui/toolbarTable.ts';
import { launch } from './support/launch.ts';

const MAC_SYMBOLS = /[⌃⌥⇧⌘]/;
const note = { id: 'n', type: 'note', x: 0, y: 0, w: 220, h: 120, r: 0, color: 'white', text: 'A note' };

const l = await launch({
  boards: [{ id: 'b', name: 'Bare', cards: [note], links: [], tray: [], view: { x: 300, y: 200, z: 1 } }],
  open: 'b',
});
try {
  const { page } = l;
  await page.click('#gearBtn');
  await page.click('#setTabs [data-tab="layout"]');

  // each key as the tooltip spells it: the text after "Name · " on the tool's own button
  const tips = await page.$$eval('#tools > [data-add]', bs =>
    bs.map(b => [b.getAttribute('data-add') ?? '', b instanceof HTMLElement ? (b.dataset.tip ?? '') : ''] as const),
  );
  const spelt = (id: string, label: string) => {
    const tip = tips.find(([k]) => k === id)?.[1] ?? '';
    return tip.startsWith(`${label} · `) ? tip.slice(label.length + 3) : '';
  };

  const rows = await page.$$eval('#setTbList .tbe-row', rs =>
    rs.map(r => {
      const cell = r.querySelector('.tbe-key'),
        keycaps = [...r.querySelectorAll('.keycap')],
        toggle = r.querySelector('.tgl')?.getBoundingClientRect(),
        box = cell?.getBoundingClientRect(),
        cap = keycaps[0]?.getBoundingClientRect();
      return {
        id: r.getAttribute('data-tb') ?? '',
        hasCell: !!cell,
        text: cell?.textContent ?? '',
        keycaps: keycaps.length,
        capTag: keycaps[0]?.tagName ?? '',
        capRight: cap?.right ?? null,
        capHeight: cap?.height ?? null,
        capLines: keycaps[0]?.getClientRects().length ?? 0,
        cellLeft: box?.left ?? null,
        cellRight: box?.right ?? null,
        cellSpills: cell ? cell.scrollWidth > cell.clientWidth : false,
        capLeft: cap?.left ?? null,
        toggleLeft: toggle?.left ?? null,
        nameRight: r.querySelector('.tbe-name')?.getBoundingClientRect().right ?? null,
      };
    }),
  );
  assert.deepStrictEqual(
    rows.map(r => r.id),
    TOOLBAR.tools.map(t => t.id),
    'the list has a row for every tool',
  );

  const num = (v: number | null, what: string) => {
    assert.ok(v !== null, what);
    return v;
  };
  const edges: number[] = [],
    heights: number[] = [];
  for (const tool of TOOLBAR.tools) {
    const row = rows.find(r => r.id === tool.id);
    assert.ok(row, `${tool.id} has a row`);
    assert.ok(row.hasCell, `${tool.id}: its row has a key cell`);
    if (!tool.key) {
      assert.strictEqual(row.text, '', `${tool.id}: with no key its cell is empty`);
      assert.strictEqual(row.keycaps, 0, `${tool.id}: with no key its cell holds no keycap`);
      continue;
    }
    const want = spelt(tool.id, tool.label);
    assert.ok(want.endsWith(tool.key.slice(-1)), `${tool.id}: its tooltip spells the table's key (${want})`);
    assert.strictEqual(row.text, want, `${tool.id}: its row shows the key as its tooltip spells it`);
    assert.strictEqual(row.keycaps, 1, `${tool.id}: its key is one keycap`);
    assert.strictEqual(row.capTag, 'KBD', `${tool.id}: the keycap is a <kbd>`);
    assert.strictEqual(row.capLines, 1, `${tool.id}: the key stays on one line`);
    assert.ok(!row.cellSpills, `${tool.id}: the key does not spill out of its cell`);
    const capLeft = num(row.capLeft, `${tool.id} has a keycap`),
      capRight = num(row.capRight, `${tool.id} has a keycap`),
      cellLeft = num(row.cellLeft, `${tool.id} has a cell`),
      cellRight = num(row.cellRight, `${tool.id} has a cell`);
    edges.push(capRight);
    heights.push(num(row.capHeight, `${tool.id} has a keycap`));
    assert.ok(
      capLeft >= cellLeft - 0.5 && capRight <= cellRight + 0.5,
      `${tool.id}: the keycap sits inside its cell (${capLeft} to ${capRight}, cell ${cellLeft} to ${cellRight})`,
    );
    assert.ok(Math.abs(capRight - cellRight) <= 0.5, `${tool.id}: the keycap is right-aligned in its cell`);
  }
  assert.ok(edges.length >= 15, `most tools have a key (${edges.length})`);
  assert.ok(
    Math.max(...edges) - Math.min(...edges) <= 0.5,
    `every keycap ends at the same edge (${Math.min(...edges)} to ${Math.max(...edges)})`,
  );
  assert.ok(Math.max(...heights) - Math.min(...heights) <= 0.5, 'every keycap is one line tall');

  // an empty cell still holds its column, so every switch stands in the same place
  const toggles = rows.map(r => num(r.toggleLeft, `${r.id} has a switch`));
  assert.ok(
    Math.max(...toggles) - Math.min(...toggles) <= 0.5,
    'a row with no key keeps its switch in line with the rest',
  );
  for (const r of rows)
    assert.ok(
      num(r.cellRight, 'cell right') <= num(r.toggleLeft, 'switch left'),
      `${r.id}: the key is left of the switch`,
    );
  for (const r of rows)
    assert.ok(
      num(r.nameRight, 'name right') <= num(r.cellLeft, 'cell left') + 0.5,
      `${r.id}: the name ends before the key`,
    );

  // Windows and Linux spell the symbols out, in the list as in the tooltips
  const platform = await page.evaluate(() => Fenmyr.platform);
  if (platform !== 'mac')
    for (const r of rows) assert.ok(!MAC_SYMBOLS.test(r.text), `${r.id}: "${r.text}" has no Mac symbol on ${platform}`);
  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('toolKeyColumn: ok');
} finally {
  await l.close();
}
