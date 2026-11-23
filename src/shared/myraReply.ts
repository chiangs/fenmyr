import { z } from 'zod/mini';
import { nameLine, type ProtoOffer, readOffer, type WebPage, webPage } from './chat.ts';

// Myra's reply is model output. A field of the wrong kind is dropped, so the rest of her answer still applies.
const opt = <T extends z.core.$ZodType>(schema: T) => z.catch(z.optional(schema), undefined);
const list = <T extends z.core.$ZodType>(schema: T) => opt(z.array(schema));

const words = z.string();
const num = opt(z.number());
const txt = opt(z.string());
const renamed = z.looseObject({ from: txt, to: txt });

const cardFields = {
  type: txt,
  x: num,
  y: num,
  name: txt,
  text: txt,
  color: txt,
  font: txt,
  body: txt,
  sample: txt,
  hex: txt,
  label: txt,
  tag: z.catch(z.optional(z.nullable(z.string())), undefined),
  tags: opt(z.array(z.string())),
  due: z.catch(z.optional(z.nullable(z.string())), undefined),
  in: z.catch(z.optional(z.nullable(z.string())), undefined),
  column: z.catch(z.optional(z.union([z.string(), z.number()])), undefined),
  items: opt(z.array(z.union([z.string(), z.looseObject({ t: z.string(), done: opt(z.boolean()) })]))),
};

const reply = z.looseObject({
  say: txt,
  confirm: txt,
  animate: txt,
  offerVault: opt(z.boolean()),
  openRepo: txt,
  gitSetup: opt(z.boolean()),
  build: opt(z.looseObject({ request: txt })),
  git: opt(z.looseObject({ action: txt, message: txt })),
  install: opt(z.looseObject({ packages: opt(z.array(z.string())) })),
  newPrototype: opt(z.looseObject({ name: txt, stack: txt, purpose: txt, device: txt, project: txt, folder: txt })),
  offerPrototype: opt(
    z.looseObject({
      name: txt,
      stack: txt,
      device: txt,
      purpose: txt,
      project: txt,
      folder: txt,
      from: opt(z.array(z.string())),
      build: txt,
    }),
  ),
  stopTimer: opt(z.boolean()),
  dropPlan: opt(z.boolean()),
  doPlan: opt(z.boolean()),
  timer: opt(z.looseObject({ minutes: num, seconds: num, purpose: txt })),
  useTemplate: opt(z.looseObject({ name: txt, mode: txt })),
  saveTemplate: opt(
    z.looseObject({ name: txt, ids: opt(z.array(z.string())), fromNew: opt(z.boolean()), description: txt, mode: txt }),
  ),
  editTemplate: opt(z.looseObject({ name: txt, newName: txt, description: txt, mode: txt })),
  projects: opt(z.looseObject({ create: list(opt(words)), rename: list(renamed) })),
  boards: opt(z.looseObject({ create: list(opt(words)) })),
  folders: opt(
    z.looseObject({
      // a bad entry drops alone, so one odd name doesn't cost her the others
      create: list(opt(z.union([words, z.looseObject({ name: z.string(), project: txt })]))),
      rename: list(renamed),
      file: list(z.looseObject({ folder: z.string(), project: txt })),
      move: list(z.looseObject({ board: z.string(), folder: txt, project: txt })),
    }),
  ),
  collections: list(
    z.looseObject({
      x: num,
      y: num,
      name: txt,
      text: txt,
      color: txt,
      cols: num,
      kanban: opt(z.boolean()),
      columns: opt(z.array(z.string())),
    }),
  ),
  add: list(z.looseObject(cardFields)),
  titles: list(z.looseObject({ x: num, y: num, text: txt })),
  place: list(z.looseObject({ id: z.string(), x: num, y: num })),
  move: list(z.looseObject({ id: z.string(), x: num, y: num, color: txt })),
  edit: list(
    z.looseObject({
      ...cardFields,
      id: z.string(),
      desc: txt,
      size: txt,
      bold: opt(z.boolean()),
      italic: opt(z.boolean()),
      under: opt(z.boolean()),
      strike: opt(z.boolean()),
    }),
  ),
  remove: list(words),
  connect: list(z.union([z.tuple([z.string(), z.string()]), z.looseObject({ a: z.string(), b: z.string() })])),
  screens: list(z.unknown()),
  images: list(z.looseObject({ url: z.string(), x: num, y: num, caption: txt })),
  vaultNotes: list(z.looseObject({ vault: txt, path: txt })),
  // a bad entry drops alone, so one odd page doesn't cost her the others
  pages: list(opt(z.looseObject({ url: z.string(), title: txt }))),
  next: list(z.unknown()),
});

export type MyraReply = z.infer<typeof reply>;

export function parseReply(json: unknown): MyraReply {
  const parsed = z.safeParse(reply, json);
  return parsed.success ? parsed.data : {};
}

/** Her offer of a prototype board, or null without a name or a build request. sel: the cards the question was sent
 *  with, which it is made from when she names none. */
export function offerOf(r: MyraReply, sel: readonly string[]): ProtoOffer | null {
  const o = r.offerPrototype;
  return o ? readOffer({ ...o, from: o.from ?? sel }) : null;
}

const MAX_PAGES = 6;

// The pages she says she read that can open in the browser, once each, named by their title or else their site.
export function webPagesOf(r: MyraReply): WebPage[] {
  const out: WebPage[] = [];
  for (const p of r.pages ?? []) {
    const page = p && webPage(p.url, p.title ?? '');
    if (!page || out.some(o => o.url === page.url)) continue;
    out.push(page);
    if (out.length === MAX_PAGES) break;
  }
  return out;
}

// At most this many boards or folders from one reply. A board opens as it is made and has no one-click undo, so a list
// longer than a year of months is more likely a slip than a wish.
export const MAX_MADE = 12;
const NAME_MAX = 60;

// What she asked to make: the names that can be made, and how many good ones came after the cap.
export type Wanted<T> = { items: T[]; over: number };
export type FolderWish = { name: string; project: string };

const oneLine = (v: unknown) => nameLine(v, NAME_MAX);

function distinct<T>(items: readonly T[], keyOf: (t: T) => string): Wanted<T> {
  const seen = new Set<string>(),
    kept: T[] = [];
  let over = 0;
  for (const item of items) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    if (kept.length < MAX_MADE) kept.push(item);
    else over++;
  }
  return { items: kept, over };
}

const namesOf = (list: readonly unknown[] = []) =>
  distinct(list.map(oneLine).filter(Boolean), name => name.toLowerCase());

export const boardsToMake = (r: MyraReply) => namesOf(r.boards?.create);
export const projectsToMake = (r: MyraReply) => namesOf(r.projects?.create);

// project: the name of the project it goes in, or none for the one she is in
export function foldersToMake(r: MyraReply): Wanted<FolderWish> {
  const wishes = (r.folders?.create ?? []).flatMap((o): FolderWish[] => {
    const name = oneLine(typeof o === 'string' ? o : o?.name);
    return name ? [{ name, project: oneLine(typeof o === 'string' ? '' : o?.project) }] : [];
  });
  return distinct(wishes, f => `${f.project}\n${f.name}`.toLowerCase());
}
