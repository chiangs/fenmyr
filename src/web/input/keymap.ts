// The keyboard shortcuts that are not a toolbar tool's, as Settings → Board lists them. A toolbar tool's own key is read
// from its line in ui/toolbarTable.ts and shown in Settings → Layout, so nothing here repeats it. A key that puts a tool
// in hand with no toolbar button (R and X, the wireframe Box and Text) is listed here with `tool: true`, in the group of
// its family.
//
//   Add a command  One line in SHORTCUTS, naming a group. Write its keys in Mac symbols (⇧⌘G): the watcher in
//                  platform/osWords.ts spells them out on Windows and Linux. tests/keymap.ts then asks for a check that
//                  presses the keys, so a shortcut that works is a shortcut that is tested.
//   Add a family   One line in GROUPS. Settings shows a group's heading, and its note when it has one, only once it has
//                  an entry.
//
// The handlers themselves stay where they are: input/shortcuts.ts, edit/noteKeys.ts and features/find.ts.
import { TOOLBAR } from '../ui/toolbarTable.ts';

type ShortcutGroup = { id: string; heading: string; note?: string };
type Shortcut = {
  id: string;
  keys: string;
  does: string;
  group: (typeof GROUPS)[number]['id'];
  /** It puts a tool in hand. The handler puts drawing down before it does, as picking the tool from the toolbar does. */
  tool?: true;
};

const GROUPS = [
  { id: 'around', heading: 'Move around' },
  { id: 'cards', heading: 'Cards' },
  { id: 'arrange', heading: 'Arrange' },
  { id: 'style', heading: 'Text', note: 'On the selected cards, or the words selected in a note' },
  { id: 'note', heading: 'In a note' },
  { id: 'app', heading: 'Panels and views' },
  { id: 'wireframe', heading: 'Wireframe', note: 'Tools with no toolbar button' },
] as const satisfies readonly ShortcutGroup[];

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = GROUPS;

export const SHORTCUTS: readonly Shortcut[] = [
  { id: 'pan', keys: 'Space', does: 'Hold and drag to pan', group: 'around' },
  { id: 'zoomIn', keys: '⌘=', does: 'Zoom in', group: 'around' },
  { id: 'zoomOut', keys: '⌘−', does: 'Zoom out', group: 'around' },
  { id: 'zoom100', keys: '⌘0', does: 'Zoom to 100%', group: 'around' },
  { id: 'zoomFit', keys: '⇧1', does: 'Zoom to fit', group: 'around' },
  { id: 'fitAll', keys: '0', does: 'Fit all the cards in view', group: 'around' },

  { id: 'selectAll', keys: '⌘A', does: 'Select all the cards', group: 'cards' },
  { id: 'copy', keys: '⌘C', does: 'Copy the selected cards', group: 'cards' },
  { id: 'cut', keys: '⌘X', does: 'Cut the selected cards', group: 'cards' },
  { id: 'paste', keys: '⌘V', does: 'Paste', group: 'cards' },
  { id: 'duplicate', keys: '⌘D', does: 'Duplicate the selected cards', group: 'cards' },
  { id: 'delete', keys: 'Delete', does: 'Delete the selected cards or link', group: 'cards' },
  { id: 'undo', keys: '⌘Z', does: 'Undo', group: 'cards' },
  { id: 'redo', keys: '⇧⌘Z', does: 'Redo', group: 'cards' },

  { id: 'group', keys: '⌘G', does: 'Group the selected cards', group: 'arrange' },
  { id: 'ungroup', keys: '⇧⌘G', does: 'Ungroup', group: 'arrange' },
  { id: 'section', keys: '⌥⌘G', does: 'Create a section around the selected cards', group: 'arrange' },
  { id: 'front', keys: '⇧⌘]', does: 'Bring to front', group: 'arrange' },
  { id: 'forward', keys: '⌘]', does: 'Bring forward', group: 'arrange' },
  { id: 'backward', keys: '⌘[', does: 'Send backward', group: 'arrange' },
  { id: 'back', keys: '⇧⌘[', does: 'Send to back', group: 'arrange' },

  { id: 'bold', keys: '⌘B', does: 'Bold', group: 'style' },
  { id: 'italic', keys: '⌘I', does: 'Italic', group: 'style' },
  { id: 'underline', keys: '⌘U', does: 'Underline', group: 'style' },

  { id: 'strike', keys: '⇧⌘X', does: 'Strikethrough', group: 'note' },
  { id: 'clear', keys: '⌘\\', does: 'Clear formatting', group: 'note' },
  { id: 'bullets', keys: '⇧⌘8', does: 'Bulleted list', group: 'note' },
  { id: 'numbered', keys: '⇧⌘7', does: 'Numbered list', group: 'note' },
  { id: 'link', keys: '⌘K', does: 'Add a link', group: 'note' },
  { id: 'indent', keys: 'Tab', does: 'Indent a list item', group: 'note' },
  { id: 'outdent', keys: '⇧Tab', does: 'Outdent a list item', group: 'note' },
  { id: 'noteNext', keys: 'Tab', does: 'Go from the title to the words, then to the label', group: 'note' },
  { id: 'notePrevious', keys: '⇧Tab', does: 'Go back from the label to the words, then to the title', group: 'note' },

  { id: 'capture', keys: '⌘K', does: 'Quick capture', group: 'app' },
  { id: 'find', keys: '⌘F', does: 'Find on the board', group: 'app' },
  { id: 'findNext', keys: 'Enter', does: 'Next match, in the find bar', group: 'app' },
  { id: 'findPrevious', keys: '⇧Enter', does: 'Previous match, in the find bar', group: 'app' },
  { id: 'settings', keys: '⌘,', does: 'Open Settings', group: 'app' },
  { id: 'clean', keys: '⌘\\', does: 'Just the board: tuck every panel away', group: 'app' },
  { id: 'focus', keys: 'F', does: 'Focus on the selected cards', group: 'app' },
  { id: 'myra', keys: 'M', does: 'Ask Myra', group: 'app' },
  { id: 'stop', keys: '⌘.', does: 'Stop Myra while she works', group: 'app' },
  { id: 'escape', keys: 'Esc', does: 'Close what is open, put down a tool, or clear the selection', group: 'app' },

  { id: 'box', keys: 'R', does: 'Box: drag on the board to draw one', group: 'wireframe', tool: true },
  { id: 'text', keys: 'X', does: 'Text: click on the board to place one', group: 'wireframe', tool: true },
];

// The letters that put a tool in hand, which the key handler uses to put drawing down first: each toolbar tool's own
// letter and the key-only tools'. P is the Draw tool itself, so the handler toggles drawing with it and must not.
export const TOOL_KEYS = [...TOOLBAR.tools.map(t => t.key), ...SHORTCUTS.filter(s => s.tool).map(s => s.keys)].flatMap(
  key => (key?.length === 1 && key !== 'P' ? [key.toLowerCase()] : []),
);
