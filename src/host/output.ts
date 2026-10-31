// Getting things out of Fenmyr: a picture or PDF of part of the board, a Word file the page made, and a doc as a paged PDF.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, dialog, type PrintToPDFOptions, type WebContents } from 'electron';
import type { Ops } from '../shared/ops.ts';
import P from './paths.ts';
import { isRecord, text, type Untrusted } from './util.ts';

type Rect = { x: number; y: number; width: number; height: number };

const clean = (s: unknown, fallback: string) => (text(s) || fallback).replace(/\//g, '-');
const FILTERS: Record<string, { name: string; extensions: string[] }[]> = {
  png: [{ name: 'PNG image', extensions: ['png'] }],
  pdf: [{ name: 'PDF', extensions: ['pdf'] }],
  docx: [{ name: 'Word document', extensions: ['docx'] }],
};

// answers with the file's name, or '' if they changed their mind
async function saveAs(win: BrowserWindow, defaultName: string, ext: string, data: Buffer | (() => Promise<Buffer>)) {
  const r = await dialog.showSaveDialog(win, {
    defaultPath: path.join(os.homedir(), defaultName),
    filters: FILTERS[ext] ?? [{ name: ext.toUpperCase(), extensions: [ext] }],
  });
  if (r.canceled || !r.filePath) return '';
  fs.writeFileSync(r.filePath, typeof data === 'function' ? await data() : data);
  return path.basename(r.filePath);
}

// The DevTools protocol renders above screen resolution; with DevTools open it is taken, so this falls back to an ordinary capture.
async function snapshot(wc: WebContents, r: Rect, wanted: number) {
  const scale = Math.max(1, Math.min(wanted || 2, 8000 / Math.max(1, r.width)));
  try {
    if (!wc.debugger.isAttached()) wc.debugger.attach('1.3');
    const shot: unknown = await wc.debugger.sendCommand('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      clip: { ...r, scale },
    });
    return Buffer.from(isRecord(shot) ? text(shot.data) : '', 'base64');
  } catch {
    const area = {
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
    return (await wc.capturePage(area)).toPNG();
  } finally {
    try {
      wc.debugger.detach();
    } catch {}
  }
}

async function htmlToPDF(file: string, opts: PrintToPDFOptions) {
  const w = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: { offscreen: false, sandbox: true },
  });
  try {
    await w.loadFile(file);
    // give web fonts and pictures a moment to arrive, then print
    await w.webContents.executeJavaScript(
      '(document.fonts ? document.fonts.ready : Promise.resolve()).then(() => new Promise(r => setTimeout(r, 350)))',
    );
    return await w.webContents.printToPDF(opts);
  } finally {
    w.destroy();
  }
}
const tmpFile = (ext: string) => path.join(P.support, `print-${crypto.randomUUID()}.${ext}`);

export async function exportRect(win: BrowserWindow, a: Untrusted<Ops['export']['args']>) {
  const r: Rect = {
    x: Number(a.x) || 0,
    y: Number(a.y) || 0,
    width: Math.max(1, Number(a.w) || 1),
    height: Math.max(1, Number(a.h) || 1),
  };
  const name = clean(a.name, 'Fenmyr');
  const png = await snapshot(win.webContents, r, Number(a.scale) || 2);
  if (!png?.length) throw new Error("I couldn't capture that");
  if (!a.pdf) return saveAs(win, `${name}.png`, 'png', png);
  // a one-page PDF the exact size of what was captured (the picture is drawn at 2x or more, so it stays sharp when zoomed)
  return saveAs(win, `${name}.pdf`, 'pdf', async () => {
    const f = tmpFile('html');
    const inch = (v: number) => v / 96;
    const picture = png.toString('base64');
    fs.writeFileSync(
      f,
      `<!doctype html><style>@page{margin:0}html,body{margin:0}img{display:block;width:${r.width}px;height:${r.height}px}</style><img src="data:image/png;base64,${picture}">`,
    );
    try {
      return await htmlToPDF(f, {
        pageSize: { width: inch(r.width), height: inch(r.height) },
        printBackground: true,
      });
    } finally {
      fs.rmSync(f, { force: true });
    }
  });
}

export async function saveFile(win: BrowserWindow, a: Untrusted<Ops['saveFile']['args']>) {
  if (!a.data) throw new Error('Nothing to save');
  const ext = text(a.ext) || 'docx';
  return saveAs(win, `${clean(a.name, 'Document')}.${ext}`, ext, Buffer.from(text(a.data), 'base64'));
}

// a doc as a real, paged PDF: Chromium's print engine lays the pages out (proper page breaks, sharp selectable text)
export async function docPDF(win: BrowserWindow, a: Untrusted<Ops['docPDF']['args']>) {
  const webFolder = pathToFileURL(path.join(app.getAppPath(), 'web')).href;
  return saveAs(win, `${clean(a.name, 'Document')}.pdf`, 'pdf', async () => {
    // the doc points at the app's own fonts ("__WEB__/fonts/…"); it loads from a file so it's allowed to read them
    const f = tmpFile('html');
    fs.writeFileSync(f, text(a.html).replace(/__WEB__\//g, `${webFolder}/`));
    try {
      return await htmlToPDF(f, {
        pageSize: a.paper === 'a4' ? 'A4' : 'Letter',
        printBackground: true,
        margins: { top: 58 / 72, bottom: 61 / 72, left: 61 / 72, right: 61 / 72 },
      });
    } finally {
      fs.rmSync(f, { force: true });
    }
  });
}
