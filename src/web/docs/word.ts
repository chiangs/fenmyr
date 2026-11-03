import { $ } from '../core/dom.ts';
import { say } from '../settings/licenses.ts';
import { docHTML } from './docText.ts';
import { docCard, ed, editorBundle, syncDoc } from './editor.ts';
import { docPrintHTML } from './pdf.ts';
import { fitTools } from './toolbar.ts';

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));
const paperSize = () => {
  try {
    return localStorage.getItem('fenmyr:paper') === 'a4' ? 'a4' : 'letter';
  } catch {
    return 'letter';
  }
};

// ---------- a doc as a Word file: real headings, lists, tables and pictures, with Figtree built in ----------
let docxLoading: Promise<unknown> | null = null;

const loadDocx = () =>
  docxLoading ||
  (docxLoading = new Promise((res, rej) => {
    if (window.FenmyrDocx) return res(true);
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
  const paper = paperSize(),
    doc = docCard;
  $('dvSaved').textContent = 'making your Word file…';
  try {
    await loadDocx();
    const docx = window.FenmyrDocx;
    if (!docx) throw new Error("the Word maker didn't load");
    const bundle = editorBundle(),
      bytes = await docx.toDocx(ed ? ed.getJSON() : doc.doc || bundle.generateJSON(docHTML(doc), bundle.extensions()), {
        title: (doc.text || '').trim(),
        paper,
      });
    let b64 = '';
    for (let i = 0; i < bytes.length; i += 0x8000) b64 += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    b64 = btoa(b64);
    const name = await Fenmyr.saveFile(b64, (doc.text || 'Document').trim() || 'Document', 'docx');
    if (name) say(`Saved “${name}” ✦`, 5000);
  } catch (err) {
    say(`I couldn't make the Word file: ${messageOf(err)}`, 8000);
  } finally {
    $('dvSaved').textContent = '';
  }
}

export async function downloadPDF() {
  if (!docCard) return;
  syncDoc();
  const paper = paperSize();
  $('dvSaved').textContent = 'making your PDF…';
  try {
    const name = await Fenmyr.docPDF(docPrintHTML(paper), (docCard.text || 'Document').trim() || 'Document', paper);
    if (name) say(`Saved “${name}” ✦`, 5000);
  } catch (err) {
    say(`I couldn't make the PDF: ${messageOf(err)}`, 8000);
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
