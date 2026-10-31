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
