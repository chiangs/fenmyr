import { type CardOf } from '../../shared/model.ts';
import { closestTo, elementById } from '../ui/dom.ts';
import type { DocEditor } from './editorTypes.ts';

export type DocCard = CardOf<'doc'>;
const titleField = () => elementById('dvTitle', HTMLInputElement);
// the doc editor bundle, once its script has loaded
export function editorBundle() {
  const b = window.FenmyrEditor;
  if (!b) throw new Error("The doc editor didn't load.");
  return b;
}
import { renderCard } from '../canvas/render.ts';
import { selectOnly } from '../canvas/wires.ts';
import { CIC } from '../cards/shapes.ts';
import { $, stage } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { hidePop, showPop } from './menus.ts';
import { buildTools, paintTools } from './toolbar.ts';
import { useFont } from '../wireframe/tilt.ts';
import { session } from '../core/state.ts';
import { docHTML, fontsIn } from './docText.ts';

// ---------- docs: a real document editor (styles, fonts, sizes, colors, lists, tables, images, Myra on any words), beside the board ----------
// A doc keeps its rich content in c.doc (the editor's own structured format) and a plain-text copy in c.body (for the card, search and Myra).
export let docCard: DocCard | null = null;
export let ed: DocEditor | null = null;
let dvT: ReturnType<typeof setTimeout> | undefined;
// the editor's popup moves the floating bar out of the page, so keep hold of it
export let bubbleEl: HTMLElement;
// the editor, for the toolbar and menus: they only exist once there is one
export function liveEditor(): DocEditor {
  if (!ed) throw new Error('no doc editor yet');
  return ed;
}
export let DICON: Record<string, string> = {};

function ensureEditor() {
  if (ed) return ed;
  const b = window.FenmyrEditor;
  if (!b) return null;
  ed = new b.Editor({
    element: $('dvBody'),
    extensions: b.extensions('Start writing, or drag cards here from the board…'),
    editorProps: {
      attributes: { class: 'dv-prose', spellcheck: 'true' },
      handleKeyDown: (_v, e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          showPop('link', $('dvTools').querySelector('[data-pop="link"]'));
          return true;
        }
        return false;
      },
      // images dropped or pasted in become part of the doc (kept inside the doc, so they never go missing)
      handleDrop: (v, e) => {
        const fs = [...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith('image/'));
        if (!fs.length) return false;
        e.preventDefault();
        const pos = v.posAtCoords({ left: e.clientX, top: e.clientY })?.pos;
        fs.forEach(f => addDocImage(f, pos));
        return true;
      },
      handlePaste: (_v, e) => {
        const fs = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
        if (!fs.length) return false;
        fs.forEach(f => addDocImage(f));
        return true;
      },
    },
    onUpdate: () => {
      if (!docCard) return;
      clearTimeout(dvT);
      $('dvSaved').textContent = 'saving…';
      dvT = setTimeout(syncDoc, 350);
      paintCount();
    },
    onSelectionUpdate: () => {
      paintTools();
      placeBubble();
    },
    onTransaction: () =>
      requestAnimationFrame(() => {
        paintTools();
        placeBubble();
      }),
    onFocus: () => placeBubble(),
    onBlur: () => setTimeout(placeBubble, 0),
  });
  buildTools();
  return ed;
}

// the floating bar over selected words (TipTap's own bubble menu is not used): above the selection, or below it when there is no room
function placeBubble() {
  const on =
    ed &&
    docCard &&
    !ed.state.selection.empty &&
    ed.isEditable &&
    !ed.isActive('image') &&
    !document.querySelector('#dvPop:not([hidden])') &&
    (ed.isFocused || bubbleEl.contains(document.activeElement));
  if (!on || !ed) {
    bubbleEl.style.display = 'none';
    return;
  }
  const sel = getSelection();
  // where the selected words really are on screen
  let rc: { left: number; right: number; top: number; bottom: number; width?: number } | null =
    sel && sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null;
  if (!rc || !rc.width) {
    const { from, to } = ed.state.selection,
      a = ed.view.coordsAtPos(from),
      b = ed.view.coordsAtPos(to);
    rc = {
      left: Math.min(a.left, b.left),
      right: Math.max(a.right, b.right),
      top: Math.min(a.top, b.top),
      bottom: Math.max(a.bottom, b.bottom),
    };
  }
  bubbleEl.style.display = 'flex';
  const w = bubbleEl.offsetWidth,
    h = bubbleEl.offsetHeight;
  const cx = (rc.left + rc.right) / 2,
    top = rc.top - h - 10;
  bubbleEl.style.left = Math.max(8, Math.min(innerWidth - w - 8, cx - w / 2)) + 'px';
  bubbleEl.style.top = Math.max(8, Math.min(innerHeight - h - 8, top < 8 ? rc.bottom + 10 : top)) + 'px';
}

export function syncDoc() {
  clearTimeout(dvT);
  if (!docCard || !ed) return;
  docCard.doc = ed.getJSON();
  docCard.body = ed
    .getText({ blockSeparator: '\n' })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  renderCard(docCard);
  save();
  $('dvSaved').textContent = 'saved';
}

const paintCount = () => {
  if (!ed) return;
  const w = ed.storage.characterCount.words();
  $('dvCount').textContent = `${w.toLocaleString()} word${w === 1 ? '' : 's'}`;
};

function addDocImage(file: File, pos?: number) {
  const r = new FileReader();
  r.onload = () => {
    if (!ed) return;
    const src = String(r.result),
      ch = ed.chain().focus();
    (pos != null ? ch.insertContentAt(pos, { type: 'image', attrs: { src } }) : ch.setImage({ src })).run();
  };
  r.readAsDataURL(file);
}
export let imgPick: HTMLInputElement;

export function openDoc(c: DocCard) {
  if (docCard && docCard !== c) syncDoc();
  docCard = c;
  titleField().value = c.text || '';
  $('dvWhere').textContent = `${session.board.name} › ${c.text || 'Untitled'}`;
  $('docview').classList.add('on');
  stage.classList.add('doc-open');
  selectOnly([]);
  const e = ensureEditor();
  if (e) {
    e.commands.setContent(docHTML(c), false);
    if (c.doc) fontsIn(c.doc).forEach(useFont);
    e.commands.setTextSelection(0);
    paintTools();
    paintCount();
    $('dvSaved').textContent = '';
  }
  $('dvPage').scrollTop = 0;
  setTimeout(() => (c.text ? e?.commands.focus('end') : titleField().focus()), 250);
}

export function closeDoc() {
  if (!docCard) return;
  syncDoc();
  hidePop();
  bubbleEl.style.display = 'none';
  const c = docCard;
  docCard = null;
  $('docview').classList.remove('on', 'wide');
  stage.classList.remove('doc-open');
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  renderCard(c);
  selectOnly([c.id]);
  save();
}

// writing on a dark page: only the view changes, never what gets saved or downloaded
export const pagePref = () => {
  try {
    return localStorage.getItem('fenmyr:docPage') || 'auto';
  } catch (e) {
    return 'auto';
  }
};

export function applyDocPage() {
  const p = pagePref(),
    dark = p === 'dark' || (p === 'auto' && document.body.classList.contains('dark'));
  $('docview').classList.toggle('page-dark', dark);
}
export function init53() {
  bubbleEl = $('dvBubble');

  DICON = {
    left: Icon('text-left'),
    center: Icon('text-center'),
    right: Icon('text-right'),
    justify: Icon('text-justify'),
    bullet: Icon('bullets'),
    ordered: Icon('numbered'),
    task: Icon('task'),
    link: CIC.link ?? '',
    image: Icon('image'),
    more: Icon('more'),
    hl: Icon('highlight'),
    undo: Icon('undo'),
    redo: Icon('redo'),
    myra: Icon('myra-tool'),
    table: Icon('table'),
    hr: Icon('divider'),
    clear: Icon('clear-format'),
  };

  bubbleEl.addEventListener('mousedown', e => {
    if (closestTo(e.target, 'button')) e.preventDefault();
  });
  // using the bar must not take the selection away from the text
  document.addEventListener(
    'scroll',
    () => {
      if (docCard) placeBubble();
    },
    true,
  );
  addEventListener('resize', () => placeBubble());

  imgPick = Object.assign(document.createElement('input'), {
    type: 'file',
    accept: 'image/*',
    multiple: true,
    hidden: true,
  });
  document.body.appendChild(imgPick);

  imgPick.onchange = () => {
    [...(imgPick.files ?? [])].forEach(f => addDocImage(f));
    imgPick.value = '';
  };

  titleField().oninput = () => {
    if (!docCard) return;
    docCard.text = titleField().value;
    $('dvWhere').textContent = `${session.board.name} › ${docCard.text || 'Untitled'}`;
    renderCard(docCard);
    save();
  };

  titleField().onkeydown = e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      ed?.commands.focus('start');
    }
  };

  $('dvBack').onclick = closeDoc;
  $('dvClose').onclick = closeDoc;

  $('dvExport').onclick = e => {
    ensureEditor();
    showPop('export', e.currentTarget instanceof Element ? e.currentTarget : null);
  };

  $('dvPageMode').onclick = e => {
    ensureEditor();
    showPop('page', e.currentTarget instanceof Element ? e.currentTarget : null);
  };

  new MutationObserver(applyDocPage).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  applyDocPage();
}
