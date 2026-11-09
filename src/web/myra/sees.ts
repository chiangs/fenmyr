import { type AskFile, textFile } from '../../shared/askFiles.ts';

// What goes with the person's next message to Myra, as chips, and what a message was sent with. No DOM, so Node tests it.

/** What the app offers for the next message, read by the strip. */
export type SeesInput = {
  sel: readonly string[];
  /** The label for a single selected card, such as "Note · “Buy milk”". */
  one: string | null;
  /** Vaults Myra may read on this board. */
  vaults: readonly { vault: string; name: string }[];
  web: boolean;
  /** What the person added to the next message. */
  added: readonly Added[];
};

/** A picture or text file (as a data: URL), a vault note, or a long paste, added to one message. */
export type Added =
  | { kind: 'file'; id: string; name: string; data: string }
  | { kind: 'note'; id: string; vault: string; rel: string; title: string }
  | { kind: 'paste'; id: string; text: string };

/** One chip in the strip. `on`: it goes with the next message. The board always goes, so it has no `on`. */
export type Chip =
  | { kind: 'board' }
  | { kind: 'selection'; key: string; label: string; on: boolean }
  | { kind: 'vault'; key: string; vault: string; name: string; on: boolean }
  | { kind: 'web'; key: string; on: boolean }
  | { kind: 'added'; item: Added };

/** What a message was sent with, captured when it was sent. */
export type Sees = { sel: readonly string[]; vaults: readonly string[]; web: boolean; added: readonly Added[] };

/** Keys of the chips the person turned away from their default for the next message. */
export type Flips = ReadonlySet<string>;
export const NO_FLIPS: Flips = new Set();

// The selection and the web go unless left out. A vault is read only when the person adds it, because searching every
// vault adds up to 12,000 characters to each question.
const ON_BY_DEFAULT: { [K in Exclude<Chip['kind'], 'board' | 'added'>]: boolean } = {
  selection: true,
  vault: false,
  web: true,
};

// The key holds the ids, so a different selection goes along again by itself.
const selKey = (ids: readonly string[]) => `sel:${[...ids].sort().join(',')}`;

export function chipsOf(i: SeesInput, flips: Flips): Chip[] {
  const on = (kind: keyof typeof ON_BY_DEFAULT, key: string) => ON_BY_DEFAULT[kind] !== flips.has(key);
  const chips: Chip[] = [{ kind: 'board' }];
  if (i.sel.length) {
    const key = selKey(i.sel);
    chips.push({ kind: 'selection', key, label: i.one ?? `${i.sel.length} cards`, on: on('selection', key) });
  }
  for (const v of i.vaults) {
    const key = `vault:${v.vault}`;
    chips.push({ kind: 'vault', key, vault: v.vault, name: v.name, on: on('vault', key) });
  }
  if (i.web) chips.push({ kind: 'web', key: 'web', on: on('web', 'web') });
  for (const item of i.added) chips.push({ kind: 'added', item });
  return chips;
}

/** What the next message goes with. It reads the same chips the strip shows, so the two can't disagree. */
export function capture(i: SeesInput, flips: Flips): Sees {
  const out: { sel: readonly string[]; vaults: string[]; web: boolean; added: Added[] } = {
    sel: [],
    vaults: [],
    web: false,
    added: [],
  };
  for (const c of chipsOf(i, flips))
    switch (c.kind) {
      case 'board':
        break;
      case 'selection':
        if (c.on) out.sel = i.sel;
        break;
      case 'vault':
        if (c.on) out.vaults.push(c.vault);
        break;
      case 'web':
        out.web = c.on;
        break;
      case 'added':
        out.added.push(c.item);
        break;
      default: {
        const never: never = c;
        throw new Error(`unknown chip ${String(never)}`);
      }
    }
  return out;
}

/** × on a chip that goes, or + on one that doesn't. */
export function toggle(flips: Flips, key: string): Flips {
  const next = new Set(flips);
  if (!next.delete(key)) next.add(key);
  return next;
}

/** Adds to the next message, leaving out a note that is already there. */
export function addTo(added: readonly Added[], items: readonly Added[]): Added[] {
  const same = (a: Added, b: Added) => a.kind === 'note' && b.kind === 'note' && a.vault === b.vault && a.rel === b.rel;
  const out = [...added];
  for (const it of items) if (!out.some(a => same(a, it))) out.push(it);
  return out;
}

/** The files a message goes with: each file as added, and each paste as `Pasted text.txt`, then `Pasted text 2.txt`. */
export function askFilesOf(added: readonly Added[]): AskFile[] {
  let pastes = 0;
  return added.flatMap(a => {
    switch (a.kind) {
      case 'file':
        return [{ name: a.name, data: a.data }];
      case 'paste':
        pastes++;
        return [textFile(pastes === 1 ? 'Pasted text.txt' : `Pasted text ${pastes}.txt`, a.text)];
      case 'note':
        return [];
      default: {
        const never: never = a;
        throw new Error(`unknown added ${String(never)}`);
      }
    }
  });
}
