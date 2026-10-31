import type { Board } from '../support/launch.ts';

type Card = {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  color: string;
  [key: string]: unknown;
};
type FixtureBoard = Board & { cards: Card[] };
const at = (
  id: string,
  type: string,
  x: number,
  y: number,
  w: number,
  h: number,
  more: Record<string, unknown> = {},
): Card => ({ id, type, x, y, w, h, r: 0, color: 'white', ...more });

export function everyOfflineCard(): FixtureBoard {
  const cards: Card[] = [
    at('title', 'title', 0, -120, 320, 50, { text: 'Every card' }),
    at('note', 'note', 0, 0, 220, 140, {
      name: 'A note',
      text: 'Plain words on a note',
      color: 'butter',
      tags: ['idea', 'bog'],
    }),
    at('myranote', 'note', 260, 0, 260, 170, {
      name: 'Myra says',
      text: 'A note Myra wrote',
      myra: true,
      color: 'mint',
    }),
    at('todo', 'todo', 560, 0, 240, 180, {
      text: 'Checklist',
      items: [
        { t: 'done thing', done: true },
        { t: 'next thing', done: false },
      ],
    }),
    at('swatch', 'swatch', 840, 0, 120, 150, { hex: '#e88a24', label: 'Cloudberry' }),
    at('text', 'text', 0, 200, 220, 24, { text: 'Loose text' }),
    at('doc', 'doc', 260, 200, 240, 52, {
      text: 'A doc',
      doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Doc body' }] }] },
    }),
    at('canvas', 'canvas', 540, 200, 260, 180, { text: 'A canvas' }),
    at('shape', 'shape', 840, 200, 160, 160, { shape: 'circle', fill: 'blue', text: 'Shape' }),
    at('stamp', 'stamp', 0, 260, 56, 56, { emoji: '⭐' }),
    at('icon', 'icon', 80, 270, 28, 28, { name: 'star' }),
    at('font', 'font', 0, 420, 300, 210, { font: 'Figtree' }),
    at('image', 'image', 340, 420, 260, 220, { src: 'stamps/myra-happy.png' }),
    at('link', 'link', 640, 420, 260, 210, {}),
    at('audio', 'audio', 940, 420, 290, 150, {
      title: 'Voice memo',
      dur: 12,
      text: 'What the memo said',
      wave: Array.from({ length: 40 }, (_, i) => ((i * 7) % 10) / 10),
    }),
    at('vnote', 'vnote', 0, 700, 300, 270, {
      title: 'Vault note',
      excerpt: 'An excerpt from the vault',
      tags: ['vault'],
      props: [['status', 'draft']],
    }),
    at('path', 'path', 340, 700, 200, 120, {
      pts: [
        { x: 0, y: 0 },
        { x: 200, y: 40 },
        { x: 80, y: 120 },
      ],
      closed: true,
      fill: '#9cc7ea',
      stroke: '#2b2e4f',
      sw: 2,
      ow: 200,
      oh: 120,
    }),
    at('ink', 'ink', 580, 700, 200, 80, {
      pts: [
        [0, 40],
        [50, 0],
        [100, 60],
        [150, 10],
        [200, 40],
      ],
      pen: 'marker',
      size: 2,
      ink: 'ink',
      ow: 200,
      oh: 80,
    }),
    at('coll', 'coll', 820, 700, 288, 200, { text: 'A collection', kids: [] }),
    at('kanban', 'coll', 1140, 700, 420, 260, { text: 'A kanban', kanban: true, kids: [] }),
    at('frame', 'frame', 1300, -120, 393, 852, { name: 'Screen' }),
    at('section', 'section', 1760, -120, 400, 300, { text: 'Section' }),
    at('box', 'box', 1340, 0, 160, 100, { img: 'Hero picture' }),
  ];
  const tray = [
    at('t1', 'note', 0, 0, 220, 140, { text: 'an unsorted idea' }),
    at('t2', 'note', 0, 0, 220, 140, { text: 'another one' }),
  ];
  const links = [{ id: 'l1', a: 'note', b: 'myranote', arrow: true }];
  return {
    id: 'every',
    name: 'Every card',
    color: 'mint',
    cards,
    links,
    tray,
    view: { x: 160, y: 140, z: 1 },
    palette: [{ hex: '#e88a24', name: 'Cloudberry' }],
  };
}

function bmp(w: number, h: number, seed: number): string {
  const row = Math.ceil((w * 3) / 4) * 4,
    size = 54 + row * h,
    b = Buffer.alloc(size);
  b.write('BM', 0);
  b.writeUInt32LE(size, 2);
  b.writeUInt32LE(54, 10);
  b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18);
  b.writeInt32LE(h, 22);
  b.writeUInt16LE(1, 26);
  b.writeUInt16LE(24, 28);
  b.writeUInt32LE(row * h, 34);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = 54 + y * row + x * 3;
      b[o] = (x * seed) & 255;
      b[o + 1] = (y * 3) & 255;
      b[o + 2] = (x + y + seed) & 255;
    }
  return `data:image/bmp;base64,${b.toString('base64')}`;
}

const KINDS = ['note', 'note', 'note', 'todo', 'title', 'swatch', 'shape', 'text'] as const;

export function bigBoard(n = 500, pictures = 10): FixtureBoard {
  const cards: Card[] = [];
  for (let i = 0; i < n; i++) {
    const type = KINDS[i % KINDS.length] ?? 'note',
      x = (i % 25) * 260,
      y = Math.floor(i / 25) * 220,
      id = `c${i}`;
    const more: Record<string, unknown> =
      type === 'note'
        ? {
            name: `Note ${i}`,
            text: `Idea number ${i}, written out in a sentence or two so the note has some text.`,
            color: ['butter', 'mint', 'sky', 'white'][i % 4],
          }
        : type === 'todo'
          ? {
              text: `List ${i}`,
              items: [
                { t: 'one', done: true },
                { t: 'two', done: false },
                { t: 'three', done: false },
              ],
            }
          : type === 'title'
            ? { text: `Heading ${i}` }
            : type === 'swatch'
              ? { hex: '#4a4f7a' }
              : type === 'shape'
                ? { shape: 'rect', fill: 'blue', text: '' }
                : { text: `Loose text ${i}` };
    const size: [number, number] =
      type === 'title'
        ? [320, 50]
        : type === 'swatch'
          ? [120, 150]
          : type === 'shape'
            ? [160, 160]
            : type === 'text'
              ? [220, 24]
              : [220, 140];
    cards.push(at(id, type, x, y, size[0], size[1], more));
  }
  for (let i = 0; i < pictures; i++)
    cards.push(at(`p${i}`, 'image', i * 300, -400, 260, 220, { src: bmp(320, 320, i + 1) }));
  return {
    id: 'big',
    name: 'Big board',
    color: 'sky',
    cards,
    links: [],
    tray: [],
    view: { x: 160, y: 140, z: 0.4 },
    palette: [],
  };
}
