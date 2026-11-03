import { clamp } from '../core/base.ts';
import { $ } from '../core/dom.ts';
import { closestTo, elementById, htmlIn } from '../ui/dom.ts';
import { BLOCKS, DOC_FONT, docDefault, fontName, SIZES } from './docText.ts';
import { bubbleEl, DICON, docCard, ed, imgPick, liveEditor } from './editor.ts';
import { showPop } from './menus.ts';

const sizeField = () => elementById('dtSize', HTMLInputElement);

// ---------- the toolbar ----------
export function buildTools() {
  const tb = (c: string, label: string | undefined, tip: string, cls = '') =>
    `<button type="button" class="dt-b ${cls}" data-c="${c}" title="${tip}" aria-label="${tip}">${label}</button>`;
  const pop = (p: string, label: string | undefined, tip: string, cls = '') =>
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
      if (!closestTo(e.target, 'input')) e.preventDefault();
    }); // keep the text selected while using the bar
    bar.addEventListener('click', e => {
      const b = closestTo(e.target, '[data-c], [data-pop]');
      if (!b) return;
      if (b.dataset.pop) return showPop(b.dataset.pop, b);
      run(b.dataset.c ?? '');
    });
  });
  const sz = sizeField();
  sz.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = clamp(parseInt(sz.value, 10) || 16, 6, 200);
      liveEditor().chain().focus().setFontSize(`${v}px`).run();
    }
    if (e.key === 'Escape') {
      sz.blur();
      liveEditor().commands.focus();
    }
  });
  sz.addEventListener('focus', () => sz.select());
  new ResizeObserver(() => requestAnimationFrame(fitTools)).observe($('docview'));
}

// keep the toolbar to one row: when space is tight, picture, link, lists and alignment fold into More (like Word and Google Docs)
export function fitTools() {
  const bar = $('dvTools');
  if (!bar.offsetParent) return;
  const order = (el: Element) => Number(/f(\d)/.exec(el.className)?.[1] ?? 0),
    folds = htmlIn(bar, '.dt-fold').sort((a, b) => order(a) - order(b));
  folds.forEach(b => {
    b.hidden = false;
  });
  htmlIn(bar, '.dt-sep').forEach(x => {
    x.hidden = false;
  });
  const top = (el: Element | null) => (el instanceof HTMLElement ? el.offsetTop : 0),
    oneRow = () => top(bar.lastElementChild) - top(bar.firstElementChild) < 6;
  for (const b of folds) {
    if (oneRow()) break;
    b.hidden = true;
    tidySeps(bar);
  }
  tidySeps(bar);
}

function tidySeps(bar: HTMLElement) {
  // no separator at the edges or two in a row once buttons fold away
  let prev: HTMLElement | null = null;
  htmlIn(bar, ':scope > *').forEach(el => {
    if (el.hidden && !el.classList.contains('dt-sep')) return;
    if (el.classList.contains('dt-sep')) {
      el.hidden = !prev || prev.classList.contains('dt-sep');
      if (!el.hidden) prev = el;
    } else prev = el;
  });
  const vis = htmlIn(bar, ':scope > *').filter(el => !el.hidden);
  const last = vis[vis.length - 2];
  if (last?.classList.contains('dt-sep')) last.hidden = true;
}

// a function, not a constant: editor.ts and this module import each other, so BLOCKS isn't there yet while this one loads
const body = () => BLOCKS.find(b => b[0] === 'body') ?? ['body', 'Body', 16];
const docSize = () => {
  const s = parseFloat(String(liveEditor().getAttributes('textStyle').fontSize));
  if (s) return s;
  return (BLOCKS.find(b => b[0] === blockOf()) || body())[2];
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

export function setBlock(k: string) {
  const e = liveEditor(),
    c = e.chain().focus();
  if (e.isActive('blockquote') && k !== 'quote') c.lift('blockquote');
  if (e.isActive('codeBlock') && k !== 'code') c.setParagraph();
  const how: Record<string, () => unknown> = {
    title: () => c.setHeading({ level: 1 }),
    heading: () => c.setHeading({ level: 2 }),
    sub: () => c.setHeading({ level: 3 }),
    body: () => c.setParagraph().updateAttributes('paragraph', { kind: null }),
    lead: () => c.setParagraph().updateAttributes('paragraph', { kind: 'lead' }),
    caption: () => c.setParagraph().updateAttributes('paragraph', { kind: 'caption' }),
    quote: () => (e.isActive('blockquote') ? c : c.setParagraph().setBlockquote()),
    code: () => c.setCodeBlock(),
  };
  how[k]?.();
  c.run();
}

export function run(cmd: string) {
  if (!ed) return;
  const c = ed.chain().focus();
  const step = (d: number) => {
    const s = docSize();
    const n = d > 0 ? SIZES.find(x => x > s) || s + 8 : [...SIZES].reverse().find(x => x < s) || Math.max(6, s - 2);
    return `${n}px`;
  };
  const how: Record<string, () => typeof c> = {
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
    image: () => {
      imgPick.click();
      return c;
    },
  };
  how[cmd]?.().run();
}

// show what's true where the cursor is: style, font, size, bold…, alignment, colors
export function paintTools() {
  const e = ed;
  if (!e || !docCard) return;
  const k = blockOf(),
    st = e.getAttributes('textStyle');
  $('dtStyle').textContent = (BLOCKS.find(b => b[0] === k) || body())[1];
  const f = fontName(st.fontFamily) || docDefault();
  $('dtFont').textContent = f;
  $('dtFont').style.fontFamily = `"${f}", ${DOC_FONT}, system-ui`;
  if (document.activeElement !== sizeField()) sizeField().value = String(Math.round(docSize()));
  const on: Record<string, string> = {
    bold: 'bold',
    italic: 'italic',
    underline: 'underline',
    strike: 'strike',
    bullet: 'bulletList',
    ordered: 'orderedList',
    task: 'taskList',
  };
  for (const bar of [$('dvTools'), bubbleEl])
    for (const b of htmlIn(bar, '[data-c]')) {
      const n = on[b.dataset.c ?? ''];
      if (n) b.classList.toggle('on', e.isActive(n));
    }
  const al = ['center', 'right', 'justify'].find(a => e.isActive({ textAlign: a })) || 'left';
  $('dtAlign').innerHTML = DICON[al] ?? '';
  const col = String(st.color || '');
  for (const b of [$('dtColorBar'), ...htmlIn(bubbleEl, '.dtBar')]) b.style.background = col || 'var(--ink)';
  const hl = String(e.getAttributes('highlight').color || '');
  for (const b of [...$('dvTools').querySelectorAll('.dt-hl .bar'), ...bubbleEl.querySelectorAll('.dt-hl .bar')])
    if (b instanceof SVGElement || b instanceof HTMLElement) b.style.stroke = hl || '#f4dc6c';
  const undo = $('dvTools').querySelector('[data-c="undo"]'),
    redo = $('dvTools').querySelector('[data-c="redo"]');
  if (undo instanceof HTMLButtonElement) undo.disabled = !e.can().undo();
  if (redo instanceof HTMLButtonElement) redo.disabled = !e.can().redo();
}
