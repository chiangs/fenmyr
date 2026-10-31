// @ts-nocheck
import { esc } from '../ui/dom.ts';
import { renderCard } from '../canvas/render.ts';
import { selectOnly } from '../canvas/wires.ts';
import { $, cardsEl } from '../core/dom.ts';
import { remember, save } from '../core/history.ts';
import { card } from '../model/boards.ts';
import { centerWorld } from '../panels/zoomMenu.ts';
import { say, snapTo } from '../settings/licenses.ts';
import { addCard } from '../tools/penEdit.ts';
import { activeGrants, loadVaults, vaultById } from './vaults.ts';
import { session } from '../core/state.ts';

// ---------- vault notes on a board: a card that shows a note's title, tags, properties and first lines, and opens it in Obsidian ----------
const obsLink = (v, rel) =>
  'obsidian://open?vault=' +
  encodeURIComponent(v.obsidian || v.name) +
  '&file=' +
  encodeURIComponent(String(rel).replace(/\.md$/i, ''));

export function openVNote(c) {
  const v = vaultById(c.vault);
  if (!v) return say('That vault isn’t connected any more. You can connect it again in Settings → Vaults ✦', 4000);
  Fenmyr.openURL(obsLink(v, c.path));
}

// each card remembers its own side; the back holds the stored excerpt, and the full text only while you ask for it (never saved)
export const vnFull = new Map();

export function flipVNote(c) {
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

export async function toggleVNFull(c) {
  if (vnFull.has(c.id)) {
    vnFull.delete(c.id);
    return renderCard(c);
  }
  const g = grantFor(session.board, c.vault, c.path);
  if (!g) return say('This board isn’t allowed to read that note.', 3500);
  try {
    const n = await Fenmyr.vaultNote(c.vault, c.path, g.folders, true);
    vnFull.set(c.id, { body: n.body || '', truncated: !!n.truncated });
    renderCard(c);
  } catch (e) {
    say(/missing/.test(e.message) ? 'I can’t find that note any more.' : 'Hmm: ' + e.message, 3500);
  }
}

// a small, safe markdown for the back of the card: headings, lists, tasks, quotes, bold, italic, code; [[links]] show as their words
export function vnMd(src) {
  const inl = t =>
    esc(t)
      .replace(/!\[\[[^\]]*\]\]/g, '')
      .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>');
  let out = '',
    list = null;
  const close = () => {
      if (list) {
        out += `</${list}>`;
        list = null;
      }
    },
    open = k => {
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
    let m;
    if (!l.trim()) {
      close();
      continue;
    }
    if ((m = l.match(/^(#{1,6})\s+(.*)/))) {
      close();
      out += `<h4>${inl(m[2])}</h4>`;
    } else if ((m = l.match(/^\s*[-*+]\s+\[( |x|X)\]\s*(.*)/))) {
      open('ul');
      out += `<li class="vn-task">${m[1] === ' ' ? '☐' : '☑'} ${inl(m[2])}</li>`;
    } else if ((m = l.match(/^\s*[-*+]\s+(.*)/))) {
      open('ul');
      out += `<li>${inl(m[1])}</li>`;
    } else if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) {
      open('ol');
      out += `<li>${inl(m[1])}</li>`;
    } else if ((m = l.match(/^>\s?(.*)/))) {
      close();
      out += `<blockquote>${inl(m[1])}</blockquote>`;
    } else if (/^(---+|\*\*\*+)$/.test(l.trim())) {
      close();
      out += '<hr>';
    } else {
      close();
      out += `<p>${inl(l)}</p>`;
    }
  }
  close();
  return out;
}

const grantFor = (b, vaultId, rel) =>
  activeGrants(b).find(
    g => g.vault === vaultId && g.folders.some(f => f === '' || rel === f || rel.startsWith(f + '/')),
  );

// each card re-reads its note when the board opens. If the board may no longer read it (or it became private), the card forgets what it had shown
export async function refreshVNotes(b = session.board) {
  const cs = b.cards.filter(c => c.type === 'vnote');
  if (!cs.length) return;
  await loadVaults();
  let changed = false;
  for (const c of cs) {
    const before = JSON.stringify([c.title, c.tags, c.props, c.excerpt, c.blocked, c.missing]),
      g = grantFor(b, c.vault, c.path);
    try {
      if (!g) throw new Error('blocked');
      const n = await Fenmyr.vaultNote(c.vault, c.path, g.folders);
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
      const miss = /missing/.test(e.message);
      Object.assign(c, { blocked: !miss, missing: miss, tags: [], props: [], excerpt: '' });
    }
    if (before !== JSON.stringify([c.title, c.tags, c.props, c.excerpt, c.blocked, c.missing])) {
      changed = true;
      if (b === session.board) renderCard(c);
    }
  }
  if (changed && b === session.board) save();
}

export async function addVaultNote(g, rel) {
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
