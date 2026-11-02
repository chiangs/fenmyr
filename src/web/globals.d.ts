import type { TestHooks } from './app/testHooks.ts';
import type { FenmyrApi } from './bridge.ts';
import type { Goo as makeGoo } from './goo.ts';
import type { Phone } from './platform/phone.ts';
import type { TimerLine } from './features/timer.ts';

declare global {
  function Icon(name: string, opts?: { size?: number; cls?: string; title?: string }): string;
  function hydrateIcons(root?: ParentNode): void;
  function iconKnown(name: string): boolean;
  function iconList(): { name: string; kw: string }[];
  interface Window {
    __boardsChanged?: () => unknown;
    __fenmyr: TestHooks;
    // set from the Myra setting: calm keeps her still, muted (calmest) also softens her colours
    myraCalm?: boolean;
    myraMuted?: boolean;
    // what Myra is called, if someone renamed her
    myraName?: string;
    Goo: typeof makeGoo;
    __phone?: Phone;
    // tests stand in for the model's timer lines
    __timerLineStub?: ((kind: 'warn' | 'done', t: unknown) => Promise<TimerLine>) | null;
    Fenmyr: FenmyrApi;
  }
  const Fenmyr: FenmyrApi;
  const Goo: typeof makeGoo;
}
