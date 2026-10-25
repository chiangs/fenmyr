// Getting things out of Myra: a picture or PDF of part of the board, a Word file the page made, and a doc as a paged PDF.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { pathToFileURL } = require('url');
const { BrowserWindow, dialog } = require('electron');
const P = require('./paths');

const clean = (s, d) => String(s || d).replace(/\//g, '-');
const FILTERS = { png: [{ name: 'PNG image', extensions: ['png'] }], pdf: [{ name: 'PDF', extensions: ['pdf'] }], docx: [{ name: 'Word document', extensions: ['docx'] }] };

// ask where to save, then write it; answers with the file's name, or '' if they changed their mind
async function saveAs(win, defaultName, ext, data) {
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(require('os').homedir(), defaultName), filters: FILTERS[ext] || [{ name: ext.toUpperCase(), extensions: [ext] }] });
  if (r.canceled || !r.filePath) return '';
  fs.writeFileSync(r.filePath, typeof data === 'function' ? await data() : data);
  return path.basename(r.filePath);
}

// a crisp PNG of a rectangle of the page. The DevTools protocol can render it above screen resolution (scale 2 = retina-sharp, like the Mac app);
// if that's not available (DevTools open), it falls back to an ordinary capture at the screen's own resolution.
async function snapshot(wc, r, scale) {
  scale = Math.max(1, Math.min(scale || 2, 8000 / Math.max(1, r.width)));
  try {
    if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
    const shot = await wc.debugger.sendCommand('Page.captureScreenshot', { format: 'png', fromSurface: true, clip: { ...r, scale } });
    return Buffer.from(shot.data, 'base64');
  } catch (e) {
    return (await wc.capturePage({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) })).toPNG();
  } finally { try { wc.debugger.detach(); } catch (e) {} }
}

// pages: a PDF made by printing an HTML file in a hidden window
async function htmlToPDF(file, opts) {
  const w = new BrowserWindow({ show: false, width: 900, height: 1200, webPreferences: { offscreen: false, sandbox: true } });
  try {
    await w.loadFile(file);
    // give web fonts and pictures a moment to arrive, then print
    await w.webContents.executeJavaScript('(document.fonts ? document.fonts.ready : Promise.resolve()).then(() => new Promise(r => setTimeout(r, 350)))');
    return await w.webContents.printToPDF(opts);
  } finally { w.destroy(); }
}
const tmpFile = (ext) => path.join(P.support, `print-${crypto.randomUUID()}.${ext}`);

// export what's on screen inside a rectangle as a crisp PNG or a PDF, then let the person pick where to save it
async function exportRect(win, a) {
  const r = { x: +a.x || 0, y: +a.y || 0, width: Math.max(1, +a.w || 1), height: Math.max(1, +a.h || 1) };
  const pdf = !!a.pdf, name = clean(a.name, 'Myra');
  const png = await snapshot(win.webContents, r, +a.scale || 2);
  if (!png || !png.length) throw new Error("I couldn't capture that");
  if (!pdf) return saveAs(win, name + '.png', 'png', png);
  // a one-page PDF the exact size of what was captured (the picture is drawn at 2x or more, so it stays sharp when zoomed)
  return saveAs(win, name + '.pdf', 'pdf', async () => {
    const f = tmpFile('html'), inch = v => v / 96;
    fs.writeFileSync(f, `<!doctype html><style>@page{margin:0}html,body{margin:0}img{display:block;width:${r.width}px;height:${r.height}px}</style><img src="data:image/png;base64,${png.toString('base64')}">`);
    try { return await htmlToPDF(f, { pageSize: { width: inch(r.width), height: inch(r.height) }, margins: { marginType: 'none' }, printBackground: true }); }
    finally { fs.rmSync(f, { force: true }); }
  });
}

// save a file the page made (a Word doc): ask where, then write it
async function saveFile(win, a) {
  if (!a.data) throw new Error('Nothing to save');
  const ext = String(a.ext || 'docx');
  return saveAs(win, clean(a.name, 'Document') + '.' + ext, ext, Buffer.from(a.data, 'base64'));
}

// a doc as a real, paged PDF: ask where to save it, then let Chromium's print engine lay the pages out (proper page breaks, sharp selectable text)
async function docPDF(win, a) {
  const html = String(a.html || ''), a4 = a.paper === 'a4';
  return saveAs(win, clean(a.name, 'Document') + '.pdf', 'pdf', async () => {
    // the doc points at the app's own fonts ("__WEB__/fonts/…"); it loads from a file so it's allowed to read them
    const f = tmpFile('html');
    fs.writeFileSync(f, html.replace(/__WEB__\//g, pathToFileURL(P.web).href + '/'));
    try {
      // about 0.8in top, 0.85in sides and bottom, the same as the Mac app
      return await htmlToPDF(f, { pageSize: a4 ? 'A4' : 'Letter', printBackground: true, margins: { top: 58 / 72, bottom: 61 / 72, left: 61 / 72, right: 61 / 72 } });
    } finally { fs.rmSync(f, { force: true }); }
  });
}

module.exports = { exportRect, saveFile, docPDF };
