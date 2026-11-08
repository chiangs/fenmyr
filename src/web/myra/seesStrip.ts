import { labelOf } from '../../shared/cardTypes.ts';
import { $ } from '../core/dom.ts';
import { session } from '../core/state.ts';
import { settings } from '../settings/settings.ts';
import { closestTo, esc } from '../ui/dom.ts';
import { aiGrants } from '../vault/ask.ts';
import { vaultById } from '../vault/vaults.ts';
import { renderHint } from './chatWindow.ts';
import { type Chip, capture, chipsOf, type Flips, NO_FLIPS, type Sees, type SeesInput, toggle } from './sees.ts';

// The "Myra sees" strip under the chat's header: what goes with the next message, and × or + to change it for that
// message only.

// what the person changed for the next message, on one board
let turned: { board: string; flips: Flips } = { board: '', flips: NO_FLIPS };
const flipsNow = () => (turned.board === session.board?.id ? turned.flips : NO_FLIPS);

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
  if (!b) return { sel: [], one: null, vaults: [], web: false };
  return {
    sel: b.cards.filter(c => session.sel.has(c.id)).map(c => c.id),
    one: oneLabel(),
    vaults: Fenmyr.native ? aiGrants(b).map(g => ({ vault: g.vault, name: vaultById(g.vault)?.name ?? 'Vault' })) : [],
    web: !!settings.webAccess,
  };
}

type View = { kind: string; key: string; label: string; icon: string; tip: string; on: boolean };

function viewOf(c: Exclude<Chip, { kind: 'board' }>): View {
  switch (c.kind) {
    case 'selection':
      return {
        kind: 'sel',
        key: c.key,
        label: c.label,
        icon: '',
        tip: c.on ? `Leave ${c.label} out of the next message` : `Put ${c.label} back`,
        on: c.on,
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
      };
    case 'web':
      return {
        kind: 'web',
        key: c.key,
        label: 'Web',
        icon: Icon('globe', { size: 13 }),
        tip: c.on ? 'Leave the web out of the next message' : 'Put the web back',
        on: c.on,
      };
    default: {
      const never: never = c;
      throw new Error(`unknown chip ${String(never)}`);
    }
  }
}

const myraName = () => window.myraName || 'Myra';

function chipHTML(c: Chip): string {
  if (c.kind === 'board')
    return '<span class="mcs-chip board" data-chip="board" title="The board always goes with your message">Board</span>';
  const v = viewOf(c),
    kind = v.kind,
    key = esc(v.key),
    label = esc(v.label),
    tip = esc(v.tip),
    icon = v.icon;
  return v.on
    ? `<span class="mcs-chip ${kind}" data-chip="${kind}">${icon}<span class="mcs-t">${label}</span><button type="button" class="mcs-x" data-flip="${key}" title="${tip}" aria-label="${tip}">×</button></span>`
    : `<button type="button" class="mcs-chip ${kind} out" data-chip="${kind}" data-flip="${key}" title="${tip}" aria-label="${tip}">${icon}<span class="mcs-t">${label}</span><span class="mcs-x" aria-hidden="true">+</span></button>`;
}

let drawn = '';

/** Draws the strip from the board, the selection, the vaults and the web as they are now. */
export function renderSees() {
  const el = $('mcSees');
  if (!el) return;
  const lead = esc(`${myraName()} sees`),
    chips = chipsOf(seesInput(), flipsNow()).map(chipHTML).join(''),
    html = `<span class="mcs-lead" data-mname="{name} sees">${lead}</span>${chips}`;
  if (html === drawn) return;
  drawn = html;
  el.innerHTML = html;
  renderHint();
}

/** How many selected cards go with the next message. */
export const seenSelection = () => capture(seesInput(), flipsNow()).sel.length;

/** What the next message goes with, without using up the person's choices. */
export const peekSees = (): Sees => capture(seesInput(), flipsNow());

/** Captures what the message being sent goes with, and starts the next message from the defaults again. */
export function takeSees(): Sees {
  const sees = peekSees();
  turned = { board: '', flips: NO_FLIPS };
  renderSees();
  return sees;
}

export function initSees() {
  $('mcSees').addEventListener('click', e => {
    const key = closestTo(e.target, '[data-flip]')?.dataset.flip;
    if (!key || !session.board) return;
    turned = { board: session.board.id, flips: toggle(flipsNow(), key) };
    renderSees();
    const same = `[data-flip="${CSS.escape(key)}"]`;
    $('mcSees').querySelector<HTMLElement>(same)?.focus();
  });
}
