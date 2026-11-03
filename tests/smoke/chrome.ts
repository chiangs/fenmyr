import fs from 'node:fs';
import path from 'node:path';
import type { Smoke } from './kit.ts';

// shortcut labels are written with the Mac symbols and read Ctrl+ here (so a Mac shows ⌘); Ctrl+, opens Settings even while typing
export async function shortcutLabels(t: Smoke) {
  const { page } = t;
  const keys = await page.evaluate(() =>
      window.__t
        .all('#keys kbd, #cleanBack kbd')
        .map(k => k.textContent)
        .join(' | '),
    ),
    src = fs.readFileSync(path.join(import.meta.dirname, '../../web/index.html'), 'utf8');
  await page.click('#capInput', { force: true }).catch(() => {});
  await page.evaluate(() => {
    const i = document.createElement('input');
    i.id = 'tmpTyping';
    document.body.appendChild(i);
    i.focus();
  });
  await page.keyboard.press('Control+,');
  await page.waitForTimeout(400);
  const opened = await page.evaluate(() => window.__t.el('#settings').classList.contains('on'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.evaluate(() => document.getElementById('tmpTyping')?.remove());
  t.checkAll('keysMac', {
    read: /Ctrl\+K/.test(keys) && /Ctrl\+F/.test(keys) && /Ctrl\+\\/.test(keys),
    sourceMac: !/<kbd>Ctrl/.test(src) && /<kbd>⌘K<\/kbd>/.test(src),
    settingsKey: opened,
  });
}
