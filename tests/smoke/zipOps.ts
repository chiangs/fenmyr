import fs from 'node:fs';
import path from 'node:path';
import { openZip } from '../../src/shared/fenmyrZip.ts';
import type { Smoke } from './kit.ts';

// The zip operations through the bridge: a board and its video saved as a Fenmyr zip where the save dialog says, and
// the same zip opened again through the open dialog, with the video copied in under a new name. The open dialog is
// asked, and may be turned away; a zip that isn't ours is refused in words.
export async function zipOps(t: Smoke) {
  const { page, app, data, out } = t;
  const made = await page.evaluate(async () => {
    const video = await Fenmyr.saveMedia(new Blob([new Uint8Array(70_000).fill(9)], { type: 'video/mp4' })),
      name = video.split('/').pop() ?? '',
      board = {
        id: 'zip1',
        name: 'Zip',
        cards: [{ id: 'v', type: 'video', x: 0, y: 0, w: 200, h: 150, src: video }],
        links: [],
        tray: [],
      },
      manifest = {
        fenmyr: 'export' as const,
        format: 1,
        app: 'smoke',
        commit: null,
        changes: false,
        platform: 'linux',
        exportedAt: new Date().toISOString(),
        root: { kind: 'board' as const, id: 'zip1' },
        projects: [],
        folders: [],
        boards: ['zip1'],
        media: [name],
        left: { videos: 0, chats: false, vaultText: 0, missingCanvases: 0 },
      };
    return { video, saved: await Fenmyr.zipExport({ name: 'Smoke zip', manifest, boards: [board] }) };
  });
  const file = path.join(out, 'Smoke zip.fenmyr.zip'),
    inside = fs.existsSync(file) ? openZip(new Uint8Array(fs.readFileSync(file)), true) : null;
  const openAnswers = (answer: string | null) =>
    app.evaluate(({ dialog }, answer) => {
      dialog.showOpenDialog = async () =>
        answer ? { canceled: false, filePaths: [answer] } : { canceled: true, filePaths: [] };
    }, answer);
  await openAnswers(file);
  const back = await page.evaluate(() => Fenmyr.zipImport());
  const copy = back?.boards[0]?.cards?.[0],
    copied = copy && 'src' in copy && typeof copy.src === 'string' ? copy.src : '';
  await openAnswers(null);
  const cancelled = await page.evaluate(() => Fenmyr.zipImport());
  const plain = path.join(out, 'plain.zip');
  fs.writeFileSync(plain, 'not a zip');
  await openAnswers(plain);
  const refused = await page.evaluate(() =>
    Fenmyr.zipImport().then(
      () => 'opened',
      (e: unknown) => (e instanceof Error ? e.message : String(e)),
    ),
  );
  t.checkAll('zipOps', {
    saved: made.saved === file,
    names:
      !!inside &&
      [...inside.names].sort().join() === `boards/zip1.json,fenmyr.json,media/${made.video.split('/').pop()}`,
    video: !!inside && Object.values(inside.media).every(v => v.length === 70_000 && v.every(b => b === 9)),
    opened: back?.boards.length === 1 && back.manifest.root.id === 'zip1',
    newName:
      copied.startsWith('fenmyrmedia://media/') &&
      copied !== made.video &&
      fs.readFileSync(path.join(data, 'fenmyr', 'media', copied.split('/').pop() ?? '')).length === 70_000,
    cancelled: cancelled === null,
    refused: refused === "This isn't a Fenmyr zip.",
  });
}
