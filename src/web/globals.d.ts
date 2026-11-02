import type { TestHooks } from './app/testHooks.ts';
import type { FenmyrApi } from './bridge.ts';

declare global {
  function Icon(name: string, opts?: { size?: number; cls?: string; title?: string }): string;
  function hydrateIcons(root?: ParentNode): void;
  function iconKnown(name: string): boolean;
  function iconList(): { name: string; kw: string }[];
  interface Window {
    __boardsChanged?: () => unknown;
    __fenmyr: TestHooks;
    Fenmyr: FenmyrApi;
  }
  const Fenmyr: FenmyrApi;
}
