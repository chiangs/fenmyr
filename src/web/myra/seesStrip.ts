import { kindOf, MAX_FILES } from '../../shared/askFiles.ts';
import { labelOf } from '../../shared/cardTypes.ts';
import { DRAFT_MAX } from '../../shared/chat.ts';
import { $ } from '../core/dom.ts';
import { session } from '../core/state.ts';
import { settings } from '../settings/settings.ts';
import { closestTo, esc } from '../ui/dom.ts';
import { aiGrants } from '../vault/ask.ts';
import { vaultById } from '../vault/vaults.ts';
import { chatLog, renderChat } from './chatLog.ts';
import { pastedLabel } from './chatRules.ts';
import { renderHint } from './chatWindow.ts';
import {
  type Added,
  addTo,
  type Chip,
  capture,
  chipsOf,
  type Flips,
  NO_FLIPS,
  type Sees,
  type SeesInput,
  toggle,
} from './sees.ts';

// The "Myra sees" strip under the chat's header: what goes with the next message, and × or + to change it for that
// message only.

// what the person changed and added for the next message, kept for each board until it is sent
type Next = { flips: Flips; added: readonly Added[] };
const FRESH: Next = { flips: NO_FLIPS, added: [] };
const nexts = new Map<string, Next>();
const nextNow = (): Next => nexts.get(session.board?.id ?? '') ?? FRESH;

// Long pastes are part of the unsent draft, which the draft store saves. It hears of every change to them here.
const watchers: (() => void)[] = [];
export const watchAdded = (fn: () => void) => void watchers.push(fn);
const tell = () => {
  for (const fn of watchers) fn();
};
const pastes = (added: readonly Added[]) => added.flatMap(a => (a.kind === 'paste' ? [a] : []));

function oneLabel(): string | null {
  const one = session.sel.size === 1 ? session.board.cards.find(c => session.sel.has(c.id)) : undefined;
  if (!one) return null;
  const words = String(one.name || one.text || one.title || one.label || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 34);
  return words ? `${labelOf(one.type)} · “${words}”` : labelOf(one.type);
}

function seesInput(): SeesInput {
  const b = session.board;
  if (!b) return { sel: [], one: null, vaults: [], web: false, added: [] };
  return {
    sel: b.cards.filter(c => session.sel.has(c.id)).map(c => c.id),
    one: oneLabel(),
    vaults: Fenmyr.native ? aiGrants(b).map(g => ({ vault: g.vault, name: vaultById(g.vault)?.name ?? 'Vault' })) : [],
    web: !!settings.webAccess,
    added: nextNow().added,
  };
}

type View = {
  kind: string;
  key: string;
  label: string;
  icon: string;
  tip: string;
  on: boolean;
  open: string;
  read?: string;
};

function viewOf(c: Exclude<Chip, { kind: 'board' }>, order: readonly string[]): View {
  switch (c.kind) {
    case 'selection':
      return {
        kind: 'sel',
        key: c.key,
        label: c.label,
        icon: '',
        tip: c.on ? `Leave ${c.label} out of the next message` : `Put ${c.label} back`,
        on: c.on,
        open: '',
      };
    case 'vault':
      return {
        kind: 'vault',
        key: c.key,
        label: c.name,
        icon: Icon('notebook', { size: 13 }),
        tip: c.on
          ? `Leave ${c.name} out of the next message`
          : `Let ${myraName()} search ${c.name} for the next message`,
        on: c.on,
        open: '',
      };
    case 'web':
      return {
        kind: 'web',
        key: c.key,
        label: 'Web',
        icon: Icon('globe', { size: 13 }),
        tip: c.on ? 'Leave the web out of the next message' : 'Put the web back',
        on: c.on,
        open: '',
      };
    case 'added': {
      const it = c.item,
        label = it.kind === 'note' ? it.title : it.kind === 'paste' ? pastedLabel(it.text) : it.name,
        // two pastes can share a label, so a screen reader hears which one Open and × act on
        what = it.kind === 'paste' ? `pasted text ${order.indexOf(it.id) + 1} (${label})` : label,
        icon =
          it.kind === 'note' ? 'notebook' : it.kind === 'file' && kindOf(it.name) === 'picture' ? 'image' : 'file-text';
      return {
        kind: 'added',
        key: `added:${it.id}`,
        label,
        icon: Icon(icon, { size: 13 }),
        tip: `Take ${what} out of the next message`,
        on: true,
        open: it.kind === 'paste' ? it.id : '',
        read: `Read ${what}`,
      };
    }
    default: {
      const never: never = c;
      throw new Error(`unknown chip ${String(never)}`);
    }
  }
}

const myraName = () => window.myraName || 'Myra';

function chipHTML(c: Chip, order: readonly string[]): string {
  if (c.kind === 'board')
    return '<span class="mcs-chip board" data-chip="board" title="The board always goes with your message">Board</span>';
  const v = viewOf(c, order),
    kind = v.kind,
    key = esc(v.key),
    label = esc(v.label),
    tip = esc(v.tip),
    icon = v.icon,
    openId = esc(v.open),
    read = esc(v.read ?? ''),
    cls = v.open ? `${kind} paste` : kind,
    open = v.open
      ? `<button type="button" class="mcs-open" data-open="${openId}" title="${read}" aria-label="${read}">Open</button>`
      : '';
  return v.on
    ? `<span class="mcs-chip ${cls}" data-chip="${kind}">${icon}<span class="mcs-t">${label}</span>${open}<button type="button" class="mcs-x" data-flip="${key}" title="${tip}" aria-label="${tip}">×</button></span>`
    : `<button type="button" class="mcs-chip ${kind} out" data-chip="${kind}" data-flip="${key}" title="${tip}" aria-label="${tip}">${icon}<span class="mcs-t">${label}</span><span class="mcs-x" aria-hidden="true">+</span></button>`;
}

const ADD_TIP = 'Add pictures, files or a vault note to the next message',
  ADD = `<button type="button" class="mcs-add" title="${ADD_TIP}" aria-label="${ADD_TIP}" aria-haspopup="menu">+ Add</button>`;

let drawn = '';

/** Draws the strip from the board, the selection, the vaults and the web as they are now. */
export function renderSees() {
  const el = $('mcSees');
  if (!el) return;
  const lead = esc(`${myraName()} sees`),
    order = pastesOf(session.board?.id ?? '').map(p => p.id),
    chips = chipsOf(seesInput(), nextNow().flips)
      .map(c => chipHTML(c, order))
      .join(''),
    add = Fenmyr.native ? ADD : '',
    html = `<span class="mcs-lead" data-mname="{name} sees">${lead}</span>${chips}${add}`;
  if (html === drawn) return;
  drawn = html;
  el.innerHTML = html;
  renderHint();
  // the empty chat's starters fit what goes with the next message
  if (!chatLog().length) renderChat();
}

/** How many selected cards go with the next message. */
export const seenSelection = () => capture(seesInput(), nextNow().flips).sel.length;

/** What the next message goes with, without using up the person's choices. */
export const peekSees = (): Sees => capture(seesInput(), nextNow().flips);

/** Adds pictures, files or notes to the next message on this board. */
export function addToNext(items: readonly Added[]) {
  if (!session.board) return;
  const now = nextNow();
  nexts.set(session.board.id, { ...now, added: addTo(now.added, items) });
  renderSees();
  tell();
}

/** How many files and pasted texts the next message holds already. */
export const filesInNext = () => nextNow().added.filter(a => a.kind !== 'note').length;

/** The long pastes a board's next message holds, in the order they were pasted. */
export const pastesOf = (board: string) => pastes(nexts.get(board)?.added ?? []);

/** How many characters a board's pasted texts hold, which count against the draft's budget. */
export const pastedChars = (board: string) => pastesOf(board).reduce((n, p) => n + p.text.length, 0);

/** Brings a board's saved pastes back as chips, unless the board's next message is already in hand. */
export function seedAdded(board: string, items: readonly Added[]) {
  if (items.length && !nexts.has(board)) nexts.set(board, { flips: NO_FLIPS, added: items });
  renderSees();
}

/** Drops the next-message choices of boards that are known to be gone. */
export function forgetNexts(gone: Iterable<string>) {
  for (const board of gone) nexts.delete(board);
}

/** The boards that hold choices or additions for their next message. */
export const nextBoards = () => [...nexts.keys()];

/** Clear all chats: no board's next message keeps a paste. */
export function clearPastes() {
  for (const [board, now] of nexts) nexts.set(board, { ...now, added: now.added.filter(a => a.kind !== 'paste') });
  renderSees();
  tell();
}

/** Gives a message that never reached Myra its pictures, files and pastes back on the board it was written on, ahead of
 *  anything added since. A message holds at most MAX_FILES files and pastes, and the pastes with `words` (the characters
 *  the draft will hold) fit the draft's budget, so what was added since gives way. Returns how many it left out. */
export function putBack(board: string, items: readonly Added[], words: number): number {
  if (!items.length) return 0;
  const now = nexts.get(board) ?? FRESH,
    late = now.added.filter(a => !items.some(i => i.id === a.id));
  let files = 0,
    chars = words,
    left = 0;
  const fits = (a: Added) => {
    if (a.kind === 'note') return true;
    const room = files < MAX_FILES && (a.kind !== 'paste' || chars + a.text.length <= DRAFT_MAX);
    if (room) {
      files++;
      if (a.kind === 'paste') chars += a.text.length;
    } else left++;
    return room;
  };
  nexts.set(board, { ...now, added: addTo(items.filter(fits), late.filter(fits)) });
  renderSees();
  tell();
  return left;
}

/** Takes one picture, file, note or pasted text out of the next message. */
export function removeAdded(id: string) {
  if (!session.board) return;
  const now = nextNow();
  nexts.set(session.board.id, { ...now, added: now.added.filter(a => a.id !== id) });
  renderSees();
  tell();
}

/** Captures what the message being sent goes with, and starts the next message from the defaults again. */
export function takeSees(): Sees {
  const sees = peekSees();
  nexts.delete(session.board?.id ?? '');
  renderSees();
  if (sees.added.some(a => a.kind === 'paste')) tell();
  return sees;
}

export function initSees() {
  $('mcSees').addEventListener('click', e => {
    const key = closestTo(e.target, '[data-flip]')?.dataset.flip;
    if (!key || !session.board) return;
    if (key.startsWith('added:')) removeAdded(key.slice(6));
    else {
      const now = nextNow();
      nexts.set(session.board.id, { ...now, flips: toggle(now.flips, key) });
      renderSees();
    }
    const same = `[data-flip="${CSS.escape(key)}"]`;
    ($('mcSees').querySelector<HTMLElement>(same) ?? $('mcSees').querySelector<HTMLElement>('.mcs-add'))?.focus();
  });
}
