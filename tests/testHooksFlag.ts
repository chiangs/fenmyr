// window.__fenmyr, the hooks the tests drive the app with, is there only when the test launcher passes --fenmyr-test.
// A normal launch has none, and starts with no errors.
//   node tests/testHooksFlag.ts

import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright';
import { HEADLESS, launch, ROOT } from './support/launch.ts';

const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-hooks-'));
const plain = await electron.launch({
  args: [ROOT, '--no-sandbox', ...HEADLESS],
  env: { ...process.env, XDG_DATA_HOME: data, HOME: data },
});
try {
  const page = await plain.firstWindow(),
    errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.getByText('Skip setup').click();
  await page.locator('#cards').waitFor({ state: 'attached' });
  assert.equal(
    await page.evaluate(() => '__fenmyr' in window),
    false,
    'a launch without --fenmyr-test has no test hooks',
  );
  assert.deepEqual(errors, [], 'the app starts without errors');
} finally {
  await plain.close();
  fs.rmSync(data, { recursive: true, force: true });
}

const l = await launch();
try {
  assert.equal(
    await l.page.evaluate(() => typeof window.__fenmyr.curBoard),
    'function',
    'the test launcher gets the hooks',
  );
  assert.deepEqual(l.errors, []);
} finally {
  await l.close();
}
console.log('test hooks: only with --fenmyr-test');
