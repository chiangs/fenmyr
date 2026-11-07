// The button the keyboard last moved focus to, forgotten at the next pointer press. A clicked button keeps focus too,
// and that can't be told at a key press, since any key makes the focused button :focus-visible.
let keyed: EventTarget | null = null;

/** Whether Tab, F10 or a keyed redraw put focus on this button, with no pointer pressed since. */
export const keyedButton = (t: EventTarget | null) => t !== null && t === keyed;

export function initKeyed() {
  addEventListener('focusin', e => {
    keyed = e.target instanceof HTMLButtonElement && e.target.matches(':focus-visible') ? e.target : null;
  });
  // a press on the board leaves focus where it was, say on the Pen, and Space there pans again
  addEventListener(
    'pointerdown',
    () => {
      keyed = null;
    },
    true,
  );
}
