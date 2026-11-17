// A tool tucked into ··· and in hand: ··· reads as pressed in Chromium's accessibility tree, and the tool's row in the
// ··· menu reads as checked, so a screen reader learns what the lit ··· shows.
import assert from 'node:assert';
import { launch, settle } from './support/launch.ts';

const note = { id: 'n', type: 'note', x: 0, y: 0, w: 220, h: 120, r: 0, color: 'white', text: 'A note' };
const l = await launch({
  boards: [{ id: 'b', name: 'Bare', cards: [note], links: [], tray: [], view: { x: 300, y: 200, z: 1 } }],
  open: 'b',
});
const { page, app } = l;
const cdp = await page.context().newCDPSession(page);
// the accessibility node a screen reader gets for the element a selector finds
const ax = async (selector: string) => {
  const { root } = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
  const n = nodes[0];
  const prop = (name: string) => n?.properties?.find(p => p.name === name)?.value.value;
  return { role: n?.role?.value, name: n?.name?.value, pressed: prop('pressed'), checked: prop('checked') };
};
const frames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

try {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1000, 800));
  await settle(page, 600);
  assert.ok(
    await page.evaluate(() => document.querySelector('#tools [data-add="frame"]')?.classList.contains('tb-over')),
    'at 1000 px the Wireframe button is tucked into ···',
  );
  assert.notStrictEqual((await ax('#tbMore')).pressed, 'true', '··· is not pressed with nothing in hand');
  await page.mouse.move(600, 300);
  await page.keyboard.press('w');
  await frames();
  assert.strictEqual((await ax('#tbMore')).pressed, 'true', '··· reads as pressed while the screen tool is in hand');
  await page.click('#tbMore');
  await frames();
  const row = await ax('#rowMenu [data-i="1"]');
  assert.deepStrictEqual(
    { role: row.role, name: row.name, checked: row.checked },
    { role: 'menuitemcheckbox', name: 'Wireframe', checked: 'true' },
    'its row in ··· reads as checked',
  );
  assert.strictEqual((await ax('#rowMenu [data-i="0"]')).role, 'menuitem', 'a tool not in hand is a plain item');
  await page.keyboard.press('Escape');
  await frames();
  await page.keyboard.press('Escape');
  await frames();
  assert.notStrictEqual((await ax('#tbMore')).pressed, 'true', 'put down, ··· is no longer pressed');
  assert.deepStrictEqual(l.errors, [], 'no errors on the page');
  console.log('moreHeld: ok');
} finally {
  await l.close();
}
