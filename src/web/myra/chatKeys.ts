// What a key does in Myra's input: one table for sending, new lines and the slash menu, so they can't disagree.
// Nothing here imports at run time, so tests/chatKeys.ts checks every row in Node.

// menu: the slash menu is open · command: one line that starts with a known /name, menu closed · text: anything else
export type BoxState = 'text' | 'command' | 'menu';

// what the slash menu should do; myra/slash.ts carries it out
export type MenuKey = { type: 'move'; by: 1 | -1 } | { type: 'pick'; how: 'run' | 'fill' } | { type: 'close' };

type ChatKeyAction =
  | { type: 'pass' }
  // the browser adds the line; the window's shortcuts must not see the Enter (the Pen's would end a stroke and eat it)
  | { type: 'line' }
  | { type: 'send' }
  | { type: 'close' }
  | { type: 'menu'; key: MenuKey };

type KeyFacts = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'isComposing' | 'keyCode'>;

export function chatKey(e: KeyFacts, box: BoxState): ChatKeyAction {
  // keyCode 229: Safari (the web demo) ends composition before the Enter that chose the words, and flags only this
  if (e.isComposing || e.keyCode === 229) return { type: 'pass' };
  const mod = e.ctrlKey || e.metaKey;
  if (box === 'menu')
    switch (e.key) {
      case 'ArrowDown':
        return { type: 'menu', key: { type: 'move', by: 1 } };
      case 'ArrowUp':
        return { type: 'menu', key: { type: 'move', by: -1 } };
      case 'Escape':
        return { type: 'menu', key: { type: 'close' } };
      case 'Enter':
        return e.shiftKey && !mod ? { type: 'line' } : { type: 'menu', key: { type: 'pick', how: 'run' } };
      case 'Tab':
        return e.shiftKey || mod ? { type: 'pass' } : { type: 'menu', key: { type: 'pick', how: 'fill' } };
      default:
        return { type: 'pass' };
    }
  if (e.key === 'Escape') return { type: 'close' };
  if (e.key !== 'Enter') return { type: 'pass' };
  // a typed command runs on Enter, so Ctrl+F, words, Enter still searches
  return mod || (box === 'command' && !e.shiftKey) ? { type: 'send' } : { type: 'line' };
}
