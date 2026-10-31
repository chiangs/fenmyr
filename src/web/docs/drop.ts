// @ts-nocheck
import { typesWith } from '../../shared/cardTypes.ts';
import { esc, renderCard } from '../canvas/render.ts';
import { renderWires, selectOnly } from '../canvas/wires.ts';
import { $ } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { docCard, docHTML, ed, mdToHTML, syncDoc } from './editor.ts';
import { say } from '../settings/licenses.ts';
import { session } from '../core/state.ts';

// ---------- dropping cards into a doc: they arrive as real content (a checklist stays a checklist) ----------
const WORDY = typesWith('wordy');

function cardWords(c) {
  if (c.type === 'note') return [c.name, c.text].filter(x => (x || '').trim()).join('\n');
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

function cardHTML(c) {
  if (c.type === 'note') return (c.name ? `<p><strong>${esc(c.name)}</strong></p>` : '') + mdToHTML(c.text);
  if (c.type === 'todo')
    return (
      (c.text ? `<p><strong>${esc(c.text)}</strong></p>` : '') +
      `<ul data-type="taskList">${(c.items || []).map(i => `<li data-type="taskItem" data-checked="${!!i.done}"><p>${esc(i.t)}</p></li>`).join('')}</ul>`
    );
  if (c.type === 'link') return `<p><a href="${esc(c.url)}">${esc(c.title || c.url)}</a></p>`;
  if (c.type === 'swatch')
    return `<p><span style="color: ${c.hex}">■</span> ${esc(c.label || '')} <code>${c.hex.toUpperCase()}</code></p>`;
  if (c.type === 'title') return `<h2>${esc(c.text)}</h2>`;
  if (c.type === 'doc') return (c.text ? `<h2>${esc(c.text)}</h2>` : '') + docHTML(c);
  return mdToHTML(cardWords(c));
}

// the open doc page, or a doc card on the board, under the pointer (only for cards that have words)
export function docTarget(e, w, moving) {
  const cs = moving.map(m => m.c || m);
  if (!cs.length || !cs.every(c => WORDY.includes(c.type))) return null;
  if (docCard && !cs.includes(docCard)) {
    const r = $('docview').getBoundingClientRect();
    if (e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom) return 'page';
  }
  return (
    [...session.board.cards]
      .reverse()
      .find(c => c.type === 'doc' && !cs.includes(c) && w.x > c.x && w.x < c.x + c.w && w.y > c.y && w.y < c.y + c.h) ||
    null
  );
}

export function dropIntoDoc(t, cs, e) {
  const doc = t === 'page' ? docCard : t,
    html = cs.map(cardHTML).join(''),
    before = { body: doc.body, doc: doc.doc };
  if (t === 'page' && ed) {
    // right where you let go on the page
    const at = ed.view.posAtCoords({ left: e.clientX, top: e.clientY });
    const $p = at && ed.state.doc.resolve(at.pos);
    const pos = $p ? ($p.depth ? $p.after(1) : at.pos) : ed.state.doc.content.size;
    ed.chain().focus().insertContentAt(pos, html).run();
    syncDoc();
  } else {
    doc.doc = FenmyrEditor.generateJSON(docHTML(doc) + html, FenmyrEditor.extensions());
    doc.body = [doc.body, ...cs.map(cardWords)].filter(x => (x || '').trim()).join('\n\n');
  }
  selectOnly(cs.map(c => c.id));
  renderCard(doc);
  renderWires();
  save();
  say(`Copied ${cs.length === 1 ? 'that' : cs.length + ' cards'} into “${doc.text || 'Untitled'}” ✦`, 6000, [
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
