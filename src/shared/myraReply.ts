import { z } from 'zod/mini';
import { isWebAddress, type WebPage } from './chat.ts';

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
  stopTimer: opt(z.boolean()),
  timer: opt(z.looseObject({ minutes: num, seconds: num, purpose: txt })),
  useTemplate: opt(z.looseObject({ name: txt, mode: txt })),
  saveTemplate: opt(
    z.looseObject({ name: txt, ids: opt(z.array(z.string())), fromNew: opt(z.boolean()), description: txt, mode: txt }),
  ),
  editTemplate: opt(z.looseObject({ name: txt, newName: txt, description: txt, mode: txt })),
  projects: opt(z.looseObject({ create: list(words), rename: list(renamed) })),
  folders: opt(
    z.looseObject({
      create: list(z.union([words, z.looseObject({ name: z.string(), project: txt })])),
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

const MAX_PAGES = 6;

// The pages she says she read that can open in the browser, once each, named by their title or else their site.
export function webPagesOf(r: MyraReply): WebPage[] {
  const out: WebPage[] = [];
  for (const p of r.pages ?? []) {
    if (!p || !isWebAddress(p.url) || out.some(o => o.url === p.url)) continue;
    out.push({ url: p.url, title: p.title?.trim() || new URL(p.url).hostname });
    if (out.length === MAX_PAGES) break;
  }
  return out;
}
