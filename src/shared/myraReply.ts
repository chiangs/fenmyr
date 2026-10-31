import { z } from 'zod/mini';

// Myra's reply is model output. A field of the wrong kind is dropped, so the rest of her answer still applies.
const list = z.catch(z.optional(z.array(z.unknown())), undefined);
const reply = z.looseObject({
  say: z.catch(z.optional(z.string()), undefined),
  add: list,
  move: list,
  edit: list,
  remove: list,
  titles: list,
  place: list,
  connect: list,
  collections: list,
  screens: list,
  images: list,
  vaultNotes: list,
  next: list,
});

export function parseReply(json: unknown) {
  const parsed = z.safeParse(reply, json);
  return parsed.success ? parsed.data : {};
}
