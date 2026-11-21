// A test reads a box or a colour only once the page has stopped moving. A sleep guesses how long motion takes and how
// late it starts; a loaded runner breaks both guesses, and FENMYR_MOTION_DELAY (node tools/run-tests.ts --lag 50)
// breaks them on purpose.
import type { Page } from 'playwright';

type Motion = { target: string; kind: 'transition' | 'animation'; property: string };
export type Rect = { x: number; y: number; width: number; height: number };
type Settled = { moving: Motion[]; fontsLoaded: boolean };

const SHOWN = 6;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function parseMotion(v: unknown): Motion | null {
  if (!isRecord(v)) return null;
  const { target, kind, property } = v;
  if (typeof target !== 'string' || typeof property !== 'string') return null;
  return kind === 'transition' || kind === 'animation' ? { target, kind, property } : null;
}

function parseSettled(v: unknown): Settled {
  if (!isRecord(v) || !Array.isArray(v.moving) || typeof v.fontsLoaded !== 'boolean')
    throw new Error(`still: the page answered ${JSON.stringify(v)}, not what it was asked for`);
  return { moving: v.moving.flatMap(m => parseMotion(m) ?? []), fontsLoaded: v.fontsLoaded };
}

function parseRect(v: unknown): Rect | null {
  if (!isRecord(v)) return null;
  const { x, y, width, height } = v;
  return typeof x === 'number' && typeof y === 'number' && typeof width === 'number' && typeof height === 'number'
    ? { x, y, width, height }
    : null;
}

function describeUnsettled({ moving, fontsLoaded }: Settled): string {
  const named = moving.slice(0, SHOWN).map(m => `${m.target} ${m.kind} of ${m.property}`);
  if (moving.length > SHOWN) named.push(`and ${moving.length - SHOWN} more`);
  if (!fontsLoaded) named.push('fonts still loading');
  return named.join(', ');
}

// Runs in the page, so it can't use anything from this file. Settled means two frames in a row with no finite animation
// or transition running or waiting out its delay: one that ends can start the next from its transitionend, so a
// single empty look is not enough.
async function untilStill(timeout: number): Promise<unknown> {
  const frame = () => new Promise<void>(done => requestAnimationFrame(() => done()));
  const name = (e: Element, pseudo: string | null) =>
    `${e.localName}${e.id ? `#${e.id}` : ''}${[...e.classList].map(c => `.${c}`).join('')}${pseudo ?? ''}`;
  const look = () =>
    document.getAnimations().flatMap(a => {
      const effect = a.effect;
      if (a.playState !== 'running' || !effect || !Number.isFinite(effect.getComputedTiming().endTime)) return [];
      const target =
        effect instanceof KeyframeEffect && effect.target ? name(effect.target, effect.pseudoElement) : '?';
      if (a instanceof CSSTransition) return [{ target, kind: 'transition', property: a.transitionProperty }];
      return [
        { target, kind: 'animation', property: a instanceof CSSAnimation ? a.animationName : a.id || 'animate()' },
      ];
    });
  const end = performance.now() + timeout;
  let quiet = 0;
  // a class change takes effect, and its transition is created, at the next style recalculation, and the page often
  // queues the change itself a frame or two ahead
  await frame();
  for (;;) {
    const moving = look();
    const fontsLoaded = document.fonts.status === 'loaded';
    quiet = moving.length === 0 && fontsLoaded ? quiet + 1 : 0;
    if (quiet >= 2 || performance.now() > end) return { moving, fontsLoaded };
    await frame();
  }
}

export async function still(page: Page, { timeout = 5000 }: { timeout?: number } = {}): Promise<void> {
  const settled = parseSettled(await page.evaluate<unknown, number>(untilStill, timeout));
  if (settled.moving.length === 0 && settled.fontsLoaded) return;
  throw new Error(`the page was still moving after ${timeout} ms: ${describeUnsettled(settled)}`);
}

export async function rect(page: Page, selector: string): Promise<Rect> {
  await still(page);
  const box = parseRect(
    await page.evaluate<unknown, string>(sel => {
      const e = document.querySelector(sel);
      if (!e) return null;
      const { x, y, width, height } = e.getBoundingClientRect();
      return { x, y, width, height };
    }, selector),
  );
  if (!box) throw new Error(`rect: nothing on the page matches ${selector}`);
  return box;
}
