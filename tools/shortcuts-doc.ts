// Writes docs/shortcuts.md from the tables the app itself reads: each tool's key from src/web/ui/toolbarTable.ts and
// every other shortcut from src/web/input/keymap.ts, the same lists Settings → Layout and Settings → Board show. So the
// page can't drift from the app: add a key to a table and run this.
//
//   node tools/shortcuts-doc.ts            writes docs/shortcuts.md
//   node tools/shortcuts-doc.ts --check    fails if the file on disk isn't what the tables give (part of check:fast)
//
// MORE holds what neither table lists: the mouse and touchpad, what typing does in a note and in Myra's chat, and the
// window keys the host handles (src/host/main.ts). Those lines are written by hand, so check them when their handlers
// change: canvas/pointer.ts, canvas/dragMove.ts, edit/noteKeys.ts, myra/chatKeys.ts and selbar/barKeys.ts.
import fs from 'node:fs';
import path from 'node:path';
import { SHORTCUT_GROUPS, SHORTCUTS } from '../src/web/input/keymap.ts';
import { TOOLBAR } from '../src/web/ui/toolbarTable.ts';

const FILE = path.resolve(import.meta.dirname, '..', 'docs', 'shortcuts.md');

// The keys are written in Mac symbols. Linux and Windows read ⌘ and ⌃ as Ctrl, ⌥ as Alt and ⇧ as Shift, in that order,
// as platform/osWords.ts spells them in the app.
const MODS: Record<string, string> = { '⌃': 'Ctrl', '⌘': 'Ctrl', '⌥': 'Alt', '⇧': 'Shift' };
const ORDER = ['Ctrl', 'Alt', 'Shift'];
function pcKeys(keys: string) {
  const mods = [...keys].filter(c => c in MODS);
  const key = [...keys].filter(c => !(c in MODS)).join('');
  const words = ORDER.filter(o => mods.some(m => MODS[m] === o));
  return [...words, key].join('+');
}

const cell = (s: string) => s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
const keyCell = (keys: string) => `**${cell(keys)}**`;

function table(rows: readonly { keys: string; does: string }[]) {
  const lines = rows.map(r => {
    const pc = keyCell(pcKeys(r.keys));
    const mac = keyCell(r.keys);
    const does = cell(r.does);
    return `| ${pc} | ${mac} | ${does} |`;
  });
  return ['| Linux and Windows | Mac | Does |', '|---|---|---|', ...lines].join('\n');
}

function toolsSection() {
  const rows = TOOLBAR.tools.flatMap(t => {
    if (!t.key) return [];
    const only = t.needs === 'vault' ? ', on a board that can read a vault' : '';
    return [{ keys: t.key, does: `${t.label}${only}` }];
  });
  return `## Tools\n\nEach tool in the panel at the top right has a key. Settings → Layout → Toolbar lists them too.\n\n${table(rows)}`;
}

function groupSections() {
  return SHORTCUT_GROUPS.flatMap(g => {
    const rows = SHORTCUTS.filter(s => s.group === g.id);
    if (!rows.length) return [];
    const note = g.note ? `${g.note}.\n\n` : '';
    return [`## ${g.heading}\n\n${note}${table(rows)}`];
  });
}

const MORE = `## Mouse and touchpad

| | |
|---|---|
| **Two fingers** | Pan the board. The mouse wheel pans up and down, and Shift with the wheel pans sideways |
| **Pinch** | Zoom smoothly |
| **Ctrl + scroll** | Zoom in even steps (…90 · 100 · 110 · 125…%), so 100% is always one of them |
| **Double-click** | A new note on an empty spot. Settings → Board turns this off |
| **Alt + drag** | Drag a copy |

## As you type in a note

| | |
|---|---|
| \`**word**\` · \`*word*\` · \`~~word~~\` | Bold, italic or strikethrough, as you type the last mark |
| \`[words](https://…)\` | A link, as you type the last bracket |
| **-** or **1.** and a space | Start a list at the start of a line. Backspace straight after gives back what you typed |
| **Enter · Shift+Enter** | A new item · a new line in the same item. Enter on an empty item ends the list |
| **Ctrl+Shift+V** | Paste as plain text |

## The selection bar

| | |
|---|---|
| **F10** | Move to the bar over the selection; in a note, to its formatting buttons. Tab moves between them, and Esc goes back |

## Myra's chat

| | |
|---|---|
| **Ctrl+Enter** | Send. Enter adds a line |
| **/** | Her commands. Enter runs the highlighted one, Tab fills it in, and Esc closes the list |

## The window

On Linux and Windows.

| | |
|---|---|
| **F11** | Full screen |
| **Ctrl+Q** | Quit |
| **F12 · Ctrl+Shift+I** | Developer tools |`;

const page = () =>
  [
    '<!-- Written by tools/shortcuts-doc.ts from src/web/ui/toolbarTable.ts and src/web/input/keymap.ts. Change the tables, not this file. -->',
    '# Keyboard shortcuts',
    'The same list is in the app, under Settings → Board → Keyboard shortcuts.',
    toolsSection(),
    ...groupSections(),
    MORE,
  ].join('\n\n') + '\n';

if (process.argv[2] === '--check') {
  if (!fs.existsSync(FILE) || fs.readFileSync(FILE, 'utf8') !== page()) {
    console.error('docs/shortcuts.md is out of date. Run: node tools/shortcuts-doc.ts');
    process.exit(1);
  }
  console.log('docs/shortcuts.md matches the shortcut tables');
} else {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, page());
  console.log(`wrote ${path.relative(process.cwd(), FILE)}`);
}
