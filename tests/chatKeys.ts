// What each key does in Myra's chat input, for every row of the behaviour table, in Node.
import assert from 'node:assert';
import { type BoxState, chatKey } from '../src/web/myra/chatKeys.ts';

type Mods = { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; isComposing?: boolean; keyCode?: number };
const k = (key: string, m: Mods = {}) => ({
  key,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  isComposing: false,
  keyCode: 0,
  ...m,
});

const pass = { type: 'pass' },
  ime = { type: 'ime' },
  line = { type: 'line' },
  send = { type: 'send' },
  close = { type: 'close' },
  run = { type: 'menu', key: { type: 'pick', how: 'run' } },
  fill = { type: 'menu', key: { type: 'pick', how: 'fill' } };

const TABLE: [string, ReturnType<typeof k>, Record<BoxState, unknown>][] = [
  ['Enter', k('Enter'), { text: line, command: send, menu: run }],
  ['Shift+Enter', k('Enter', { shiftKey: true }), { text: line, command: line, menu: line }],
  ['Ctrl+Enter', k('Enter', { ctrlKey: true }), { text: send, command: send, menu: run }],
  ['⌘+Enter', k('Enter', { metaKey: true }), { text: send, command: send, menu: run }],
  ['Ctrl+Shift+Enter', k('Enter', { ctrlKey: true, shiftKey: true }), { text: send, command: send, menu: run }],
  ['Tab', k('Tab'), { text: pass, command: pass, menu: fill }],
  ['Shift+Tab', k('Tab', { shiftKey: true }), { text: pass, command: pass, menu: pass }],
  ['Down', k('ArrowDown'), { text: pass, command: pass, menu: { type: 'menu', key: { type: 'move', by: 1 } } }],
  ['Up', k('ArrowUp'), { text: pass, command: pass, menu: { type: 'menu', key: { type: 'move', by: -1 } } }],
  ['Esc', k('Escape'), { text: close, command: close, menu: { type: 'menu', key: { type: 'close' } } }],
  ['a letter', k('a'), { text: pass, command: pass, menu: pass }],
];

const STATES: BoxState[] = ['text', 'command', 'menu'];
for (const [name, facts, want] of TABLE)
  for (const box of STATES) {
    assert.deepStrictEqual(chatKey(facts, box), want[box], `${name} with the box in its ${box} state`);
    assert.deepStrictEqual(
      chatKey({ ...facts, isComposing: true }, box),
      ime,
      `${name} while an IME composes, ${box} state: the IME has it`,
    );
    assert.deepStrictEqual(
      chatKey({ ...facts, keyCode: 229 }, box),
      ime,
      `${name} with keyCode 229 (Safari's composing Enter), ${box} state: the IME has it`,
    );
  }

console.log('CHAT KEYS OK');
