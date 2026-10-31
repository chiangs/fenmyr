// @ts-nocheck
import { esc, renderCard } from '../canvas/render.ts';
import { selectOnly } from '../canvas/wires.ts';
import { CIC } from '../cards/shapes.ts';
import { $, stage } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { hidePop, showPop } from './menus.ts';
import { buildTools, paintTools } from './toolbar.ts';
import { settings } from '../settings/settings.ts';
import { useFont } from '../wireframe/tilt.ts';
import { session } from '../core/state.ts';

// ---------- docs: a real document editor (styles, fonts, sizes, colors, lists, tables, images, Myra on any words), beside the board ----------
// A doc keeps its rich content in c.doc (the editor's own structured format) and a plain-text copy in c.body (for the card, search and Myra).
export let docCard = null;
export let ed = null;
let dvT = 0;
export let bubbleEl;
// the editor's popup moves the floating bar out of the page, so keep hold of it
export const DOC_FONT = 'Figtree';
export const docDefault = () => (settings.defaultFont || '').trim() || DOC_FONT;
export const SIZES = [9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 60, 72];

export const BLOCKS = [
  ['title', 'Title', 36],
  ['heading', 'Heading', 26],
  ['sub', 'Subheading', 20],
  ['body', 'Body', 16],
  ['lead', 'Lead', 19],
  ['caption', 'Caption', 13],
  ['quote', 'Quote', 18],
  ['code', 'Code', 14],
];

export const TEXT_COLORS = [
  '#2b2630',
  '#6b6370',
  '#a39aa8',
  '#d9771f',
  '#e8590c',
  '#c99a00',
  '#1f9d63',
  '#1f7ae0',
  '#6b4fe0',
  '#c0392b',
];

export const HIGHLIGHTS = ['#fff1a8', '#ffd3e5', '#cdf2df', '#d4e8ff', '#e5dbff', '#ffe0c9', '#e9e4ec'];

// all on Google Fonts, so they show up on any computer (the Mac list's Helvetica Neue, Avenir Next, Futura, Gill Sans, Baskerville,
// Palatino, Didot and Menlo are Apple's own; these are their closest free cousins)
export const SUGGESTED_FONTS = [
  'Figtree',
  'Inter',
  'Nunito Sans',
  'Jost',
  'Lato',
  'Gelasio',
  'Libre Baskerville',
  'EB Garamond',
  'Tinos',
  'Bodoni Moda',
  'Playfair Display',
  'Lora',
  'Fraunces',
  'Merriweather',
  'Space Grotesk',
  'IBM Plex Mono',
  'JetBrains Mono',
  'Shantell Sans',
];
export let DICON;

export const fontName = f =>
  String(f || '')
    .replace(/["']/g, '')
    .split(',')[0]
    .trim();

// plain text or Myra's light markdown → editor HTML (headings, lists, checklists, quotes, dividers, **bold**, *italic*, `code`)
export function mdToHTML(src) {
  const inl = s =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>');
  const lines = String(src || '')
    .replace(/\r/g, '')
    .split('\n');
  let out = '',
    list = null;
  const close = () => {
    if (list) {
      out += `</${list === 'task' ? 'ul' : list}>`;
      list = null;
    }
  };
  const open = k => {
    if (list !== k) {
      close();
      out += k === 'task' ? '<ul data-type="taskList">' : `<${k}>`;
      list = k;
    }
  };
  for (const raw of lines) {
    const l = raw.trimEnd();
    let m;
    if (!l.trim()) {
      close();
      continue;
    }
    if ((m = l.match(/^(#{1,3})\s+(.*)/))) {
      close();
      out += `<h${m[1].length}>${inl(m[2])}</h${m[1].length}>`;
    } else if ((m = l.match(/^\s*(?:(?:[-*]\s+)?\[( |x|X)\]|([☐☑]))\s*(.*)/))) {
      open('task');
      const on = (m[1] || '').toLowerCase() === 'x' || m[2] === '☑';
      out += `<li data-type="taskItem" data-checked="${on}"><p>${inl(m[3])}</p></li>`;
    } else if ((m = l.match(/^\s*[-*•]\s+(.*)/))) {
      open('ul');
      out += `<li><p>${inl(m[1])}</p></li>`;
    } else if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) {
      open('ol');
      out += `<li><p>${inl(m[1])}</p></li>`;
    } else if ((m = l.match(/^>\s?(.*)/))) {
      close();
      out += `<blockquote><p>${inl(m[1])}</p></blockquote>`;
    } else if (/^(-{3,}|\*{3,})$/.test(l.trim())) {
      close();
      out += '<hr>';
    } else {
      close();
      out += `<p>${inl(l)}</p>`;
    }
  }
  close();
  return out || '<p></p>';
}

export const docHTML = c =>
  c.doc && window.FenmyrEditor ? FenmyrEditor.generateHTML(c.doc, FenmyrEditor.extensions()) : mdToHTML(c.body);

// load any web fonts a doc uses, so it looks right on this computer
export function fontsIn(json) {
  const out = new Set();
  (function walk(n) {
    (n?.marks || []).forEach(
      m => m.type === 'textStyle' && m.attrs?.fontFamily && out.add(fontName(m.attrs.fontFamily)),
    );
    (n?.content || []).forEach(walk);
  })(json);
  return [...out];
}

function ensureEditor() {
  if (ed) return ed;
  if (!window.FenmyrEditor) return null;
  ed = new FenmyrEditor.Editor({
    element: $('dvBody'),
    extensions: FenmyrEditor.extensions('Start writing, or drag cards here from the board…'),
    editorProps: {
      attributes: { class: 'dv-prose', spellcheck: 'true' },
      handleKeyDown: (v, e) => {
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
      handlePaste: (v, e) => {
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
  if (!on) {
    bubbleEl.style.display = 'none';
    return;
  }
  const sel = getSelection();
  let rc = sel && sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null; // where the selected words really are on screen
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

function addDocImage(file, pos) {
  const r = new FileReader();
  r.onload = () => {
    const ch = ed.chain().focus();
    (pos != null
      ? ch.insertContentAt(pos, { type: 'image', attrs: { src: r.result } })
      : ch.setImage({ src: r.result })
    ).run();
  };
  r.readAsDataURL(file);
}
export let imgPick;

export function openDoc(c) {
  if (docCard && docCard !== c) syncDoc();
  docCard = c;
  $('dvTitle').value = c.text || '';
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
  setTimeout(() => (c.text ? e?.commands.focus('end') : $('dvTitle').focus()), 250);
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
  document.activeElement.blur();
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
    link: CIC.link,
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
    if (e.target.closest('button')) e.preventDefault();
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
    [...imgPick.files].forEach(f => addDocImage(f));
    imgPick.value = '';
  };

  $('dvTitle').oninput = () => {
    if (!docCard) return;
    docCard.text = $('dvTitle').value;
    $('dvWhere').textContent = `${session.board.name} › ${docCard.text || 'Untitled'}`;
    renderCard(docCard);
    save();
  };

  $('dvTitle').onkeydown = e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      ed?.commands.focus('start');
    }
  };

  $('dvBack').onclick = closeDoc;
  $('dvClose').onclick = closeDoc;

  $('dvExport').onclick = e => {
    ensureEditor();
    showPop('export', e.currentTarget);
  };

  $('dvPageMode').onclick = e => {
    ensureEditor();
    showPop('page', e.currentTarget);
  };

  new MutationObserver(applyDocPage).observe(document.body, { attributes: true, attributeFilter: ['class'] });

  applyDocPage();
}
