// A prototype's controls: Fenmyr draws the common kinds from src/tweaks.json above the preview, moving one changes the
// running prototype without rebuilding it, a custom control inside the frame reports back, and only Keep these values
// writes them into the file.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch } from './support/launch.ts';

const work = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-controls-')));
const repo = path.join(work, 'acme');
fs.mkdirSync(repo);
execFileSync('git', ['-C', repo, 'init', '-q', '-b', 'main']);
const tweaks = {
  inputType: { kind: 'choice', label: 'Input type', options: ['Text', 'Email', 'Password'], value: 'Text' },
  radius: { kind: 'number', label: 'Border radius', min: 0, max: 40, step: 1, unit: 'px', value: 24 },
  label: { kind: 'text', label: 'Label', value: 'Label' },
  accent: { kind: 'colour', label: 'Accent', value: '#6d6af0' },
  required: { kind: 'toggle', label: 'Required', value: false },
  mood: { kind: 'custom', label: 'Mood', value: 'calm' },
};
const app = `import { inFenmyr, setTweak, useTweaks } from './tweaks';

export function App() {
  const tweaks = useTweaks();
  const type = String(tweaks.inputType).toLowerCase();
  const style = { borderRadius: \`\${tweaks.radius}px\`, border: '2px solid', borderColor: String(tweaks.accent) };
  const label = String(tweaks.label);
  const mood = inFenmyr() ? <button className="mood" onClick={() => setTweak('mood', 'happy')}>Mood</button> : null;
  return <main>{mood}<input className="field" type={type} placeholder={label} style={style} /></main>;
}
`;

const l = await launch();
const { page } = l;
const frame = page.frameLocator('#pr-preview iframe');
const field = (what: string) =>
  frame
    .locator('input.field')
    .evaluate((i, w) => (w === 'type' ? i.getAttribute('type') : getComputedStyle(i).borderTopLeftRadius), what);
const until = async (check: () => Promise<boolean>, what: string) => {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    if (await check().catch(() => false)) return;
    await page.waitForTimeout(200);
  }
  assert.fail(what);
};

try {
  const dir = await page.evaluate(async repo => {
    await window.Fenmyr.saveFolders({
      projects: [{ id: 'p1', name: 'Acme', open: true, repo: { path: repo } }],
      folders: [{ id: 'pf', name: 'Prototypes', project: 'p1', kind: 'prototyping', open: true }],
      order: {},
    });
    const proto = await window.Fenmyr.protoCreate({ root: repo, name: 'Field', stack: 'react' });
    await window.Fenmyr.save({
      id: 'fb',
      name: 'Field',
      folder: 'pf',
      kind: 'prototype',
      proto,
      cards: [],
      links: [],
      tray: [],
    });
    return proto.dir;
  }, repo);
  const file = path.join(repo, dir, 'src/tweaks.json');
  fs.writeFileSync(file, JSON.stringify(tweaks));
  fs.writeFileSync(path.join(repo, dir, 'src/App.tsx'), app);
  await page.evaluate(async () => {
    await window.__fenmyr.refreshBoards();
    await window.__fenmyr.openBoard('fb');
  });
  await until(async () => (await field('radius')) === '24px', 'the prototype runs with the saved values');
  assert.strictEqual(
    await page.locator('.pv-knobs .kb').count(),
    5,
    'the five common kinds are drawn above the preview',
  );
  await frame.locator('main').evaluate(() => Reflect.set(globalThis, '__same', true));

  await page.locator('.pv-knobs input[data-k="radius"]').evaluate(i => {
    if (!(i instanceof HTMLInputElement)) return;
    i.value = '8';
    i.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await until(async () => (await field('radius')) === '8px', 'the slider changes the preview');
  // a real drag, the way a person moves it, not one value set at once
  const track = await page.locator('.pv-knobs input[data-k="radius"]').boundingBox();
  if (!track) throw new Error('no slider');
  const y = track.y + track.height / 2;
  await page.mouse.move(track.x + 4, y);
  await page.mouse.down();
  for (const f of [0.2, 0.4, 0.6, 0.75]) await page.mouse.move(track.x + track.width * f, y, { steps: 3 });
  await page.mouse.up();
  await until(async () => Number.parseInt(await field('radius'), 10) >= 26, 'dragging the slider moves it all the way');
  await page.click('.kb-reset');
  await until(async () => (await field('radius')) === '24px', 'Reset puts the saved values back');
  assert.strictEqual(await page.locator('.kb-keep').count(), 0, 'and there is nothing to keep');
  await page.locator('.pv-knobs input[data-k="radius"]').evaluate(i => {
    if (!(i instanceof HTMLInputElement)) return;
    i.value = '8';
    i.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.click('.pv-knobs [data-k="inputType"][data-v="Email"]');
  await until(async () => (await field('type')) === 'email', 'so does a choice');
  assert.ok(
    await frame.locator('main').evaluate(() => Reflect.get(globalThis, '__same') === true),
    'without rebuilding it',
  );
  assert.strictEqual(JSON.parse(fs.readFileSync(file, 'utf8')).radius.value, 24, 'nothing is saved yet');

  await frame.locator('button.mood').click();
  await until(
    async () => (await page.locator('.kb-keep').count()) === 1,
    'a custom control inside the frame reports back',
  );
  await page.click('.kb-keep');
  await until(
    async () => JSON.parse(fs.readFileSync(file, 'utf8')).radius.value === 8,
    'Keep these values writes them',
  );
  const kept = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepStrictEqual(
    [kept.inputType.value, kept.mood.value, kept.radius.unit],
    ['Email', 'happy', 'px'],
    'every value, and the rest of each control',
  );
  assert.strictEqual(await page.locator('.kb-keep').count(), 0, 'and the button goes once they’re kept');
  assert.deepStrictEqual(l.errors, []);
  console.log('CONTROLS OK');
} finally {
  await l.close();
  fs.rmSync(work, { recursive: true, force: true });
}
