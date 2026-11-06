import { typesWith } from '../../shared/cardTypes.ts';
import type { Card } from '../../shared/model.ts';
import { renderCard } from '../canvas/render.ts';
import { renderWires, selectOnly } from '../canvas/wires.ts';
import { $ } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { session } from '../core/state.ts';
import { say } from '../myra/say.ts';
import { docsHtmlOf, plainOf } from '../richtext/render.ts';
import { esc } from '../ui/dom.ts';
import { docHTML, mdToHTML } from './docText.ts';
import { type DocCard, docCard, ed, editorBundle, syncDoc } from './editor.ts';

// ---------- dropping cards into a doc: they arrive as real content (a checklist stays a checklist) ----------
const WORDY = typesWith('wordy');

function cardWords(c: Card) {
  if (c.type === 'note') return [c.name, plainOf(c)].filter(x => (x || '').trim()).join('\n');
  if (c.type === 'todo')
    return [(c.text || '').trim(), ...(c.items || []).map(i => (i.done ? '☑ ' : '☐ ') + i.t)]
      .filter(Boolean)
      .join('\n');
  if (c.type === 'link') return [c.title, c.url].filter(Boolean).join('\n');
  if (c.type === 'swatch') return `${c.label || ''} ${c.hex.toUpperCase()}`.trim();
  if (c.type === 'audio') return [c.title, c.text].filter(Boolean).join('\n');
  if (c.type === 'spotify') return [c.title, c.desc].filter(Boolean).join(' · ');
  if (c.type === 'doc') return [c.text, c.body].filter(x => (x || '').trim()).join('\n');
  return c.text || '';
}

// a bold first line, when there is one
const lead = (words: string | undefined) => {
  const text = esc(words);
  return words ? `<p><strong>${text}</strong></p>` : '';
};

function cardHTML(c: Card) {
  if (c.type === 'note') return lead(c.name) + (c.rich ? docsHtmlOf(c.text ?? '') : mdToHTML(c.text));
  if (c.type === 'todo') {
    const first = lead(c.text),
      items = taskItems(c.items);
    return `${first}<ul data-type="taskList">${items}</ul>`;
  }
  if (c.type === 'link') {
    const url = esc(c.url),
      name = esc(c.title || c.url);
    return `<p><a href="${url}">${name}</a></p>`;
  }
  if (c.type === 'swatch') {
    const label = esc(c.label || ''),
      hex = c.hex.toUpperCase();
    return `<p><span style="color: ${c.hex}">■</span> ${label} <code>${hex}</code></p>`;
  }
  const heading = esc(c.text);
  if (c.type === 'title') return `<h2>${heading}</h2>`;
  if (c.type === 'doc') return (c.text ? `<h2>${heading}</h2>` : '') + docHTML(c);
  return mdToHTML(cardWords(c));
}

const taskItems = (items: { t: string; done?: boolean }[] = []) =>
  items
    .map(i => {
      const done = !!i.done,
        t = esc(i.t);
      return `<li data-type="taskItem" data-checked="${done}"><p>${t}</p></li>`;
    })
    .join('');

// the open doc page, or a doc card on the board, under the pointer (only for cards that have words)
export function docTarget(
  e: MouseEvent,
  w: { x: number; y: number },
  moving: (Card | { c: Card })[],
): 'page' | DocCard | null {
  const cs = moving.map(m => ('c' in m ? m.c : m));
  if (!cs.length || !cs.every(c => WORDY.includes(c.type))) return null;
  if (docCard && !cs.includes(docCard)) {
    const r = $('docview').getBoundingClientRect();
    if (e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom) return 'page';
  }
  return (
    [...session.board.cards]
      .reverse()
      .find(
        (c): c is DocCard =>
          c.type === 'doc' && !cs.includes(c) && w.x > c.x && w.x < c.x + c.w && w.y > c.y && w.y < c.y + c.h,
      ) || null
  );
}

export function dropIntoDoc(t: 'page' | DocCard, cs: Card[], e: MouseEvent) {
  const doc = t === 'page' ? docCard : t;
  if (!doc) return;
  const html = cs.map(cardHTML).join(''),
    before = { body: doc.body, doc: doc.doc };
  if (t === 'page' && ed) {
    // right where you let go on the page
    const at = ed.view.posAtCoords({ left: e.clientX, top: e.clientY });
    const $p = at && ed.state.doc.resolve(at.pos);
    const pos = at && $p ? ($p.depth ? $p.after(1) : at.pos) : ed.state.doc.content.size;
    ed.chain().focus().insertContentAt(pos, html).run();
    syncDoc();
  } else {
    const bundle = editorBundle();
    doc.doc = bundle.generateJSON(docHTML(doc) + html, bundle.extensions());
    doc.body = [doc.body, ...cs.map(cardWords)].filter(x => (x || '').trim()).join('\n\n');
  }
  selectOnly(cs.map(c => c.id));
  renderCard(doc);
  renderWires();
  save();
  say(`Copied ${cs.length === 1 ? 'that' : `${cs.length} cards`} into “${doc.text || 'Untitled'}” ✦`, 6000, [
    {
      label: 'Undo',
      run: () => {
        if (t === 'page' && ed && docCard === doc) {
          ed.commands.undo();
          syncDoc();
        } else {
          doc.body = before.body;
          doc.doc = before.doc;
          if (docCard === doc && ed) ed.commands.setContent(docHTML(doc), false);
        }
        renderCard(doc);
        save();
      },
    },
  ]);
}
