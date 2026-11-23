import type { Kind } from './rowMenu.ts';
import { exportBoardZip } from './zipExport.ts';

// The zip entries of a row's menu: a board is exported.
export const zipMenu = (kind: Kind) => (kind === 'board' ? '<button data-m="zipOut">Export as zip…</button>' : '');

export const zipAction = (a: string, _kind: Kind, row: { id: string }): Promise<void> | null =>
  a === 'zipOut' ? exportBoardZip(row.id) : null;
