// The prototype board's screen: Myra docked open on the left, the git bar, the code pane, folding columns, and plain
// boards untouched.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch } from './support/launch.ts';

const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-layout-')));
const repo = path.join(work, 'acme');
fs.mkdirSync(repo);
execFileSync('git', ['-C', repo, 'init', '-q', '-b', 'main']);
const note = { id: 'n1', type: 'note', x: 40, y: 40, w: 220, h: 120, text: 'People miss the promo field' };
const l = await launch({ boards: [{ id: 'plain', name: 'Plain', cards: [note], links: [], tray: [] }], open: 'plain' });
const { page } = l;
const state = () =>
  page.evaluate(() => {
    const rect = (s: string) => {
      const r = document.querySelector(s)?.getBoundingClientRect();
      return r ? [Math.round(r.left), Math.round(r.width)] : null;
    };
    return {
      proto: document.body.classList.contains('proto'),
      docked: document.getElementById('mChat')?.parentElement?.id,
      chatOpen: document.getElementById('myra')?.classList.contains('chat'),
      folded: [...document.querySelectorAll('.pr-pane.folded')].map(p => p.getAttribute('data-p')),
      git: document.getElementById('prGit')?.textContent ?? '',
      code: document.querySelector('.pc-text')?.textContent ?? '',
      stage: rect('#stage'),
      slot: rect('[data-p="canvas"] .pr-body'),
    };
  });
const resize = (w: number) =>
  l.app.evaluate(({ BrowserWindow }, w) => BrowserWindow.getAllWindows()[0]?.setSize(w, 900), w);

try {
  await page.evaluate(async repo => {
    await window.Fenmyr.saveFolders({
      projects: [{ id: 'p1', name: 'Acme', open: true, repo: { path: repo } }],
      folders: [{ id: 'pf', name: 'Prototypes', project: 'p1', kind: 'prototyping', open: true }],
      order: {},
    });
    const proto = await window.Fenmyr.protoCreate({ root: repo, name: 'Checkout flow', stack: 'react' });
    await window.Fenmyr.save({
      id: 'pb',
      name: 'Checkout flow',
      folder: 'pf',
      kind: 'prototype',
      proto,
      cards: [],
      links: [],
      tray: [],
    });
    await window.__fenmyr.refreshBoards();
    await window.__fenmyr.openBoard('pb');
  }, repo);
  await page.waitForTimeout(800);
  let s = await state();
  assert.ok(s.proto && s.docked === 'prChat' && s.chatOpen, 'a prototype board docks Myra’s chat open on the left');
  assert.deepStrictEqual(s.folded, [], 'at 1440 px every column shows');
  assert.match(
    s.git,
    /acme\s*main\s*\d+ changes? not committed\s*No commits yet/,
    'the git bar names the repo, branch, changes and sync',
  );
  const gitBar = await page.evaluate(() => {
    return {
      icons: [...document.querySelectorAll('#prGit svg[data-ico]')].map(i => i.getAttribute('data-ico')),
      commit: document.querySelector('#prGit [data-git="commit"]')?.textContent,
    };
  });
  assert.deepStrictEqual(
    gitBar,
    { icons: ['git-branch', 'git-commit', 'cloud-up'], commit: 'Commit' },
    'the branch and buttons carry icons, and Commit has no ellipsis',
  );
  assert.match(s.code, /export function App/, 'the code pane opens on App.tsx');
  assert.deepStrictEqual(s.stage, s.slot, 'the canvas sits exactly in its column');

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
    /What are we building\?/,
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
  assert.ok((await state()).chatOpen, 'neither Esc nor the close button closes it');

  const bar = () =>
    page.evaluate(() => ({
      tabs: [...document.querySelectorAll('.pc-file')].map(b => b.textContent),
      dropdown: document.getElementById('pr-code')?.classList.contains('pc-many'),
    }));
  assert.deepStrictEqual(
    await bar(),
    { tabs: ['App.tsx', 'Values'], dropdown: false },
    'the code pane lists the prototype’s code: not Fenmyr’s wiring, nor a styles.css holding only Tailwind',
  );
  await page.click('.pc-file:has-text("Values")');
  await page.waitForTimeout(300);
  assert.match((await state()).code, /no controls yet/, 'Values stands in for tweaks.json');
  await page.click('.pc-all');
  await page.waitForTimeout(300);
  assert.ok((await bar()).tabs.includes('index.html'), 'All files shows the wiring too');
  const src = path.join(repo, 'prototypes', 'checkout-flow', 'src');
  fs.writeFileSync(path.join(src, 'styles.css'), '@import "tailwindcss";\n@theme { --color-brand: #f60; }\n');
  fs.mkdirSync(path.join(src, 'components'));
  fs.writeFileSync(path.join(src, 'components', 'PromoField.tsx'), 'export const PromoField = () => null;\n');
  await page.click('.pc-all');
  await page.waitForTimeout(300);
  assert.deepStrictEqual(
    await bar(),
    { tabs: ['App.tsx', 'components/PromoField.tsx', 'styles.css', 'Values'], dropdown: true },
    'a styles.css with styles of its own counts, and tabs that no longer fit become a dropdown',
  );
  const drag = async (dx: number) => {
    const div = await page.locator('.pr-div[data-d="code"]').boundingBox();
    if (!div) throw new Error('no divider');
    await page.mouse.move(div.x + 3, div.y + 200);
    await page.mouse.down();
    await page.mouse.move(div.x + 3 + dx, div.y + 200, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);
  };
  await drag(-300);
  assert.strictEqual((await bar()).dropdown, false, 'a wider code column has room for the tabs again');
  await drag(300);
  assert.strictEqual((await bar()).dropdown, true, 'and a narrower one goes back to the dropdown');
  await page.click('.pc-pick');
  assert.deepStrictEqual(
    await page.evaluate(() => [...document.querySelectorAll('.row-menu.pc-menu > *')].map(e => e.textContent)),
    ['App.tsx', 'styles.css', 'Values', 'components/', 'PromoField.tsx'],
    'the dropdown is Fenmyr’s own menu, files grouped by folder',
  );
  await page.click('.pc-menu [data-file="src/components/PromoField.tsx"]');
  await page.waitForTimeout(300);
  assert.match((await state()).code, /PromoField/, 'picking from it shows the file');
  assert.strictEqual(await page.locator('.pc-menu').count(), 0, 'and closes it');
  assert.strictEqual(await page.textContent('.pc-pick'), 'components/PromoField.tsx', 'the picker names the file');
  await page.click('.pc-copy');
  await page.waitForTimeout(200);
  assert.strictEqual(
    await l.app.evaluate(({ clipboard }) => clipboard.readText()),
    'export const PromoField = () => null;\n',
    'Copy puts the file on the clipboard',
  );

  await page.click('#newBoard');
  await page.waitForSelector('#npName');
  assert.match(
    (await page.textContent('.tdlg h3')) ?? '',
    /New prototype in “Prototypes”/,
    '+ Board in a prototyping folder makes a prototype',
  );
  await page.keyboard.press('Escape');

  assert.strictEqual(
    await page.locator('[data-fold="preview"], [data-open="preview"]').count(),
    0,
    'the preview never folds',
  );
  await page.click('[data-fold="code"]');
  await page.waitForTimeout(300);
  s = await state();
  assert.deepStrictEqual(s.folded, ['code'], 'the code column folds to a strip');
  assert.deepStrictEqual(s.stage, s.slot, 'and the canvas follows its column');
  await page.click('[data-open="code"]');

  await resize(1200);
  await page.waitForTimeout(500);
  assert.deepStrictEqual((await state()).folded, ['canvas'], 'a narrower window folds the canvas first');
  await resize(760);
  await page.waitForTimeout(500);
  assert.deepStrictEqual((await state()).folded, ['canvas', 'code'], 'then the code');
  await resize(1440);

  await page.evaluate(() => window.__fenmyr.openBoard('plain'));
  await page.waitForTimeout(500);
  s = await state();
  assert.ok(
    !s.proto && s.docked === 'myra' && !s.chatOpen,
    'a plain board gets the chat back under Myra’s button, closed',
  );
  assert.deepStrictEqual(l.errors, []);
  console.log('LAYOUT OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
