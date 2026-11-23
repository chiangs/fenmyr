import fs from 'node:fs';
import path from 'node:path';
import type { ElectronApplication, Page } from 'playwright';
import { still } from './settled.ts';
import { dialogsAnswer, rec } from './zipKit.ts';

// Driving the zip's export and import the way a person does: a right-click on a row, the dialog, Home's button.
export const quiet = (page: Page) =>
  page.evaluate(() => {
    const said = document.getElementById('mSay');
    if (said) said.textContent = '';
  });
export const said = (page: Page, text: string) =>
  page.waitForFunction(t => document.getElementById('mSay')?.textContent?.startsWith(t), text);

export const saidSaved = (page: Page, name: string) => said(page, `Saved “${name}” ✦`);

// The export dialog for the board in the left box with this name, with what it says and the ticks it shows.
export async function exportRow(page: Page, name: string) {
  await quiet(page);
  await page
    .locator('#boards .board-row', { hasText: new RegExp(`^${name}$`) })
    .first()
    .click({ button: 'right' });
  await page.locator('#rowMenu [data-m="zipOut"]').click();
  const dialog = page.locator('#zipExport');
  await dialog.waitFor();
  const text = await dialog.innerText(),
    checked: Record<string, boolean> = {};
  for (const id of ['zxVideos', 'zxChats', 'zxVault'])
    if (await dialog.locator(`#${id}`).count()) checked[id] = await dialog.locator(`#${id}`).isChecked();
  return {
    text,
    checked,
    tick: (id: string, on: boolean) => dialog.locator(`#${id}`).setChecked(on),
    what: () => dialog.locator('#zxWhat').innerText(),
    ok: () => dialog.locator('#zxOk').click(),
    cancel: () => dialog.locator('#zxNo').click(),
  };
}

// Home's button opens the zip the open dialog answers with, and says what it added.
export async function importFromHome(app: ElectronApplication, page: Page, zip: string, name: string) {
  await dialogsAnswer(app, null, zip);
  await quiet(page);
  await page.locator('#homeBtn').click();
  await page.locator('#home.on').waitFor();
  await still(page);
  await page.locator('#homeImport').click();
  await said(page, `I added “${name}”`);
}

export const readBoards = (data: string): Record<string, unknown>[] => {
  const dir = path.join(data, 'fenmyr', 'boards');
  return fs.readdirSync(dir).map(f => rec(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))));
};

// a real video to play: a few coloured frames from a canvas, recorded in the page
export async function webm(page: Page) {
  const data = await page.evaluate(
    () =>
      new Promise<string>((res, rej) => {
        const cv = document.createElement('canvas'),
          ctx = cv.getContext('2d');
        cv.width = 64;
        cv.height = 48;
        if (!ctx) return rej(new Error('no canvas'));
        // a frame only when asked for: a canvas that is sampled on a clock can be recorded with none in it
        const stream = cv.captureStream(0),
          track = stream.getVideoTracks()[0],
          chunks: Blob[] = [],
          rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
        rec.ondataavailable = e => chunks.push(e.data);
        rec.onstop = () => {
          const fr = new FileReader();
          fr.onload = () => res(String(fr.result).split(',')[1] ?? '');
          fr.readAsDataURL(new Blob(chunks, { type: 'video/webm' }));
        };
        rec.start();
        let n = 0;
        const draw = () => {
          ctx.fillStyle = `hsl(${n * 12} 80% 50%)`;
          ctx.fillRect(0, 0, 64, 48);
          if (track && 'requestFrame' in track && typeof track.requestFrame === 'function') track.requestFrame();
          if (++n < 40) requestAnimationFrame(draw);
          else rec.stop();
        };
        requestAnimationFrame(draw);
      }),
  );
  return Buffer.from(data, 'base64');
}
