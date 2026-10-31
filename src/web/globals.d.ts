import type { Board } from '../shared/model.ts';

// window.Fenmyr, set up by bridge.ts. Each module adds the methods it uses as it gets typed.
declare global {
  const Fenmyr: { save(board: Board): Promise<unknown> };
}
