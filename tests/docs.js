// The docs editor: a doc keeps every kind of formatting through save and reload, the toolbar and bubble menu work,
// markdown shortcuts work, and a doc downloads as Word and as PDF-ready HTML.
//   xvfb-run -a node tests/docs.js
const { _electron: electron } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');

const T = (text, marks) => ({ type: 'text', text, ...(marks ? { marks } : {}) });
const P = (...c) => ({ type: 'paragraph', content: c });
// one of everything a doc can hold, written the way saved docs are
const DOC = { type: 'doc', content: [
  { type: 'heading', attrs: { level: 1 }, content: [T('A big title')] },
  P(T('Bold', [{ type: 'bold' }]), T(' italic', [{ type: 'italic' }]), T(' underline', [{ type: 'underline' }]), T(' strike', [{ type: 'strike' }]), T(' code', [{ type: 'code' }]),
    T(' red', [{ type: 'textStyle', attrs: { color: '#c0392b' } }]), T(' marked', [{ type: 'highlight', attrs: { color: '#fff3a0' } }]),
    T(' sized', [{ type: 'textStyle', attrs: { fontSize: '24px' } }]), T(' serif', [{ type: 'textStyle', attrs: { fontFamily: '"Georgia"' } }]),
    T(' link', [{ type: 'link', attrs: { href: 'https://example.com' } }]), T('x', [{ type: 'subscript' }]), T('2', [{ type: 'superscript' }])),
  { type: 'paragraph', attrs: { textAlign: 'center', lineHeight: '1.5', kind: 'lead' }, content: [T('Centered, spaced, a lead paragraph')] },
  { type: 'bulletList', content: [{ type: 'listItem', content: [P(T('one'))] }, { type: 'listItem', content: [P(T('two'))] }] },
  { type: 'orderedList', content: [{ type: 'listItem', content: [P(T('first'))] }, { type: 'listItem', content: [P(T('second'))] }] },
  { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [P(T('done'))] }, { type: 'taskItem', attrs: { checked: false }, content: [P(T('todo'))] }] },
  { type: 'blockquote', content: [P(T('a quote'))] },
  { type: 'codeBlock', content: [T('let a = 1')] },
  { type: 'horizontalRule' },
  { type: 'table', content: [
    { type: 'tableRow', content: [{ type: 'tableHeader', content: [P(T('H1'))] }, { type: 'tableHeader', content: [P(T('H2'))] }] },
    { type: 'tableRow', content: [{ type: 'tableCell', content: [P(T('a'))] }, { type: 'tableCell', content: [P(T('b'))] }] }] },
  { type: 'image', attrs: { src: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==' } },
] };

(async () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'fenmyr-docs-')), out = path.join(data, 'out'); fs.mkdirSync(out);
  const app = await electron.launch({ args: [path.join(__dirname, '..'), '--no-sandbox'], env: { ...process.env, XDG_DATA_HOME: data, HOME: data, XDG_STATE_HOME: path.join(data, 'state') } });
  const page = await app.firstWindow(); const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => m.type() === 'error' && !/fonts\.(googleapis|gstatic)\.com/.test(m.location().url || '') && errors.push(m.text()));
  await page.waitForFunction(() => window.Fenmyr && document.querySelector('#tools')); await page.waitForTimeout(800);
  const skip = page.getByText('Skip setup'); if (await skip.count()) { await skip.click(); await page.waitForTimeout(500); await page.keyboard.press('Escape'); }
  const r = {};
  // a doc card, opened
  await page.click('#tools [data-add="doc"]'); await page.mouse.click(620, 400); await page.waitForTimeout(500); await page.keyboard.press('Escape');
  await page.locator('.card.doc').first().dblclick(); await page.waitForSelector('.dv-prose', { timeout: 8000 }); await page.waitForTimeout(500);
  r.editorLoaded = await page.evaluate(() => !!document.querySelector('.dv-prose').editor);
  // every kind of content survives being loaded and read back
  const round = await page.evaluate(doc => { const ed = document.querySelector('.dv-prose').editor; ed.commands.setContent(doc); const j = ed.getJSON(), h = ed.getHTML(), types = new Set(), marks = new Set();
    (function walk(n) { types.add(n.type); (n.marks || []).forEach(m => marks.add(m.type)); (n.content || []).forEach(walk); })(j);
    return { types: [...types].sort(), marks: [...marks].sort(), html: h, text: ed.getText(), kind: j.content[2].attrs.kind, align: j.content[2].attrs.textAlign, lh: j.content[2].attrs.lineHeight, checked: j.content[5].content[0].attrs.checked }; }, DOC);
  r.types = round.types; r.marks = round.marks;
  const needTypes = ['blockquote', 'bulletList', 'codeBlock', 'heading', 'horizontalRule', 'image', 'listItem', 'orderedList', 'paragraph', 'table', 'tableCell', 'tableHeader', 'tableRow', 'taskItem', 'taskList'];
  const needMarks = ['bold', 'code', 'highlight', 'italic', 'link', 'strike', 'subscript', 'superscript', 'textStyle', 'underline'];
  r.typesOk = needTypes.every(t => round.types.includes(t)); r.marksOk = needMarks.every(t => round.marks.includes(t));
  r.attrsOk = round.kind === 'lead' && round.align === 'center' && round.lh === '1.5' && round.checked === true;
  // the custom cursor hands over to the system's text cursor over everything you can type in, not just the editor's edges (issue #35)
  { const q = page.locator('.dv-prose p').first(); const b = await q.boundingBox(); await page.mouse.move(b.x + 20, b.y + b.height / 2); await page.waitForTimeout(150);
    r.docCursor = await page.evaluate(() => { const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2); const p = document.querySelector('.dv-prose p'); return getComputedStyle(p).cursor === 'text' && getComputedStyle(document.querySelector('.dv-prose')).cursor === 'text'; }); }
  r.htmlOk = /color: ?(#c0392b|rgb\(192, 57, 43\))/i.test(round.html) && /font-size: ?24px/.test(round.html) && /Georgia/.test(round.html) && /<a [^>]*href="https:\/\/example.com"/.test(round.html) && /<th/.test(round.html) && /<mark/.test(round.html);
  // typing: markdown shortcuts and the toolbar
  await page.evaluate(() => document.querySelector('.dv-prose').editor.commands.clearContent()); await page.click('.dv-prose'); await page.waitForTimeout(200);
  await page.keyboard.type('# Heading one\n'); await page.keyboard.type('- bullet a\nbullet b\n\n'); await page.keyboard.type('1. step\nstep two\n\n'); await page.keyboard.type('plain **bold** and _italic_ text');
  r.typed = await page.evaluate(() => { const h = document.querySelector('.dv-prose').editor.getHTML(); return { h1: /<h1[^>]*>Heading one/.test(h), ul: /<ul>/.test(h), ol: /<ol>/.test(h), bold: /<strong>bold<\/strong>/.test(h), em: /<em>italic<\/em>/.test(h) }; });
  // select a word: the floating bar shows; Ctrl+B toggles bold; undo brings it back
  await page.keyboard.press('Control+a'); await page.waitForTimeout(500);
  // ...it stays inside the window, over the selection (a select-all that runs off the top tucks it below)
  const bubbleBox = () => page.evaluate(() => { const b = document.getElementById('dvBubble'), rc = b.getBoundingClientRect(), sr = getSelection().getRangeAt(0).getBoundingClientRect(), cx = (sr.left + sr.right) / 2;
    return { shown: getComputedStyle(b).display !== 'none' && rc.width > 40 && rc.height > 10, inside: rc.left >= 0 && rc.right <= innerWidth && rc.top >= 0 && rc.bottom <= innerHeight, centered: Math.abs(rc.left + rc.width / 2 - cx) < 260, above: rc.bottom <= sr.top && sr.top - rc.bottom < 40 }; });
  const all = await bubbleBox(); r.bubble = all.shown && all.inside && all.centered;
  // a few words in the middle of a visible line: the bar sits right above them
  await page.evaluate(() => { const ed = document.querySelector('.dv-prose').editor; ed.commands.setTextSelection({ from: ed.state.doc.content.size - 8, to: ed.state.doc.content.size - 2 }); }); await page.waitForTimeout(500);
  const few = await bubbleBox(); r.bubbleAbove = few.shown && few.inside && few.centered && few.above;
  await page.keyboard.press('Control+a'); await page.waitForTimeout(300);
  await page.keyboard.press('Control+b'); await page.waitForTimeout(200);
  r.boldOn = await page.evaluate(() => document.querySelector('.dv-prose').editor.isActive('bold'));
  await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
  r.undo = await page.evaluate(() => !document.querySelector('.dv-prose').editor.isActive('bold'));
  // the toolbar's bold button
  await page.click('#dvTools [data-c="bold"]'); await page.waitForTimeout(200);
  r.toolbarBold = await page.evaluate(() => document.querySelector('.dv-prose').editor.isActive('bold'));
  // a table from the editor's own command, and the character count
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Control+End');   // put the cursor at the end (the select-all above covered everything)
  r.table = await page.evaluate(() => { const ed = document.querySelector('.dv-prose').editor, words = ed.storage.characterCount.words(); ed.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run(); return /<table/.test(ed.getHTML()) && words > 3; });
  // a doc downloads as Word (a real .docx), including the full sample
  r.docx = await page.evaluate(async doc => { if (!window.FenmyrDocx) await new Promise(res => { const sc = document.createElement('script'); sc.src = 'vendor/docx.js'; sc.onload = res; document.body.appendChild(sc); }); const bytes = await FenmyrDocx.toDocx(doc, { title: 'Sample', paper: 'letter' }); return { size: bytes.length, zip: bytes[0] === 0x50 && bytes[1] === 0x4b }; }, DOC);
  // save and reload: the doc comes back the same
  await page.evaluate(doc => document.querySelector('.dv-prose').editor.commands.setContent(doc), DOC); await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(out, 'doc.png') });
  r.errors = errors;
  console.log(JSON.stringify(r, null, 1));
  await app.close();
  const ok = r.editorLoaded && r.docCursor && r.typesOk && r.marksOk && r.attrsOk && r.htmlOk && Object.values(r.typed).every(Boolean) && r.bubble && r.bubbleAbove && r.boldOn && r.undo && r.toolbarBold && r.table && r.docx.zip && r.docx.size > 5000 && !errors.length;
  if (process.env.KEEP) console.log('output in', out); else fs.rmSync(data, { recursive: true, force: true });
  console.log(ok ? 'DOCS OK' : 'DOCS FAILED'); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
