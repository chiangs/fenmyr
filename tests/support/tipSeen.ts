// A tooltip, seen the way a person sees it: the ::after of a control with a data-tip, once shown by hover or keyboard
// focus, measured in the real app. seen() checks its look, its place against the control, its surface's colours, its
// delay, and that it is whole: inside the window and not cut by anything it sits in.
// With TIPS_SHOTS=<folder> it also saves a picture of each tooltip given a `shot` name.
import assert from 'node:assert';
import fs from 'node:fs';
import type { Page } from 'playwright';
import { still } from './settled.ts';

type Box = { x: number; y: number; width: number; height: number };
type At = 'below' | 'below-end' | 'above' | 'above-end';
type Colours = { bg: string; ink: string };
type Tip = {
  text: string;
  // how much the board has scaled the control: its gap is 8 px before that
  scale: number;
  opacity: number;
  host: Box;
  tip: Box;
  look: { padding: string; fontSize: number; fontWeight: string; whiteSpace: string };
  delay: string;
  clippedBy: string[];
  window: { width: number; height: number };
  paintsLike: { bg: boolean; ink: boolean };
};

// what each surface asks for, as CSS the page can paint: the dark values are the ones these surfaces had before the tooltip
// was shared, so a surface that lost its colours falls back to --ink and shows the difference in dark
const SURFACE = {
  toolbar: { bg: 'var(--m-tools-button-after-bg)', ink: 'var(--m-tools-button-after-ink)' },
  doc: { bg: 'var(--m-dt-myra-bg)', ink: 'var(--ink-inverse)' },
  gear: { bg: 'var(--m-gear-tip-bg)', ink: 'color-mix(in oklab, var(--accent-wash) 8%, var(--surface))' },
  video: { bg: 'var(--ink)', ink: 'var(--snow)' },
  chat: { bg: 'var(--ink)', ink: 'var(--ink-inverse)' },
} satisfies Record<string, Colours>;
type Surface = keyof typeof SURFACE;

// the gap between a control and its tooltip, the same for all of them
const GAP = 8;
const SHOTS = process.env.TIPS_SHOTS;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

// Runs in the page. The tooltip is the ::after of its control, which has no box to ask for, so its box is worked out from
// what the browser computes for it, then checked against each ancestor that would cut it: one with overflow, clip-path or
// paint containment that the tooltip's containing-block chain passes through.
function readTip([selector, want]: [string, Colours]): Tip | null {
  const host = document.querySelector<HTMLElement>(selector);
  if (!host) return null;
  const px = (v: string) => Number.parseFloat(v) || 0;
  const cs = getComputedStyle(host, '::after');
  const at = host.getBoundingClientRect();
  const k = host.offsetWidth ? at.width / host.offsetWidth : 1;
  const [padX, padY] = [px(cs.paddingLeft) + px(cs.paddingRight), px(cs.paddingTop) + px(cs.paddingBottom)];
  const own = cs.boxSizing === 'border-box';
  const width = (px(cs.width) + (own ? 0 : padX)) * k,
    height = (px(cs.height) + (own ? 0 : padY)) * k;
  const [tx = '0px', ty = '0px'] = cs.translate === 'none' ? [] : cs.translate.split(' ');
  const move = (t: string, size: number) => (t.endsWith('%') ? (px(t) / 100) * size : px(t) * k);
  const tip = {
    x: at.left + (host.clientLeft + px(cs.left)) * k + move(tx, width),
    y: at.top + (host.clientTop + px(cs.top)) * k + move(ty, height),
    width,
    height,
  };
  const name = (e: Element) => `${e.localName}${e.id ? `#${e.id}` : ''}${[...e.classList].map(c => `.${c}`).join('')}`;
  const cuts = (s: CSSStyleDeclaration) =>
    s.overflowX !== 'visible' ||
    s.overflowY !== 'visible' ||
    s.clipPath !== 'none' ||
    /\b(paint|strict|content)\b/.test(s.contain);
  const holds = (s: CSSStyleDeclaration) =>
    s.position !== 'static' ||
    s.transform !== 'none' ||
    s.filter !== 'none' ||
    s.perspective !== 'none' ||
    s.containerType !== 'normal' ||
    /\b(layout|paint|strict|content)\b/.test(s.contain);
  const blockOf = (e: HTMLElement): HTMLElement | null => {
    const where = getComputedStyle(e).position;
    if (where === 'fixed') return null;
    if (where !== 'absolute') return e.parentElement;
    for (let a = e.parentElement; a; a = a.parentElement) if (holds(getComputedStyle(a))) return a;
    return null;
  };
  const clippedBy: string[] = [];
  for (let a: HTMLElement | null = host; a; a = blockOf(a)) {
    if (!cuts(getComputedStyle(a))) continue;
    const r = a.getBoundingClientRect(),
      s = a.offsetWidth ? r.width / a.offsetWidth : 1,
      left = r.left + a.clientLeft * s,
      top = r.top + a.clientTop * s,
      right = left + a.clientWidth * s,
      bottom = top + a.clientHeight * s;
    if (tip.x < left - 0.5 || tip.y < top - 0.5 || tip.x + tip.width > right + 0.5 || tip.y + tip.height > bottom + 0.5)
      clippedBy.push(name(a));
  }
  // what the surface asks for, painted by a stand-in beside it, so a colour mix compares as the browser computes it
  const probe = document.createElement('i');
  probe.style.cssText = `position:absolute;visibility:hidden;background-color:${want.bg};color:${want.ink}`;
  host.append(probe);
  const wanted = getComputedStyle(probe);
  const paintsLike = { bg: cs.backgroundColor === wanted.backgroundColor, ink: cs.color === wanted.color };
  probe.remove();
  return {
    text: host.dataset.tip ?? '',
    scale: k,
    opacity: Number(cs.opacity),
    host: { x: at.left, y: at.top, width: at.width, height: at.height },
    tip,
    look: { padding: cs.padding, fontSize: px(cs.fontSize), fontWeight: cs.fontWeight, whiteSpace: cs.whiteSpace },
    delay: cs.transitionDelay,
    clippedBy,
    window: { width: innerWidth, height: innerHeight },
    paintsLike,
  };
}

const right = (b: Box) => b.x + b.width;
const bottom = (b: Box) => b.y + b.height;
const near = (a: number, b: number, what: string, slack = 1) =>
  assert(Math.abs(a - b) <= slack, `${what}: ${a.toFixed(1)} is not ${b.toFixed(1)}`);

export function tipKit(page: Page) {
  // The tooltip as it is once shown: pointed at, or, with `focus`, focused from the keyboard.
  async function shown(selector: string, surface: Surface, focus = false): Promise<Tip> {
    await page.mouse.move(1, 1);
    await page.evaluate(() =>
      document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined,
    );
    if (focus) {
      // a key press first, so the browser counts the focus as the keyboard's and draws it with :focus-visible
      await page.keyboard.press('Shift');
      await page.focus(selector);
    } else await page.hover(selector);
    await still(page);
    const tip = await page.evaluate<Tip | null, [string, Colours]>(readTip, [selector, SURFACE[surface]]);
    assert(tip, `${selector} is on the page`);
    return tip;
  }

  type Seen = { at: At; surface: Surface; delay: string; focus?: boolean; shot?: string };
  // One tooltip whole and in its place: the look every tooltip has, where its data-tip-at puts it, its surface's colours,
  // its delay, and all of it inside the window and uncut.
  async function seen(what: string, selector: string, { at, surface, delay, focus, shot }: Seen) {
    const tip = await shown(selector, surface, focus);
    assert.strictEqual(tip.opacity, 1, `${what}: it shows`);
    assert.deepStrictEqual(
      [tip.look.padding, tip.look.fontWeight, tip.look.whiteSpace],
      ['6px 10px', '600', 'pre-line'],
      `${what}: the shared look`,
    );
    // a video's words scale with its card, from 11 px
    assert(tip.look.fontSize >= 11 && tip.look.fontSize <= 18, `${what}: ${tip.look.fontSize} px text`);
    assert(tip.paintsLike.bg, `${what}: the ${surface} background`);
    assert(tip.paintsLike.ink, `${what}: the ${surface} ink`);
    assert.deepStrictEqual(new Set(tip.delay.split(', ')), new Set([delay]), `${what}: it waits ${delay}`);
    const { host } = tip,
      gap = GAP * tip.scale;
    if (at.startsWith('below')) near(tip.tip.y, bottom(host) + gap, `${what}: ${GAP} px below`, 0.6);
    else near(bottom(tip.tip), host.y - gap, `${what}: ${GAP} px above`, 0.6);
    if (at.endsWith('end')) near(right(tip.tip), right(host), `${what}: right edges level`);
    else near(tip.tip.x + tip.tip.width / 2, host.x + host.width / 2, `${what}: centred`);
    const where = JSON.stringify(tip.tip);
    assert(
      tip.tip.x >= -0.5 &&
        tip.tip.y >= -0.5 &&
        right(tip.tip) <= tip.window.width + 0.5 &&
        bottom(tip.tip) <= tip.window.height + 0.5,
      `${what}: inside the ${tip.window.width} × ${tip.window.height} window: it is at ${where}`,
    );
    assert.deepStrictEqual(tip.clippedBy, [], `${what}: cut by ${tip.clippedBy.join(', ')}: it is at ${where}`);
    if (SHOTS && shot) {
      const x = Math.max(0, Math.min(host.x, tip.tip.x) - 24),
        y = Math.max(0, Math.min(host.y, tip.tip.y) - 24);
      const x2 = Math.min(tip.window.width, Math.max(right(host), right(tip.tip)) + 24),
        y2 = Math.min(tip.window.height, Math.max(bottom(host), bottom(tip.tip)) + 24);
      await page.screenshot({ path: `${SHOTS}/${shot}.png`, clip: { x, y, width: x2 - x, height: y2 - y } });
    }
    return tip;
  }
  return { shown, seen };
}
