// Settings has seven tabs. Appearance, after General, holds everything about how Fenmyr looks: the theme, your own colours, the
// icon style, the window buttons, the board's font, grid, new-note colour, tilt and motion, and the cursor. General keeps who you
// are, Connections gathers what Fenmyr links to (Claude, Myra's helpers, Git, Obsidian), Layout holds the toolbar and the
// widgets, and Board keeps how it behaves. An Accessibility section appears on Appearance only while the theme in use offers
// something (Clear and Lantern print each note's colour name), and its Colour names switch turns that off for both.
import assert from 'node:assert';
import { launch } from './support/launch.ts';

const note = { id: 'n', type: 'note', x: 0, y: 0, w: 220, h: 120, r: 0, color: 'butter', text: 'A note' },
  board = { id: 'b', name: 'B', cards: [note], links: [], tray: [], view: { x: 300, y: 200, z: 1 } };

const l = await launch({ boards: [board], open: 'b' });
try {
  const { page } = l;
  await page.click('#gearBtn');

  const tabs = await page.$$eval('#setTabs button', bs => bs.map(b => b.textContent));
  assert.deepStrictEqual(
    tabs,
    ['General', 'Appearance', 'Layout', 'Board', 'Myra', 'Connections', 'About'],
    'the seven tabs, Appearance second',
  );

  // which tab each section is on
  const sections = await page.$$eval('#settings .set-body section[data-tab]', ss =>
    ss.flatMap(s => {
      const heading = s.querySelector('h3')?.textContent;
      return heading ? [[heading, s.getAttribute('data-tab')]] : [];
    }),
  );
  assert.deepStrictEqual(
    Object.fromEntries(sections),
    {
      Look: 'appearance',
      'On the board': 'appearance',
      'Your cursor': 'appearance',
      Accessibility: 'appearance',
      'About you': 'general',
      'Your boards': 'general',
      'Camera & microphone': 'general',
      Myra: 'myra',
      'Claude usage': 'connections',
      "Myra's helpers": 'connections',
      'Git and GitHub': 'connections',
      'Obsidian vaults': 'connections',
      'Working on the board': 'board',
      'Keyboard shortcuts': 'board',
      Toolbar: 'layout',
      Widgets: 'layout',
    },
    'each section is on its tab',
  );

  // which tab each control is on
  const tabOf = (selector: string) =>
    page.evaluate(
      s => document.querySelector(`#settings ${s}`)?.closest<HTMLElement>('section')?.dataset.tab ?? null,
      selector,
    );
  for (const selector of [
    '[data-seg="theme"]',
    '#themePick',
    '[data-set="caelestia"]',
    '[data-seg="iconStyle"]',
    '[data-set="winButtons"]',
    '#curPrev',
    '[data-set="fancyCursor"]',
    '[data-set="colourNames"]',
    '[data-set="thickFocus"]',
    '[data-set="straightCards"]',
    // what the Board tab used to hold about how the board looks
    '#defaultFontBtn',
    '[data-col="accent"]',
    '#gridShapes',
    '#noteColors',
    '[data-set="tilt"]',
    '[data-set="motion"]',
  ])
    assert.strictEqual(await tabOf(selector), 'appearance', `${selector} is on Appearance`);
  for (const selector of ['#setName', '#setBdMonth', '#setBdDay'])
    assert.strictEqual(await tabOf(selector), 'general', `${selector} stays on General`);
  for (const selector of ['[data-set="dblNote"]', '[data-set="snap"]', '[data-set="keys"]'])
    assert.strictEqual(await tabOf(selector), 'board', `${selector} stays on Board`);
  for (const selector of ['[data-set="mobbin"]', '[data-set="webAccess"]'])
    assert.strictEqual(await tabOf(selector), 'connections', `${selector} is on Connections`);
  for (const selector of ['#setTbList', '[data-set="wLayers"]', '[data-set="wZoom"]'])
    assert.strictEqual(await tabOf(selector), 'layout', `${selector} is on Layout`);

  // opening Appearance shows them, and General no longer does
  const shown = (selector: string) => page.locator(`#settings ${selector}`).isVisible();
  assert.strictEqual(await shown('#setName'), true, 'General opens first, with your name');
  assert.strictEqual(await shown('#themePick'), false, 'and not the themes');
  await page.click('#setTabs [data-tab="appearance"]');
  assert.strictEqual(await shown('#themePick'), true, 'Appearance shows the themes');
  assert.strictEqual(await shown('[data-seg="iconStyle"]'), true, 'and the icon style');
  assert.strictEqual(await shown('#setName'), false, 'and not your name');

  // the colour name a note prints at its lower right, as the page draws it
  const name = () =>
    page.evaluate(() => {
      const frame = document.querySelector('.card.note > .frame');
      const css = frame ? getComputedStyle(frame, '::after') : null;
      return css ? { display: css.display, content: css.content } : null;
    });
  const printed = async () => {
    const n = await name();
    return n?.display === 'block' && n.content.length > 2;
  };
  const accessible = () => shown('#setAccess');

  // Default offers nothing, so there is no Accessibility section, and no name on the note
  await page.click('#settings [data-seg="theme"] [data-v="light"]');
  assert.strictEqual(await accessible(), false, 'Default light has no Accessibility section');
  assert.strictEqual(await printed(), false, 'and prints no colour name');

  // Clear prints it, and the switch is there and on
  await page.click('#themeLight [data-v="clear"]');
  assert.strictEqual(await accessible(), true, 'Clear has an Accessibility section');
  assert.strictEqual(await page.locator('[data-set="colourNames"]').isChecked(), true, 'Colour names is on');
  assert.strictEqual(await printed(), true, 'and the note prints its colour name');

  // off hides it, and is kept
  await page.click('[data-set="colourNames"]');
  assert.strictEqual(await printed(), false, 'turning Colour names off hides the name');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fenmyr:settings') || '{}'));
  assert.strictEqual(saved.colourNames, false, 'and it is saved');

  // the thicker focus ring and straight cards are options the same themes offer: on to begin with, each turned off on its
  // own, and kept
  const optionOf = (key: string) => page.locator(`[data-set="${key}"]`);
  const bodyHas = (cls: string) => page.evaluate(c => document.body.classList.contains(c), cls);
  for (const [key, off] of [
    ['thickFocus', 'no-thick-focus'],
    ['straightCards', 'no-straight'],
  ] as const) {
    assert.strictEqual(await optionOf(key).isChecked(), true, `${key} is on in Clear`);
    assert.strictEqual(await bodyHas(off), false, `and ${off} is not set`);
    await optionOf(key).click();
    assert.strictEqual(await bodyHas(off), true, `turning ${key} off sets ${off}`);
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('fenmyr:settings') || '{}'));
    assert.strictEqual(kept[key], false, `and ${key} is saved off`);
  }

  // the other themes: only Lantern offers the section, and the choice follows you to it
  await page.click('#themeLight [data-v="midsummer"]');
  assert.strictEqual(await accessible(), false, 'Midsummer has no Accessibility section');
  await page.click('#settings [data-seg="theme"] [data-v="dark"]');
  await page.click('#themeDark [data-v="polar-night"]');
  assert.strictEqual(await accessible(), false, 'Polar Night has none either');
  await page.click('#themeDark [data-v="lantern"]');
  assert.strictEqual(await accessible(), true, 'Lantern has one');
  assert.strictEqual(await page.locator('[data-set="colourNames"]').isChecked(), false, 'still off');
  assert.strictEqual(await printed(), false, 'and Lantern prints no name');
  await page.click('[data-set="colourNames"]');
  assert.strictEqual(await printed(), true, 'turning it on again prints it in Lantern');
  for (const key of ['thickFocus', 'straightCards'])
    assert.strictEqual(await optionOf(key).isChecked(), false, `${key} is still off in Lantern`);
  for (const key of ['thickFocus', 'straightCards']) await optionOf(key).click();

  // a theme that doesn't print names doesn't start to because the switch is on
  await page.click('#themeDark [data-v="default"]');
  assert.strictEqual(await accessible(), false, 'Default dark has no Accessibility section');
  assert.strictEqual(await printed(), false, 'and prints no name with the switch on');
  assert.deepStrictEqual(l.errors, [], 'no page errors');
} finally {
  await l.close();
}

// a saved choice is read back: Clear with its names off prints none
const off = await launch({
  boards: [board],
  open: 'b',
  settings: { theme: 'light', lightTheme: 'clear', colourNames: false },
});
try {
  const display = await off.page.evaluate(() => {
    const frame = document.querySelector('.card.note > .frame');
    return frame ? getComputedStyle(frame, '::after').display : null;
  });
  assert.strictEqual(display, 'none', 'Clear with Colour names saved off prints none');
} finally {
  await off.close();
}
console.log('appearanceTab: ok');
