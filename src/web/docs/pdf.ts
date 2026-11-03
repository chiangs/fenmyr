import { esc } from '../ui/dom.ts';
import { docCard, ed } from './editor.ts';
import { docHTML, fontsIn } from './docText.ts';
import { settings } from '../settings/settings.ts';
import { isLocalFont } from '../wireframe/tilt.ts';

// ---------- a doc as a PDF: the same styles you see, laid out on real pages ----------
// the editor's own text styles, read from the app's stylesheet, so the PDF always matches the screen
function proseCSS() {
  let out = '';
  for (const sh of document.styleSheets) {
    let rules: CSSRuleList;
    try {
      rules = sh.cssRules;
    } catch {
      continue;
    }
    for (const r of rules)
      if (
        r instanceof CSSStyleRule &&
        /\.dv-prose/.test(r.selectorText) &&
        !/page-dark|ProseMirror-selectednode|selectedCell|column-resize|resize-cursor|is-empty|::selection|is-editor-empty/.test(
          r.selectorText,
        )
      )
        out += r.cssText + '\n';
  }
  return out;
}

export function docPrintHTML(paper: string) {
  // glue each heading to the block after it, so a heading never sits alone at the bottom of a page (WebKit's print ignores break-after)
  const glue = (html: string) => {
    const d = new DOMParser().parseFromString(`<div id="r">${html}</div>`, 'text/html'),
      r = d.getElementById('r');
    if (!r) return html;
    [...r.querySelectorAll(':scope > h1, :scope > h2, :scope > h3')].forEach(h => {
      const w = d.createElement('div');
      w.className = 'keep';
      h.before(w);
      w.append(h);
      const n = w.nextElementSibling;
      if (n && !/^H[1-3]$/.test(n.tagName)) w.append(n);
    });
    return r.innerHTML;
  };
  const doc = docCard,
    body = glue(ed ? ed.getHTML() : doc ? docHTML(doc) : ''),
    first = (ed ? ed.state.doc.firstChild?.textContent : '') || '',
    named = (doc?.text || '').trim();
  // no double title when the doc already starts with it
  const title = named && first.trim().toLowerCase() !== named.toLowerCase() ? named : '';
  const dfont = (settings.defaultFont || '').trim().replace(/"/g, ''),
    web = [...new Set([...fontsIn(ed ? ed.getJSON() : doc?.doc || {}), ...(dfont ? [dfont] : [])])].filter(
      f => !isLocalFont(f),
    );
  const size = paper === 'a4' ? '210mm 297mm' : '8.5in 11in',
    pageTitle = esc(title || 'Document'),
    fontLinks = web
      .map(f => {
        const family = encodeURIComponent(f).replace(/%20/g, '+');
        return `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${family}:ital,wght@0,400;0,700;1,400&display=swap">`;
      })
      .join(''),
    boardFont = dfont ? ` --board-font: "${dfont}", "Figtree", system-ui, sans-serif;` : '',
    css = proseCSS(),
    heading = title ? `<h1 class="doc-title">${esc(title)}</h1>` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${pageTitle}</title>
<link rel="stylesheet" href="__WEB__/fonts.css">${fontLinks}
<style>
@page { size: ${size}; margin: 0.8in 0.85in 0.85in; }   /* browsers use these; the desktop app sets the same margins when it prints */
html, body { margin: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { padding: 0; }
:root { --paper: #ffffff; --paper-ink: #2b2630; --paper-soft: #6b6370;${boardFont} }   /* downloads are always light pages */
.doc-title { margin: 0 0 18px; font: 800 36px/1.1 var(--board-font, "Figtree", system-ui, sans-serif); letter-spacing: -.035em; color: #2b2630; }
${css}
.dv-prose { min-height: 0; }
.dv-prose h1, .dv-prose h2, .dv-prose h3 { break-after: avoid; page-break-after: avoid; }
.dv-prose img, .dv-prose tr, .dv-prose blockquote, .dv-prose pre, .dv-prose li { break-inside: avoid; page-break-inside: avoid; }
.dv-prose p { orphans: 3; widows: 3; }
.dv-prose .keep { break-inside: avoid; page-break-inside: avoid; }
.dv-prose .keep > :first-child { margin-top: 0; } .dv-prose > .keep { margin-top: 1.5em; } .dv-prose > .keep:first-child { margin-top: 0; }
.dv-prose a { color: #b8621a; }
.dv-prose ul[data-type="taskList"] input[type="checkbox"] { pointer-events: none; }
</style></head><body>${heading}<div class="dv-prose">${body}</div></body></html>`;
}
