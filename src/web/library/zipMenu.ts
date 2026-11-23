import { appState } from '../core/state.ts';
import type { Kind } from './rowMenu.ts';
import { exportZip } from './zipExport.ts';
import { importZip } from './zipImport.ts';

const OUT = '<button data-m="zipOut">Export as zip…</button>';
const IN = '<button data-m="zipIn">Import a zip here…</button>';

// The zip entries of a row's menu: any row is exported, and a folder or project is also where a zip is imported to.
export const zipMenu = (kind: Kind) => (kind === 'board' ? OUT : OUT + IN);

export function zipAction(a: string, kind: Kind, row: { id: string }): Promise<void> | null {
  if (a === 'zipOut') return exportZip(kind, row.id);
  if (a !== 'zipIn') return null;
  const folder = kind === 'folder' ? appState.folders.find(f => f.id === row.id) : undefined;
  return importZip(
    { project: folder ? (folder.project ?? null) : row.id, folder: folder?.id ?? null },
    undefined,
    true,
  );
}
