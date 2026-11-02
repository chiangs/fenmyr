import { cardsEl } from '../core/dom.ts';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ESCAPES[c] ?? c);

export const cardEl = (id: string): HTMLElement | null => cardsEl.querySelector(`[data-id="${id}"]`);

export const isTyping = (target: EventTarget | null) =>
  target instanceof Element && target.closest('input, textarea, [contenteditable="true"]') !== null;

// Waits a tick so the press that opened the popup doesn't close it.
export function removeOnOutsidePress(popup: Element) {
  setTimeout(() => {
    const onPress = (e: PointerEvent) => {
      if (e.target instanceof Node && popup.contains(e.target)) return;
      popup.remove();
      removeEventListener('pointerdown', onPress, true);
    };
    addEventListener('pointerdown', onPress, true);
  });
}

// For elements the code just created from its own markup, so a miss is a bug worth stopping at.
export function child(root: ParentNode, selector: string): HTMLElement;
export function child<T extends Element>(
  root: ParentNode,
  selector: string,
  kind: abstract new (...args: never[]) => T,
): T;
export function child(
  root: ParentNode,
  selector: string,
  kind: abstract new (...args: never[]) => Element = HTMLElement,
) {
  const el = root.querySelector(selector);
  if (!(el instanceof kind)) throw new Error(`no ${selector}`);
  return el;
}

// The nearest element around an event's target that matches. SVG counts, so wires and the pen's paths are found too.
export function closestTo(target: EventTarget | null, selector: string): HTMLElement | SVGElement | null;
export function closestTo<T extends Element>(
  target: EventTarget | null,
  selector: string,
  kind: abstract new (...args: never[]) => T,
): T | null;
export function closestTo(
  target: EventTarget | null,
  selector: string,
  kind?: abstract new (...args: never[]) => Element,
) {
  const el = target instanceof Element ? target.closest(selector) : null;
  if (kind) return el instanceof kind ? el : null;
  return el instanceof HTMLElement || el instanceof SVGElement ? el : null;
}

// presses a button the way a click would, if it's there
export function clickIn(root: ParentNode, selector: string) {
  const el = root.querySelector(selector);
  if (el instanceof HTMLElement) el.click();
}

// The element of a given kind with this id: a button to disable, say. A miss or a wrong kind is a bug.
export function elementById<T extends Element>(id: string, kind: abstract new (...args: never[]) => T): T {
  const el = document.getElementById(id);
  if (!(el instanceof kind)) throw new Error(`#${id} is not a ${kind.name}`);
  return el;
}
