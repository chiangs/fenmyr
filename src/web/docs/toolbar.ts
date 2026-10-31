// @ts-nocheck
import { clamp } from '../core/base.ts';
import { $ } from '../core/dom.ts';
import { BLOCKS, DICON, DOC_FONT, SIZES, bubbleEl, docCard, docDefault, ed, fontName, imgPick } from './editor.ts';
import { showPop } from './menus.ts';

// ---------- the toolbar ----------
export function buildTools() {
  const tb = (c, label, tip, cls = '') =>
    `<button type="button" class="dt-b ${cls}" data-c="${c}" title="${tip}" aria-label="${tip}">${label}</button>`;
  const pop = (p, label, tip, cls = '') =>
    `<button type="button" class="dt-b dt-drop ${cls}" data-pop="${p}" title="${tip}" aria-label="${tip}" aria-haspopup="true">${label}</button>`;
  $('dvTools').innerHTML = [
    tb('undo', DICON.undo, 'Undo · ⌘Z', 'dt-fold f7'),
    tb('redo', DICON.redo, 'Redo · ⇧⌘Z', 'dt-fold f8'),
    '<span class="dt-sep"></span>',
    pop('style', '<span class="dt-lbl" id="dtStyle">Body</span><i class="dt-car"></i>', 'Text style', 'dt-style'),
    pop('font', '<span class="dt-lbl" id="dtFont">Figtree</span><i class="dt-car"></i>', 'Font', 'dt-font'),
    `<span class="dt-size" title="Text size"><button type="button" class="dt-b" data-c="smaller" aria-label="Smaller">−</button><input id="dtSize" inputmode="numeric" aria-label="Text size" value="16"><button type="button" class="dt-b" data-c="bigger" aria-label="Bigger">+</button></span>`,
    '<span class="dt-sep"></span>',
    tb('bold', '<b>B</b>', 'Bold · ⌘B', 'dt-t'),
    tb('italic', '<i>I</i>', 'Italic · ⌘I', 'dt-t'),
    tb('underline', '<u>U</u>', 'Underline · ⌘U', 'dt-t'),
    tb('strike', '<s>S</s>', 'Strikethrough · ⇧⌘S', 'dt-t'),
    pop('color', '<span class="dt-a">A<i id="dtColorBar"></i></span>', 'Text colour'),
    pop('hl', DICON.hl, 'Highlight', 'dt-hl'),
    '<span class="dt-sep"></span>',
    pop('align', `<span id="dtAlign">${DICON.left}</span>`, 'Alignment', 'dt-fold f6'),
    tb('bullet', DICON.bullet, 'Bulleted list', 'dt-fold f5'),
    tb('ordered', DICON.ordered, 'Numbered list', 'dt-fold f4'),
    tb('task', DICON.task, 'Checklist', 'dt-fold f3'),
    '<span class="dt-sep"></span>',
    pop('link', DICON.link, 'Link · ⌘K', 'dt-fold f2'),
    tb('image', DICON.image, 'Add a picture', 'dt-fold f1'),
    pop('more', DICON.more, 'More: line spacing, tables, dividers…'),
    `<button type="button" class="dt-myra dt-round" data-pop="myra" data-tip="Myra" aria-label="Ask Myra about your selection">${DICON.myra}</button>`,
  ].join('');
  bubbleEl.innerHTML = [
    tb('bold', '<b>B</b>', 'Bold', 'dt-t'),
    tb('italic', '<i>I</i>', 'Italic', 'dt-t'),
    tb('underline', '<u>U</u>', 'Underline', 'dt-t'),
    tb('strike', '<s>S</s>', 'Strikethrough', 'dt-t'),
    pop('color', '<span class="dt-a">A<i class="dtBar"></i></span>', 'Text colour'),
    pop('hl', DICON.hl, 'Highlight', 'dt-hl'),
    pop('link', DICON.link, 'Link'),
    `<button type="button" class="dt-myra" data-pop="myra" title="Ask Myra to rewrite this">${DICON.myra}<span>Myra</span></button>`,
  ].join('');
  [$('dvTools'), bubbleEl].forEach(bar => {
    bar.addEventListener('mousedown', e => {
      if (!e.target.closest('input')) e.preventDefault();
    }); // keep the text selected while using the bar
    bar.addEventListener('click', e => {
      const b = e.target.closest('[data-c], [data-pop]');
      if (!b) return;
      if (b.dataset.pop) return showPop(b.dataset.pop, b);
      run(b.dataset.c);
    });
  });
  const sz = $('dtSize');
  sz.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = clamp(parseInt(sz.value, 10) || 16, 6, 200);
      ed.chain()
        .focus()
        .setFontSize(v + 'px')
        .run();
    }
    if (e.key === 'Escape') {
      sz.blur();
      ed.commands.focus();
    }
  });
  sz.addEventListener('focus', () => sz.select());
  new ResizeObserver(() => requestAnimationFrame(fitTools)).observe($('docview'));
}

// keep the toolbar to one row: when space is tight, picture, link, lists and alignment fold into More (like Word and Google Docs)
export function fitTools() {
  const bar = $('dvTools');
  if (!bar.offsetParent) return;
  const folds = [...bar.querySelectorAll('.dt-fold')].sort(
    (a, b) => +a.className.match(/f(\d)/)[1] - +b.className.match(/f(\d)/)[1],
  );
  folds.forEach(b => (b.hidden = false));
  bar.querySelectorAll('.dt-sep').forEach(x => (x.hidden = false));
  const first = bar.firstElementChild,
    oneRow = () => bar.lastElementChild.offsetTop - first.offsetTop < 6;
  for (const b of folds) {
    if (oneRow()) break;
    b.hidden = true;
    tidySeps(bar);
  }
  tidySeps(bar);
}

function tidySeps(bar) {
  // no separator at the edges or two in a row once buttons fold away
  let prev = null;
  [...bar.children].forEach(el => {
    if (el.hidden && !el.classList.contains('dt-sep')) return;
    if (el.classList.contains('dt-sep')) {
      el.hidden = !prev || prev.classList.contains('dt-sep');
      if (!el.hidden) prev = el;
    } else prev = el;
  });
  const vis = [...bar.children].filter(el => !el.hidden);
  const last = vis[vis.length - 2];
  if (last?.classList.contains('dt-sep')) last.hidden = true;
}

const docSize = () => {
  const s = parseFloat(ed.getAttributes('textStyle').fontSize);
  if (s) return s;
  return (BLOCKS.find(b => b[0] === blockOf()) || BLOCKS[3])[2];
};

export function blockOf() {
  if (!ed) return 'body';
  if (ed.isActive('heading', { level: 1 })) return 'title';
  if (ed.isActive('heading', { level: 2 })) return 'heading';
  if (ed.isActive('heading', { level: 3 })) return 'sub';
  if (ed.isActive('codeBlock')) return 'code';
  if (ed.isActive('blockquote')) return 'quote';
  const k = ed.getAttributes('paragraph').kind;
  return k === 'lead' || k === 'caption' ? k : 'body';
}

export function setBlock(k) {
  const c = ed.chain().focus();
  if (ed.isActive('blockquote') && k !== 'quote') c.lift('blockquote');
  if (ed.isActive('codeBlock') && k !== 'code') c.setParagraph();
  ({
    title: () => c.setHeading({ level: 1 }),
    heading: () => c.setHeading({ level: 2 }),
    sub: () => c.setHeading({ level: 3 }),
    body: () => c.setParagraph().updateAttributes('paragraph', { kind: null }),
    lead: () => c.setParagraph().updateAttributes('paragraph', { kind: 'lead' }),
    caption: () => c.setParagraph().updateAttributes('paragraph', { kind: 'caption' }),
    quote: () => (ed.isActive('blockquote') ? c : c.setParagraph().setBlockquote()),
    code: () => c.setCodeBlock(),
  })[k]();
  c.run();
}

export function run(cmd) {
  if (!ed) return;
  const c = ed.chain().focus();
  const step = d => {
    const s = docSize();
    const n = d > 0 ? SIZES.find(x => x > s) || s + 8 : [...SIZES].reverse().find(x => x < s) || Math.max(6, s - 2);
    return n + 'px';
  };
  ({
    undo: () => c.undo(),
    redo: () => c.redo(),
    bold: () => c.toggleBold(),
    italic: () => c.toggleItalic(),
    underline: () => c.toggleUnderline(),
    strike: () => c.toggleStrike(),
    bullet: () => c.toggleBulletList(),
    ordered: () => c.toggleOrderedList(),
    task: () => c.toggleTaskList(),
    smaller: () => c.setFontSize(step(-1)),
    bigger: () => c.setFontSize(step(1)),
    image: () => (imgPick.click(), c),
  })
    [cmd]?.()
    .run();
}

// show what's true where the cursor is: style, font, size, bold…, alignment, colors
export function paintTools() {
  if (!ed || !docCard) return;
  const k = blockOf(),
    st = ed.getAttributes('textStyle');
  $('dtStyle').textContent = (BLOCKS.find(b => b[0] === k) || BLOCKS[3])[1];
  const f = fontName(st.fontFamily) || docDefault();
  $('dtFont').textContent = f;
  $('dtFont').style.fontFamily = `"${f}", ${DOC_FONT}, system-ui`;
  if (document.activeElement !== $('dtSize')) $('dtSize').value = Math.round(docSize());
  const on = {
    bold: 'bold',
    italic: 'italic',
    underline: 'underline',
    strike: 'strike',
    bullet: 'bulletList',
    ordered: 'orderedList',
    task: 'taskList',
  };
  [$('dvTools'), bubbleEl].forEach(bar =>
    bar.querySelectorAll('[data-c]').forEach(b => {
      const n = on[b.dataset.c];
      if (n) b.classList.toggle('on', ed.isActive(n));
    }),
  );
  const al = ['center', 'right', 'justify'].find(a => ed.isActive({ textAlign: a })) || 'left';
  $('dtAlign').innerHTML = DICON[al];
  const col = st.color || '';
  [$('dtColorBar'), ...bubbleEl.querySelectorAll('.dtBar')].forEach(b => (b.style.background = col || 'var(--ink)'));
  const hl = ed.getAttributes('highlight').color || '';
  [...$('dvTools').querySelectorAll('.dt-hl .bar'), ...bubbleEl.querySelectorAll('.dt-hl .bar')].forEach(
    b => (b.style.stroke = hl || '#f4dc6c'),
  );
  $('dvTools').querySelector('[data-c="undo"]').disabled = !ed.can().undo();
  $('dvTools').querySelector('[data-c="redo"]').disabled = !ed.can().redo();
}
