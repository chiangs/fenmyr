// The prototype board's screen: Myra docked open on the left, the git bar, the code pane, folding columns, and plain
// boards untouched.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './support/launch.ts';
import { freshRepo, openPrototype } from './support/prototype.ts';

const { work, repo } = freshRepo('fenmyr-layout-');
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
  await openPrototype(page, repo);
  // the app starting with the prototype board as the last one open
  await l.app.context().addInitScript(() => {
    try {
      localStorage.setItem('fenmyr:last', 'pb');
    } catch {}
  });
  await page.reload();
  await page.waitForFunction(() => window.__fenmyr?.curBoard()?.id === 'pb');
  await page.waitForTimeout(800);
  let s = await state();
  assert.doesNotMatch(s.git, /isn’t linked/, 'starting the app on a prototype board finds its repo straight away');
  assert.deepStrictEqual(
    await page.evaluate(() => [
      document.getElementById('tray')?.parentElement?.id,
      document.getElementById('design')?.parentElement?.id,
    ]),
    ['side', 'side'],
    'Unsorted and Wireframe join the left column, beside the board',
  );
  const folded = () =>
    page.evaluate(() => {
      const min = (k: string) =>
        !!document.querySelector(k === 'design' ? '#design' : `.box[data-box="${k}"]`)?.classList.contains('min');
      return { boards: min('boards'), layers: min('layers'), colors: min('colors'), design: min('design') };
    });
  assert.deepStrictEqual(
    await folded(),
    { boards: false, layers: true, colors: true, design: true },
    'a prototype board opens with only the board list and Unsorted unfolded',
  );
  assert.deepStrictEqual(
    await page.evaluate(() => {
      const d = document.getElementById('design');
      const grip = d?.querySelector(':scope > .rz-grip');
      return [!!grip && getComputedStyle(grip).display, !!d && d.scrollHeight <= d.clientHeight];
    }),
    ['none', true],
    'a folded Wireframe shows its whole title, with no grip and no scrollbar',
  );
  await page.click('.box[data-box="layers"] .mini');
  await page.evaluate(() => window.__fenmyr.openBoard('plain'));
  await page.waitForTimeout(300);
  assert.deepStrictEqual(
    await folded(),
    { boards: false, layers: false, colors: false, design: false },
    'other boards keep their own',
  );
  await page.evaluate(() => window.__fenmyr.openBoard('pb'));
  await page.waitForTimeout(300);
  assert.deepStrictEqual(
    await folded(),
    { boards: false, layers: false, colors: true, design: true },
    'and what the person opens on a prototype board stays open there',
  );
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
  assert.deepStrictEqual(
    await page.evaluate(() =>
      [...document.querySelectorAll('.pc-acts button')].map(b => [b.className, b.querySelector('svg')?.dataset.ico]),
    ),
    [
      ['pv-btn pc-all', 'eye'],
      ['pv-btn pc-copy', 'copy'],
    ],
    'Copy sits right of All/Fewer files, each with an icon',
  );
  await page.click('.pc-pick');
  assert.ok(
    ((await page.locator('.pc-menu').boundingBox())?.width ?? 0) >= 260,
    'the file menu is wide enough for a component’s name',
  );
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
  const sticky = await page.evaluate(() => {
    const r = (sel: string) => document.querySelector(sel)?.getBoundingClientRect();
    const pick = r('.pc-pick'),
      acts = r('.pc-acts'),
      files = r('.pc-bar');
    const text = document.querySelector('.pc-text');
    const before = r('.pc-bar')?.top;
    if (text) {
      text.textContent = 'x\n'.repeat(400);
      text.scrollTop = 2000;
    }
    return {
      fills: !!pick && !!acts && !!files && pick.left - files.left < 12 && acts.left - pick.right < 10,
      stays: r('.pc-bar')?.top === before && (text?.scrollTop ?? 0) > 0,
    };
  });
  assert.deepStrictEqual(
    sticky,
    { fills: true, stays: true },
    'the file button fills the bar, and scrolling the code leaves the bar in view',
  );

  const panes = await page.evaluate(() => {
    document.body.classList.add('dark', 'following-caelestia');
    document.body.style.setProperty('--panel', 'rgb(16, 20, 30)');
    const bg = (sel: string) => getComputedStyle(document.querySelector(sel) ?? document.body).backgroundColor;
    const out = [bg('[data-p="code"]'), bg('#prGit'), bg('#prChat')];
    document.body.classList.remove('dark', 'following-caelestia');
    document.body.style.removeProperty('--panel');
    return out;
  });
  assert.deepStrictEqual(
    panes,
    ['rgb(16, 20, 30)', 'rgb(16, 20, 30)', 'rgb(16, 20, 30)'],
    'with Caelestia’s dark panels, the prototype screen takes its panel colour',
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
  const arrows = () =>
    page.evaluate(() =>
      Object.fromEntries(
        [...document.querySelectorAll('.pr-head [data-fold] svg, .pr-pane.folded [data-open] svg')].map(i => [
          i.closest('[data-fold], [data-open]')?.getAttribute('data-fold') ??
            `open ${i.closest('[data-open]')?.getAttribute('data-open')}`,
          i.getAttribute('data-ico'),
        ]),
      ),
    );
  assert.deepStrictEqual(
    await arrows(),
    { canvas: 'caret-left', code: 'caret-right' },
    'each fold arrow points the way its column folds: the board left, the code towards Myra',
  );
  await page.evaluate(() => document.body.classList.remove('calm'));
  const codeWidth = () =>
    page.evaluate(() => document.querySelector('[data-p="code"]')?.getBoundingClientRect().width ?? 0);
  const open = await codeWidth();
  await page.click('[data-fold="code"]');
  await page.waitForTimeout(90);
  const midway = await codeWidth();
  assert.ok(midway < open && midway > 40, `with motion on, the column slides shut (${open} → ${midway} px midway)`);
  await page.waitForTimeout(400);
  s = await state();
  assert.deepStrictEqual(s.folded, ['code'], 'the code column folds to a strip');
  assert.deepStrictEqual(s.stage, s.slot, 'and the canvas follows its column');
  assert.strictEqual((await arrows())['open code'], 'caret-left', 'its strip’s arrow points back to open it');
  await page.click('[data-open="code"]');
  await page.waitForTimeout(400);
  assert.ok(Math.abs((await codeWidth()) - open) < 2, 'and opening it slides it back to its width');
  await page.evaluate(() => document.body.classList.add('calm'));

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
  assert.strictEqual(
    await page.evaluate(() => document.getElementById('tray')?.parentElement?.id),
    'sideR',
    'and Unsorted goes back to the right',
  );
  assert.deepStrictEqual(l.errors, []);
  console.log('LAYOUT OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
