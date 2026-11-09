// Ctrl/Cmd+Shift+V pastes words exactly as they are, and its paste event can't be told apart from Ctrl+V's. A capture
// listener on the window runs before any other, so by the time a handler asks, the answer is fixed for that event.

let armed = false;
const plain = new WeakSet<Event>();

/** Whether this paste came from Ctrl/Cmd+Shift+V. */
export const isPlainPaste = (e: Event) => plain.has(e);

export function initPlainPaste() {
  // the key's code as well as its letter, since Option changes the letter on a Mac
  addEventListener(
    'keydown',
    e => {
      armed = (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key.toLowerCase() === 'v' || e.code === 'KeyV');
    },
    true,
  );
  addEventListener(
    'paste',
    e => {
      if (armed) plain.add(e);
      armed = false;
    },
    true,
  );
}
