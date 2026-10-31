import type { Board, StoredBoard } from '../shared/model.ts';
import type { BoardSummary } from '../shared/ops.ts';

// window.Fenmyr, set up by bridge.ts. Each module adds the methods it uses as it gets typed.
declare global {
  function Icon(name: string, opts?: { size?: number; cls?: string }): string;
  interface Window {
    __boardsChanged?: () => unknown;
  }
  const Fenmyr: {
    native: boolean;
    fetchImage(url: string): Promise<string>;
    saveTemplate(t: unknown): Promise<unknown>;
    list(): Promise<BoardSummary[]>;
    load(id: string): Promise<StoredBoard | null>;
    save(board: Board | StoredBoard): Promise<unknown>;
    remove(id: string): Promise<unknown>;
    folders(): Promise<unknown>;
    saveFolders(library: unknown): Promise<unknown>;
  };
}
