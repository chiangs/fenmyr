// An image card's own actions in its right-click menu: save the picture, copy it for other apps, or swap in another one.
import type { CardOf } from '../../shared/model.ts';
import { renderCard } from '../canvas/render.ts';
import { selectOnly } from '../canvas/wires.ts';
import { remember, save } from '../core/history.ts';
import type { MenuItem } from '../features/export.ts';
import { chirp, say } from '../myra/say.ts';
import { imageFromFile } from './spotify.ts';

type ImageCard = CardOf<'image'>;

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

const pictureOf = async (c: ImageCard) => {
  if (!c.src) throw new Error('This image card has no picture yet.');
  return (await fetch(c.src)).blob();
};

const base64Of = (b: Blob) =>
  new Promise<string>(res => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).replace(/^data:[^,]*,/, ''));
    fr.readAsDataURL(b);
  });

// other apps take a PNG from the clipboard, whatever the picture was saved as
async function asPng(b: Blob) {
  if (b.type === 'image/png') return b;
  const bmp = await createImageBitmap(b),
    cv = document.createElement('canvas');
  cv.width = bmp.width;
  cv.height = bmp.height;
  cv.getContext('2d')?.drawImage(bmp, 0, 0);
  return new Promise<Blob>((res, rej) =>
    cv.toBlob(p => (p ? res(p) : rej(new Error('No picture to copy.'))), 'image/png'),
  );
}

async function download(c: ImageCard, name: string) {
  const b = await pictureOf(c),
    ext = EXT[b.type] ?? 'png',
    saved = await Fenmyr.saveFile(await base64Of(b), name, ext);
  if (saved) chirp(`Saved “${saved}” ✦`, 3500);
}

async function copy(c: ImageCard) {
  const png = await asPng(await pictureOf(c));
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
  chirp('Copied the picture', 2500);
}

// the card keeps its place and width; its height follows the new picture, and an old crop or capture no longer applies
async function replace(c: ImageCard, f: File) {
  const im = await imageFromFile(f);
  remember();
  c.src = im.src;
  c.h = Math.round((c.w * im.h) / im.w) + 16;
  delete c.crop;
  delete c.cropEdit;
  delete c.capture;
  renderCard(c);
  selectOnly([c.id]);
  save();
}

function fromFile(c: ImageCard) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = () => {
    const f = input.files?.[0];
    if (f) replace(c, f).catch(e => say(e instanceof Error ? e.message : String(e), 4000));
  };
  input.click();
}

async function fromClipboard(c: ImageCard) {
  for (const item of await navigator.clipboard.read()) {
    const type = item.types.find(t => t.startsWith('image/'));
    if (type) return replace(c, new File([await item.getType(type)], 'clipboard', { type }));
  }
  say('There’s no picture on the clipboard.', 4000);
}

const tryTo = (act: () => Promise<unknown>) => () =>
  act().catch(e => say(e instanceof Error ? e.message : String(e), 4000));

export const imageMenu = (c: ImageCard, name: string): MenuItem[] => [
  { label: 'Download image…', run: tryTo(() => download(c, name)) },
  { label: 'Copy image', run: tryTo(() => copy(c)) },
  { label: 'Replace with a file…', run: () => fromFile(c) },
  { label: 'Replace with the copied picture', run: tryTo(() => fromClipboard(c)) },
  '-',
];
