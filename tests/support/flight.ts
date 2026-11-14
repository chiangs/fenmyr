// Where Myra's slot is, every frame, while she hops into a chat's header, for the tests of her hop.
import assert from 'node:assert';
import type { Page } from 'playwright';
import type { Edges } from './bar.ts';

// ms: since sampling began. onTop: she is what shows at her centre. home: the id of the element her slot sits in.
// air: she is in the air, stretched along her path. anim: the last of her animations to play.
export type Frame = {
  ms: number;
  l: number;
  t: number;
  w: number;
  h: number;
  opacity: number;
  onTop: boolean;
  home: string;
  air: boolean;
  board: string;
  anim: string;
};

export const edges = (page: Page, ids: string[]) =>
  page.evaluate(ids => {
    const out: Record<string, Edges | null> = {};
    for (const id of ids) {
      const el = document.getElementById(id);
      const r = el?.checkVisibility({ opacityProperty: true }) ? el.getBoundingClientRect() : null;
      out[id] = r && { l: r.left, t: r.top, r: r.right, b: r.bottom };
    }
    return out;
  }, ids);

// every frame for 1.6 s from `trigger`; `between` counts the frames more than 3 px from both where she started, unless
// she was hidden there, as on a phone, and where she ended
export async function flight(page: Page, trigger: () => Promise<unknown>) {
  const before = (await edges(page, ['gooSlot'])).gooSlot;
  const frames = page.evaluate(
    () =>
      new Promise<Frame[]>(done => {
        const slot = document.getElementById('gooSlot'),
          seen: Frame[] = [],
          t0 = performance.now();
        const tick = () => {
          const r = slot?.getBoundingClientRect();
          if (slot && r) {
            const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            seen.push({
              ms: performance.now() - t0,
              l: r.left,
              t: r.top,
              w: r.width,
              h: r.height,
              opacity: Number(getComputedStyle(slot).opacity),
              onTop: !!at && slot.contains(at),
              home: slot.parentElement?.id ?? '',
              air: slot.style.transform.includes('rotate'),
              board: window.__fenmyr.curBoard()?.id ?? '',
              anim: window.__fenmyr.lastAnimName(),
            });
          }
          if (performance.now() - t0 < 1600) requestAnimationFrame(tick);
          else done(seen);
        };
        requestAnimationFrame(tick);
      }),
  );
  await trigger();
  const seen = await frames,
    after = (await edges(page, ['gooSlot'])).gooSlot;
  assert.ok(after, 'her slot shows once she has moved');
  const off = (f: Frame, q?: Edges | null) => !q || Math.hypot(f.l - q.l, f.t - q.t) > 3;
  return { before, after, frames: seen, between: seen.filter(f => off(f, before) && off(f, after)).length };
}
