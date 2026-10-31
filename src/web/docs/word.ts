// @ts-nocheck
import { $ } from '../core/dom.ts';
import { docCard, docHTML, ed, syncDoc } from './editor.ts';
import { docPrintHTML } from './pdf.ts';
import { fitTools } from './toolbar.ts';
import { say } from '../settings/licenses.ts';

// ---------- a doc as a Word file: real headings, lists, tables and pictures, with Figtree built in ----------
let docxLoading = null;

const loadDocx = () =>
  docxLoading ||
  (docxLoading = new Promise((res, rej) => {
    if (window.FenmyrDocx) return res();
    const sc = document.createElement('script');
    sc.src = 'vendor/docx.js';
    sc.onload = res;
    sc.onerror = () => {
      docxLoading = null;
      rej(new Error("the Word maker didn't load"));
    };
    document.head.appendChild(sc);
  }));

export async function downloadWord() {
  if (!docCard) return;
  syncDoc();
  const paper = (() => {
    try {
      return localStorage.getItem('fenmyr:paper') || 'letter';
    } catch (e) {
      return 'letter';
    }
  })();
  $('dvSaved').textContent = 'making your Word file…';
  try {
    await loadDocx();
    const bytes = await FenmyrDocx.toDocx(
      ed ? ed.getJSON() : docCard.doc || FenmyrEditor.generateJSON(docHTML(docCard), FenmyrEditor.extensions()),
      { title: (docCard.text || '').trim(), paper },
    );
    let b64 = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
      b64 += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    b64 = btoa(b64);
    const name = await Fenmyr.saveFile(b64, (docCard.text || 'Document').trim() || 'Document', 'docx');
    if (name) say(`Saved “${name}” ✦`, 5000);
  } catch (err) {
    say("I couldn't make the Word file: " + err.message, 8000);
  } finally {
    $('dvSaved').textContent = '';
  }
}

export async function downloadPDF() {
  if (!docCard) return;
  syncDoc();
  const paper = (() => {
    try {
      return localStorage.getItem('fenmyr:paper') || 'letter';
    } catch (e) {
      return 'letter';
    }
  })();
  $('dvSaved').textContent = 'making your PDF…';
  try {
    const name = await Fenmyr.docPDF(docPrintHTML(paper), (docCard.text || 'Document').trim() || 'Document', paper);
    if (name) say(`Saved “${name}” ✦`, 5000);
  } catch (err) {
    say("I couldn't make the PDF: " + err.message, 8000);
  } finally {
    $('dvSaved').textContent = '';
  }
}
export function init54() {
  $('dvWide').onclick = () => {
    const w = $('docview').classList.toggle('wide');
    requestAnimationFrame(fitTools);
    $('dvWide').textContent = w ? '⤡' : '⤢';
    $('dvWide').title = w ? 'Half page' : 'Full page';
  };
}
