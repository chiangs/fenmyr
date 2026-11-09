import type { Board, CardOf, VaultGrant } from '../../shared/model.ts';
import type { Vault } from '../../shared/ops.ts';
import { renderCard } from '../canvas/render.ts';
import { selectOnly } from '../canvas/wires.ts';
import { $, cardsEl } from '../core/dom.ts';
import { remember, save } from '../core/history.ts';
import { session } from '../core/state.ts';
import { card } from '../model/boards.ts';
import { say } from '../myra/say.ts';
import { centerWorld } from '../panels/zoomMenu.ts';
import { snapTo } from '../settings/licenses.ts';
import { addCard } from '../tools/penEdit.ts';
import { esc } from '../ui/dom.ts';
import { activeGrants, loadVaults, vaultById } from './vaults.ts';

type VaultNote = CardOf<'vnote'>;
const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---------- vault notes on a board: a card that shows a note's title, tags, properties and first lines, and opens it in Obsidian ----------
const obsLink = (v: Vault, rel: string) =>
  'obsidian://open?vault=' +
  encodeURIComponent(v.obsidian || v.name) +
  '&file=' +
  encodeURIComponent(String(rel).replace(/\.md$/i, ''));

export function openNote(vaultId: string, rel: string) {
  const v = vaultById(vaultId);
  if (!v) {
    say('That vault isn’t connected any more. You can connect it again in Settings → Vaults ✦', 4000);
    return;
  }
  Fenmyr.openURL(obsLink(v, rel));
}

export const openVNote = (c: VaultNote) => openNote(c.vault ?? '', c.path ?? '');

// each card remembers its own side; the back holds the stored excerpt, and the full text only while you ask for it (never saved)
export const vnFull = new Map<string, { body: string; truncated: boolean }>();

export function flipVNote(c: VaultNote) {
  remember();
  const body = cardsEl.querySelector(`[data-id="${c.id}"] .body`);
  const swap = () => {
    c.side = c.side === 'back' ? 'front' : 'back';
    renderCard(c);
    cardsEl
      .querySelector(`[data-id="${c.id}"] .body`)
      ?.animate([{ transform: 'rotateY(-90deg)' }, { transform: 'rotateY(0)' }], { duration: 140 });
    save();
    $('selbar').dataset.key = '';
  };
  if (body)
    body
      .animate([{ transform: 'rotateY(0)' }, { transform: 'rotateY(90deg)' }], { duration: 120 })
      .finished.then(swap, swap);
  else swap();
}

export async function toggleVNFull(c: VaultNote) {
  if (vnFull.has(c.id)) {
    vnFull.delete(c.id);
    renderCard(c);
    return;
  }
  const vault = c.vault ?? '',
    path = c.path ?? '',
    g = grantFor(session.board, vault, path);
  if (!g) {
    say('This board isn’t allowed to read that note.', 3500);
    return;
  }
  try {
    const n = await Fenmyr.vaultNote(vault, path, g.folders, true);
    vnFull.set(c.id, { body: n.body || '', truncated: !!n.truncated });
    renderCard(c);
  } catch (e) {
    const why = messageOf(e);
    say(/missing/.test(why) ? 'I can’t find that note any more.' : `Hmm: ${why}`, 3500);
  }
}

// a small, safe markdown for the back of the card: headings, lists, tasks, quotes, bold, italic, code; [[links]] show as their words
export function vnMd(src: unknown) {
  const inl = (t: string | undefined) =>
    esc(t)
      .replace(/!\[\[[^\]]*\]\]/g, '')
      .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>');
  let out = '',
    list: string | null = null;
  const close = () => {
      if (list) {
        out += `</${list}>`;
        list = null;
      }
    },
    open = (k: string) => {
      if (list !== k) {
        close();
        out += `<${k}>`;
        list = k;
      }
    };
  for (const raw of String(src || '')
    .replace(/\r/g, '')
    .split('\n')) {
    const l = raw.trimEnd();
    let m: RegExpMatchArray | null;
    if (!l.trim()) {
      close();
      continue;
    }
    if ((m = l.match(/^(#{1,6})\s+(.*)/))) {
      close();
      const html = inl(m[2]);
      out += `<h4>${html}</h4>`;
    } else if ((m = l.match(/^\s*[-*+]\s+\[( |x|X)\]\s*(.*)/))) {
      open('ul');
      const box = m[1] === ' ' ? '☐' : '☑',
        html = inl(m[2]);
      out += `<li class="vn-task">${box} ${html}</li>`;
    } else if ((m = l.match(/^\s*[-*+]\s+(.*)/))) {
      open('ul');
      const html = inl(m[1]);
      out += `<li>${html}</li>`;
    } else if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) {
      open('ol');
      const html = inl(m[1]);
      out += `<li>${html}</li>`;
    } else if ((m = l.match(/^>\s?(.*)/))) {
      close();
      const html = inl(m[1]);
      out += `<blockquote>${html}</blockquote>`;
    } else if (/^(---+|\*\*\*+)$/.test(l.trim())) {
      close();
      out += '<hr>';
    } else {
      close();
      const html = inl(l);
      out += `<p>${html}</p>`;
    }
  }
  close();
  return out;
}

const grantFor = (b: Board, vaultId: string, rel: string): VaultGrant | undefined =>
  activeGrants(b).find(
    g => g.vault === vaultId && g.folders.some(f => f === '' || rel === f || rel.startsWith(`${f}/`)),
  );

// each card re-reads its note when the board opens. If the board may no longer read it (or it became private), the card forgets what it had shown
export async function refreshVNotes(b = session.board) {
  const cs = b.cards.filter(c => c.type === 'vnote');
  if (!cs.length) return;
  await loadVaults();
  let changed = false;
  for (const c of cs) {
    const before = JSON.stringify([c.title, c.tags, c.props, c.excerpt, c.blocked, c.missing]),
      vault = c.vault ?? '',
      path = c.path ?? '',
      g = grantFor(b, vault, path);
    try {
      if (!g) throw new Error('blocked');
      const n = await Fenmyr.vaultNote(vault, path, g.folders);
      Object.assign(c, {
        title: n.title,
        tags: n.tags,
        props: n.props,
        excerpt: n.excerpt,
        blocked: false,
        missing: false,
      });
    } catch (e) {
      vnFull.delete(c.id);
      const miss = /missing/.test(messageOf(e));
      Object.assign(c, { blocked: !miss, missing: miss, tags: [], props: [], excerpt: '' });
    }
    if (before !== JSON.stringify([c.title, c.tags, c.props, c.excerpt, c.blocked, c.missing])) {
      changed = true;
      if (b === session.board) renderCard(c);
    }
  }
  if (changed && b === session.board) save();
}

export async function addVaultNote(g: VaultGrant, rel: string) {
  const n = await Fenmyr.vaultNote(g.vault, rel, g.folders),
    w = centerWorld(),
    c = card('vnote', {
      vault: g.vault,
      path: rel,
      title: n.title,
      tags: n.tags,
      props: n.props,
      excerpt: n.excerpt,
      color: 'lilac',
    });
  c.x = snapTo(w.x - c.w / 2);
  c.y = snapTo(w.y - c.h / 2);
  remember();
  addCard(c, true);
  selectOnly([c.id]);
  save();
}
