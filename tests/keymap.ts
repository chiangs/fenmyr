// The keyboard shortcuts that are not a toolbar tool's, listed in Settings → Board. The table (src/web/input/keymap.ts) is
// checked on its own: every entry names a group, every group has an entry, the handler's tool letters are the toolbar's
// plus the key-only tools', the handler answers no letter the tables leave out, and the Pieces picker shows the same keys
// for Box and Text. Then in the real app each entry has a check that presses its keys on a board and asserts what
// changed, the Board tab shows the list as the table has it, with every key ending at one edge, and the keys it shows
// under Wireframe do what they say.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { SHORTCUT_GROUPS, SHORTCUTS, TOOL_KEYS } from '../src/web/input/keymap.ts';
import { TOOLBAR } from '../src/web/ui/toolbarTable.ts';
import { PIECE_GROUPS } from '../src/web/wireframe/pieceGroups.ts';
import { boardChecks } from './support/keyChecks.ts';
import { BOARD, kit } from './support/keyKit.ts';
import { launch } from './support/launch.ts';
import { noteChecks } from './support/noteKeyChecks.ts';
import { drawBox, dropText, panelChecks } from './support/panelKeyChecks.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const MAC_SYMBOL = /[⌃⌥⇧⌘]/,
  MAC_SYMBOLS = /[⌃⌥⇧⌘]/g;

// ---------- the table ----------
const groupIds = SHORTCUT_GROUPS.map(g => g.id),
  ids = SHORTCUTS.map(s => s.id);
assert.strictEqual(new Set(groupIds).size, groupIds.length, 'each group has its own id');
assert.strictEqual(new Set(ids).size, ids.length, 'each shortcut has its own id');
for (const s of SHORTCUTS) {
  assert.ok(groupIds.includes(s.group), `${s.id} names a group that exists, not "${s.group}"`);
  assert.ok(s.keys && s.does, `${s.id} has keys and a description`);
  assert.ok(!/\b(Ctrl|Alt|Shift|Cmd)\b/.test(s.keys), `${s.id}: keys are written in Mac symbols, not "${s.keys}"`);
}
for (const g of SHORTCUT_GROUPS)
  assert.ok(
    SHORTCUTS.some(s => s.group === g.id),
    `the group ${g.id} has an entry`,
  );

// tools: the toolbar table's letters and the key-only tools' make the handler's list
const toolbarLetters = TOOLBAR.tools.flatMap(t => (t.key?.length === 1 ? [t.key.toLowerCase()] : [])),
  keyOnly = SHORTCUTS.filter(s => s.tool),
  keyOnlyLetters = keyOnly.map(s => s.keys.toLowerCase());
assert.deepStrictEqual(keyOnly.map(s => s.keys).sort(), ['R', 'X'], 'the key-only tools are Box and Text');
for (const s of keyOnly) {
  assert.strictEqual(s.keys.length, 1, `${s.id} is a letter`);
  assert.ok(
    !toolbarLetters.includes(s.keys.toLowerCase()),
    `${s.id} has no toolbar button, so no toolbar tool has its key`,
  );
}
const toolbarKeys = new Set(TOOLBAR.tools.map(t => t.key));
for (const s of SHORTCUTS)
  assert.ok(
    !toolbarKeys.has(s.keys),
    `${s.id}: a toolbar tool's key shows in Layout, so it is not copied here (${s.keys})`,
  );
for (const key of TOOL_KEYS)
  assert.ok(
    toolbarLetters.includes(key) || keyOnlyLetters.includes(key),
    `the handler's tool letter ${key} is a toolbar key or a tool: true entry`,
  );
for (const key of [...toolbarLetters, ...keyOnlyLetters])
  if (key !== 'p') assert.ok(TOOL_KEYS.includes(key), `${key} puts a tool in hand, so it puts drawing down first`);
assert.ok(!TOOL_KEYS.includes('p'), 'P is the Draw tool itself: it toggles drawing, so it is not in the list');

// the handler answers no letter the tables leave out: a new key-only tool has to be listed
const handler = fs.readFileSync(path.join(ROOT, 'src/web/input/shortcuts.ts'), 'utf8'),
  answered = [...handler.matchAll(/\bk === '(.)'/g)].flatMap(m => (m[1] ? [m[1]] : [])),
  listed = new Set([...toolbarLetters, ...SHORTCUTS.filter(s => s.keys.length === 1).map(s => s.keys.toLowerCase())]);
assert.ok(answered.length >= 15, `the scan finds the handler's letters (${answered.length})`);
for (const letter of answered)
  assert.ok(listed.has(letter), `the key handler answers "${letter}", which is neither a toolbar key nor in SHORTCUTS`);

// the Pieces picker shows the Box and Text keys too, and they are the table's
const picker = PIECE_GROUPS.flatMap(g => g.cells.flatMap(c => (c.kind === 'tool' ? [c] : [])));
assert.deepStrictEqual(picker.map(c => c.tool).sort(), ['box', 'text'], 'the picker has a Box and a Text cell');
for (const cell of picker) {
  const entry = SHORTCUTS.find(s => s.id === cell.tool);
  assert.ok(entry?.tool, `the picker's ${cell.tool} cell has a tool entry`);
  assert.strictEqual(
    entry.keys,
    cell.key,
    `the picker shows ${cell.tool} under ${cell.key}, the table says ${entry.keys}`,
  );
}

// ---------- the real app ----------
const l = await launch({ boards: [BOARD], open: 'keys' });
const failed: string[] = [];
const attempt = async (what: string, run: () => Promise<void>) => {
  try {
    await run();
  } catch (e) {
    failed.push(`${what}: ${(e instanceof Error ? e.message : String(e)).split('\n')[0]}`);
  }
};
try {
  const { page } = l;
  const k = await kit(page);

  // each entry has a check that presses its keys, and a check has an entry
  const checks = { ...boardChecks(page, k), ...panelChecks(page, k), ...noteChecks(page, k) };
  assert.deepStrictEqual(
    ids.filter(id => !(id in checks)),
    [],
    'every shortcut in the table has a check that presses it',
  );
  assert.deepStrictEqual(
    Object.keys(checks).filter(id => !ids.includes(id)),
    [],
    'every check is for a shortcut in the table',
  );

  // the Board tab: the list, group by group, below the toggles
  await attempt('the Board tab', async () => {
    await k.reset();
    await page.click('#gearBtn');
    await page.click('#setTabs [data-tab="board"]');
    await page.waitForTimeout(200);
    const shown = await page.evaluate(() => {
      const keys = document.getElementById('setKeys'),
        section = keys?.closest('section'),
        toggle = document.querySelector('#settings [data-set="keys"]')?.getBoundingClientRect();
      return {
        visible: !!section?.checkVisibility(),
        heading: section?.querySelector('h3')?.textContent ?? '',
        top: keys?.getBoundingClientRect().top ?? 0,
        toggleBottom: toggle?.bottom ?? 0,
        toggleRight: toggle?.right ?? 0,
        groups: [...(keys?.querySelectorAll('.sk-group') ?? [])].map(g => ({
          heading: g.querySelector('.sk-head')?.textContent ?? '',
          note: g.querySelector('.sk-note')?.textContent ?? null,
          rows: [...g.querySelectorAll('.sk-row')].map(r => {
            const cap = r.querySelector('kbd.keycap'),
              cell = r.querySelector('.sk-key'),
              box = cap?.getBoundingClientRect();
            return {
              does: r.firstElementChild?.textContent ?? '',
              keys: cap?.textContent ?? '',
              caps: r.querySelectorAll('.keycap').length,
              lines: cap?.getClientRects().length ?? 0,
              right: box?.right ?? -1,
              left: box?.left ?? -1,
              cellRight: cell?.getBoundingClientRect().right ?? -2,
              spills: cell ? cell.scrollWidth > cell.clientWidth : true,
              descRight: r.firstElementChild?.getBoundingClientRect().right ?? 0,
            };
          }),
        })),
      };
    });
    assert.ok(shown.visible, 'the Keyboard shortcuts section shows on the Board tab');
    assert.strictEqual(shown.heading, 'Keyboard shortcuts');
    assert.ok(shown.top > shown.toggleBottom, 'and sits below the toggles');

    const want = SHORTCUT_GROUPS.filter(g => SHORTCUTS.some(s => s.group === g.id));
    assert.deepStrictEqual(
      shown.groups.map(g => [g.heading, g.note]),
      want.map(g => [g.heading, g.note ?? null]),
      'one block per group with entries, in the table’s order, with its note when it has one',
    );
    const platform = await page.evaluate(() => Fenmyr.platform);
    shown.groups.forEach((g, i) => {
      const entries = SHORTCUTS.filter(s => s.group === want[i]?.id);
      assert.deepStrictEqual(
        g.rows.map(r => r.does),
        entries.map(s => s.does),
        `${g.heading}: a row for each entry, in order`,
      );
      g.rows.forEach((r, j) => {
        const entry = entries[j];
        assert.ok(entry, `${g.heading}: row ${j} has an entry`);
        // the same keys, spelled for this computer: Mac symbols become Ctrl, Alt and Shift away from a Mac
        const modifiers = new Set(entry.keys.match(MAC_SYMBOLS)).size,
          base = entry.keys.replace(MAC_SYMBOLS, '');
        if (platform === 'mac') assert.strictEqual(r.keys, entry.keys, `${entry.id}: the keys as written`);
        else {
          assert.ok(!MAC_SYMBOL.test(r.keys), `${entry.id}: "${r.keys}" has no Mac symbol on ${platform}`);
          assert.ok(r.keys.endsWith(base), `${entry.id}: "${r.keys}" ends in ${base}`);
          assert.strictEqual(
            r.keys
              .slice(0, r.keys.length - base.length)
              .split('+')
              .filter(Boolean).length,
            modifiers,
            `${entry.id}: "${r.keys}" spells out ${modifiers} modifiers`,
          );
        }
        assert.strictEqual(r.caps, 1, `${entry.id}: one keycap`);
        assert.strictEqual(r.lines, 1, `${entry.id}: its keys stay on one line`);
        assert.ok(!r.spills, `${entry.id}: its keys do not spill out of their cell`);
        assert.ok(Math.abs(r.right - r.cellRight) <= 0.5, `${entry.id}: the keycap is right-aligned in its cell`);
        assert.ok(r.left >= r.descRight, `${entry.id}: the description ends before its keys`);
        assert.ok(
          Math.abs(r.right - shown.toggleRight) <= 1,
          `${entry.id}: its keys end at the toggles' edge (${r.right} against ${shown.toggleRight})`,
        );
      });
    });
    const edges = shown.groups.flatMap(g => g.rows.map(r => r.right));
    assert.strictEqual(edges.length, SHORTCUTS.length, 'every shortcut is on the list once');
    assert.ok(Math.max(...edges) - Math.min(...edges) <= 0.5, 'every key ends at one edge');

    // the Wireframe subsection: R and X, and the note that says why they are here
    const wire = shown.groups.find(g => g.heading === 'Wireframe');
    assert.strictEqual(wire?.note, 'Tools with no toolbar button');
    assert.deepStrictEqual(
      wire?.rows.map(r => r.keys),
      ['R', 'X'],
      'the Wireframe subsection shows R and X',
    );
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    // the keys it shows, pressed: R then a drag draws a Box, X then a click drops a Text card
    const [box, text] = wire?.rows ?? [];
    assert.ok(box && text, 'the Wireframe subsection has two rows');
    assert.ok(box.does.startsWith('Box') && text.does.startsWith('Text'), 'R is the Box and X the Text');
    await drawBox(page, k, box.keys.toLowerCase());
    await dropText(page, k, text.keys.toLowerCase());
  });

  // each entry's own check
  for (const s of SHORTCUTS) await attempt(`${s.id} (${s.keys})`, checks[s.id] ?? (async () => {}));

  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  assert.deepStrictEqual(failed, [], `shortcuts that failed:\n  ${failed.join('\n  ')}`);
  console.log(`keymap: ok (${SHORTCUTS.length} shortcuts)`);
} finally {
  await l.close();
}
