// The library the tests of folder and project zips start from: Acme, with a folder that holds a folder, a folder of
// prototypes, a board with a canvas and a video, and a project of its own repo and vault; and Garden beside it.
import type { Page } from 'playwright';
import type { Folder, Project } from '../../src/shared/model.ts';
import { card } from './zipKit.ts';

export const COVER = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
export const VIDEO = '3c1d9a52-1111-4222-8333-444455556666.webm';

const board = (id: string, name: string, folder: string, more: Record<string, unknown> = {}) => ({
  id,
  name,
  folder,
  color: 'mint',
  cards: [card(`${id}n`, 'note', { text: `Note on ${name}`, color: 'butter' })],
  links: [],
  tray: [],
  view: { x: 120, y: 80, z: 1 },
  ...more,
});

export const BOARDS = [
  board('r1', 'Roadmap', 'f1', {
    cards: [
      card('rn', 'note', { text: 'First note', tags: ['q4'] }),
      card('rv', 'video', { src: `fenmyrmedia://media/${VIDEO}`, title: 'Clip', dur: 1, vw: 64, vh: 48 }),
      card('rc', 'canvas', { text: 'Detail', board: 'r2' }),
    ],
    tray: [card('rt', 'note', { text: 'In Unsorted' })],
  }),
  board('r2', 'Detail', 'f1', { parent: 'r1' }),
  board('r3', 'Sketch', 'f2'),
  board('r4', 'Notes', 'f3', { cards: [card('lk', 'link', { url: 'https://example.com', title: 'Example' })] }),
  board('r5', 'Prototype', 'f4', { kind: 'prototype', proto: { dir: 'prototypes/p', stack: 'html' } }),
  // what a zip leaves out unless it is ticked, or always: chats, a draft, vault access, and a vault note's link and text
  board('r6', 'Secrets', 'f3', {
    chat: [{ who: 'me', text: 'CHAT-SECRET', t: 1 }],
    chats: [{ id: 'old', title: 'Old chat', t: 1, msgs: [{ who: 'me', text: 'OLD-CHAT-SECRET', t: 1 }] }],
    chatDraft: { text: 'DRAFT-SECRET' },
    vaultAccess: [{ vault: 'v1', folders: [''], ai: true, write: false, writeTo: 'Myra' }],
    cards: [
      card('vn', 'vnote', { vault: 'v1', path: 'a.md', title: 'Note', excerpt: 'NOTE-SECRET', props: [['k', 'v']] }),
    ],
  }),
  board('g1', 'Seedlings', 'f5'),
];

export const PROJECTS: Project[] = [
  {
    id: 'p1',
    name: 'Acme',
    color: 'mint',
    cover: COVER,
    open: true,
    repo: { path: '/home/me/acme' },
    vaults: [{ vault: 'v1', folders: [], ai: false, write: false, writeTo: 'Myra' }],
  },
  { id: 'p2', name: 'Garden', color: 'sky', open: true },
];
export const FOLDERS: Folder[] = [
  { id: 'f1', name: 'Plans', project: 'p1', open: true },
  { id: 'f2', name: 'Drafts', project: 'p1', parent: 'f1', open: true },
  { id: 'f3', name: 'Ideas', project: 'p1', open: true },
  { id: 'f4', name: 'Protos', project: 'p1', open: true, kind: 'prototyping' },
  { id: 'f5', name: 'Beds', project: 'p2', open: true },
];

export async function seedAcme(page: Page) {
  await page.evaluate(
    async ([projects, folders]) => {
      await window.Fenmyr.saveFolders({ projects, folders, order: {} });
      await window.__fenmyr.refreshBoards();
    },
    [PROJECTS, FOLDERS] as const,
  );
}

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (typeof v === 'object' && v !== null ? { ...v } : {});

// A board as it was before, ready to be compared with its copy: its id, folder and parent are the copy's own, the chats
// are left out unless ticked, its canvas
// cards point at the copies, and its video has the name the copy gave it.
export function asCopied(original: Rec, ids: Record<string, string>, video: string) {
  const { id, folder, parent, kind, proto, chat, chats, ...rest } = original;
  const text = JSON.stringify(rest).replaceAll(`fenmyrmedia://media/${VIDEO}`, `fenmyrmedia://media/${video}`);
  return JSON.parse(text, (k, v) => (k === 'board' && typeof v === 'string' ? (ids[v] ?? v) : v));
}
export function ofCopy(copy: Rec) {
  const { id, folder, parent, kind, proto, chat, chats, ...rest } = copy;
  return rest;
}

// the cards of a board, by id
export const cardOf = (b: Rec, id: string) =>
  (Array.isArray(b.cards) ? b.cards : []).map(rec).find(c => c.id === id) ?? {};
