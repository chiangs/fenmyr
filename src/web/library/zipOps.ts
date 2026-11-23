import { buildZip, type ImportResult, REFUSALS, readImport, readZip, relinkMedia } from '../../shared/fenmyrZip.ts';
import type { Ops } from '../../shared/ops.ts';
import { call } from '../hostCall.ts';

// Saving a Fenmyr zip and opening one. The desktop app's host streams both, videos included. A browser keeps its videos in
// IndexedDB and can't write to a folder, so it builds and reads the zip in the page, without videos.
const asImport = (reply: unknown): ImportResult | null => {
  if (reply === null) return null;
  const read = readImport(reply);
  if (!read) throw new Error(REFUSALS.notZip);
  return read;
};

export const zipOps = {
  zipExport: (a: Ops['zipExport']['args']) => call('zipExport', a),
  // a dropped file has a path on this computer; with none, the host asks for one
  zipImport: async (file?: File) => {
    const path = file ? window.fenmyrHost?.pathOf?.(file) : '';
    if (file && !path) throw new Error("I couldn't reach that file.");
    return asImport(await call('zipImport', path ? { path } : {}));
  },
};

const chooseFile = () =>
  new Promise<File | null>(res => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,application/zip';
    input.onchange = () => res(input.files?.[0] ?? null);
    input.oncancel = () => res(null);
    input.click();
  });

export const zipFallbacks: typeof zipOps = {
  async zipExport(a) {
    const name = `${a.name.replace(/[/\0]/g, '-') || 'Fenmyr'}.fenmyr.zip`,
      link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([buildZip(a.manifest, a.boards)], { type: 'application/zip' }));
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 4000);
    return name;
  },
  async zipImport(file) {
    const chosen = file ?? (await chooseFile());
    if (!chosen) return null;
    const bytes = await chosen.arrayBuffer().catch(() => {
      throw new Error(REFUSALS.tooBig);
    });
    const read = readZip(new Uint8Array(bytes));
    if (!read.ok) throw new Error(REFUSALS[read.refusal]);
    // its videos are not read here: their cards are kept, marked, and counted
    const linked = relinkMedia(read.value.boards, new Map());
    return { ...read.value, boards: linked.boards, missing: linked.missing };
  },
};
