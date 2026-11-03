import { closeOnOutsidePress } from '../ui/popover.ts';
import { closestTo } from '../ui/dom.ts';
import { $ } from '../core/dom.ts';
import { HIGHLIGHTS, TEXT_COLORS, applyDocPage, docDefault, ed, liveEditor } from './editor.ts';
import { hidePop, showPop } from './menus.ts';
import { rewrite } from './rewrite.ts';
import { run, setBlock } from './toolbar.ts';
import { downloadPDF, downloadWord } from './word.ts';
import { openColor } from '../ui/colorPicker.ts';
import { useFont } from '../wireframe/tilt.ts';

// ---------- what the doc menus' buttons do ----------
const p_seg = (b: HTMLElement) =>
  b.parentNode?.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
export function init55() {
  $('dvPop').addEventListener('mousedown', e => {
    if (!closestTo(e.target, 'input')) e.preventDefault();
  });

  $('dvPop').addEventListener('click', e => {
    const b = closestTo(e.target, 'button', HTMLButtonElement);
    if (!b || b.type === 'submit') return;
    const ed = liveEditor(),
      d = b.dataset,
      c = ed.chain().focus();
    if (d.block) {
      setBlock(d.block);
      return hidePop();
    }
    if (d.font != null) {
      useFont(d.font);
      (d.font === docDefault() ? c.unsetFontFamily() : c.setFontFamily(`"${d.font}"`)).run();
      return hidePop();
    }
    if (d.tc != null) {
      (d.tc ? c.setColor(d.tc) : c.unsetColor()).run();
      return hidePop();
    }
    if (d.hl != null) {
      (d.hl ? c.setHighlight({ color: d.hl }) : c.unsetHighlight()).run();
      return hidePop();
    }
    if (d.any) {
      const isHl = d.any === 'hl',
        r = b.getBoundingClientRect(),
        sel = { from: ed.state.selection.from, to: ed.state.selection.to };
      hidePop();
      openColor({
        tint: true,
        boardColors: true,
        title: isHl ? 'Highlight' : 'Text colour',
        hex: String(
          (isHl ? ed.getAttributes('highlight').color : ed.getAttributes('textStyle').color) ||
            (isHl ? '#fff1a8' : '#d9771f'),
        ),
        presets: isHl ? HIGHLIGHTS : TEXT_COLORS,
        at: { x: r.left, y: r.bottom + 8 },
        apply: (hex: string) => {
          const k = ed.chain().setTextSelection(sel);
          (isHl ? k.setHighlight({ color: hex }) : k.setColor(hex)).run();
        },
        reset: () => {
          const k = ed.chain().setTextSelection(sel);
          (isHl ? k.unsetHighlight() : k.unsetColor()).run();
        },
      });
      return;
    }
    if (d.align) {
      c.setTextAlign(d.align).run();
      return hidePop();
    }
    if (d.c2) {
      hidePop();
      run(d.c2);
      return;
    }
    if (d.flink) {
      const more = $('dvTools').querySelector('[data-pop="more"]');
      hidePop();
      return showPop('link', more);
    }
    if (d.link === 'open') {
      Fenmyr.openURL(String(ed.getAttributes('link').href || ''));
      return hidePop();
    }
    if (d.link === 'remove') {
      c.extendMarkRange('link').unsetLink().run();
      return hidePop();
    }
    if (d.lh) {
      (ed.getAttributes('paragraph').lineHeight === d.lh || ed.getAttributes('heading').lineHeight === d.lh
        ? c.unsetLineHeight()
        : c.setLineHeight(d.lh)
      ).run();
      return hidePop();
    }
    if (d.ins) {
      const ins: Record<string, () => typeof c> = {
        table: () => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
        hr: () => c.setHorizontalRule(),
        sup: () => c.toggleSuperscript(),
        sub: () => c.toggleSubscript(),
        clear: () => c.unsetAllMarks().clearNodes(),
      };
      ins[d.ins]?.().run();
      return hidePop();
    }
    if (d.tbl) {
      const tbl: Record<string, () => typeof c> = {
        rowAfter: () => c.addRowAfter(),
        colAfter: () => c.addColumnAfter(),
        delRow: () => c.deleteRow(),
        delCol: () => c.deleteColumn(),
        header: () => c.toggleHeaderRow(),
        delTable: () => c.deleteTable(),
      };
      tbl[d.tbl]?.().run();
      return hidePop();
    }
    if (d.page) {
      try {
        localStorage.setItem('fenmyr:docPage', d.page);
      } catch (er) {}
      applyDocPage();
      return hidePop();
    }
    if (d.paper) {
      try {
        localStorage.setItem('fenmyr:paper', d.paper);
      } catch (er) {}
      p_seg(b);
      return;
    }
    if (d.pdf) {
      hidePop();
      downloadPDF();
      return;
    }
    if (d.word) {
      hidePop();
      downloadWord();
      return;
    }
    if (d.how) rewrite(d.how);
  });

  closeOnOutsidePress('#dvPop, .dt-drop, .dt-myra, #cpop', () => {
    if (!$('dvPop').hidden) hidePop();
  });

  $('docview').addEventListener(
    'keydown',
    e => {
      if (e.key === 'Escape' && !$('dvPop').hidden) {
        e.stopPropagation();
        hidePop();
        ed?.commands.focus();
      }
    },
    true,
  );
}
