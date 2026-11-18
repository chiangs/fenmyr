// The tools in the bar: which there are, their order, their groups, and which tuck into ··· first when the bar runs
// short of room. Rearrange the bar by editing TABLE. Nothing else lists the tools, and no code changes with it.
//
//   Reorder     Move a tool's line. The bar shows the tools in the order the lines are written.
//   Regroup     Move a tool's line under another group's name. A name on a line of its own starts a new group, and the
//               first line is always a name.
//   Priority    Add `priority: 1` to a tool's line to keep it in the bar longer, or `priority: -1` to tuck it sooner.
//               A tool without one has 0. The lowest priority tucks into ··· first, and of equal priority the tool
//               last in the bar tucks first. So with no priority set anywhere, tools tuck from the end of the bar. The
//               tool that tucks last is the one that stays when the bar is at its narrowest, so if Select must always
//               show, give it the highest priority once any other tool has one.
//
// Settings → Toolbar lets each person reorder tools and switch them off on top of this, and Reset goes back to it. A
// person's own order counts as "the bar" in the rule above. An id is what their saved order and the code call a tool,
// so it never changes.
const TABLE: Table = [
  'select',
  { id: 'pointer', label: 'Select', key: 'V', icon: 'select', lit: true },

  'write',
  { id: 'note', label: 'Note', key: 'N', icon: 'note' },
  { id: 'vnote', label: 'Vault note', key: 'Alt+N', icon: 'notebook', needs: 'vault' },
  { id: 'doc', label: 'Doc', key: 'D', icon: 'doc' },
  { id: 'todo', label: 'Checklist', key: 'C', icon: 'checklist' },
  { id: 'title', label: 'Big title', key: 'T', icon: 'title' },

  'arrange',
  { id: 'coll', label: 'Collection', key: 'G', icon: 'collection' },
  { id: 'canvas', label: 'Canvas', icon: 'canvas', aria: 'Canvas (a board inside this one)' },
  { id: 'frame', label: 'Wireframe', key: 'W', icon: 'screen', toggle: true },

  'media',
  { id: 'link', label: 'Link', key: 'L', icon: 'link' },
  { id: 'image', label: 'Image', key: 'I', icon: 'image' },
  { id: 'audio', label: 'Voice memo', key: 'A', icon: 'mic' },
  { id: 'video', label: 'Video', key: '⇧V', icon: 'video' },
  { id: 'swatch', label: 'Colour', icon: 'palette' },

  'decorate',
  { id: 'shape', label: 'Shapes', key: 'S', icon: 'shapes' },
  { id: 'stamp', label: 'Stamps', key: 'E', icon: 'stamp' },
  { id: 'tpl', label: 'Templates', icon: 'templates' },

  'draw',
  { id: 'pen', label: 'Pen', key: '⇧P', icon: 'pen' },
  { id: 'draw', label: 'Draw', key: 'P', icon: 'draw' },
];

type ToolLine = {
  id: string;
  /** Its name in the tooltip, Settings → Toolbar and the ··· menu. */
  label: string;
  /** The shortcut the tooltip shows after the name, in Mac symbols (⇧V). Windows and Linux spell them out. */
  key?: string;
  /** A name from the icon pack. */
  icon: string;
  priority?: number;
  /** What a screen reader says, when the tooltip says too little. */
  aria?: string;
  /** Lit when the app opens: the select arrow. */
  lit?: true;
  /** Tells a screen reader whether it is pressed, as it stays on while you use it. */
  toggle?: true;
  /** Shows only on a board that can read a vault. */
  needs?: 'vault';
};
type Row = string | ToolLine;
type Table = readonly [string, ...Row[]];

type Tool = ToolLine & { readonly group: string };

type Toolbar = {
  readonly tools: readonly Tool[];
  tool(id: string): Tool | undefined;
  /** The ids of `bar` in the order they tuck into ···, always each once. `bar` is the shown tools in the order a person
   *  sees them, their own when they have one. */
  tuckOrder(bar: readonly string[]): string[];
};

export function toolbarOf(table: Table): Toolbar {
  const tools: Tool[] = [],
    groups = new Set<string>();
  let group = '',
    filled = true;
  for (const row of table) {
    if (typeof row === 'string') {
      if (!filled) throw new Error(`the group "${group}" has no tools`);
      if (groups.has(row)) throw new Error(`the group "${row}" is named twice`);
      groups.add(row);
      group = row;
      filled = false;
      continue;
    }
    if (tools.some(t => t.id === row.id)) throw new Error(`the tool "${row.id}" is listed twice`);
    tools.push({ ...row, group });
    filled = true;
  }
  if (!filled) throw new Error(`the group "${group}" has no tools`);
  const priorityOf = (id: string) => tools.find(t => t.id === id)?.priority ?? 0;
  return {
    tools,
    tool: id => tools.find(t => t.id === id),
    // sort is stable, so reversing first makes the last of equal priority come first
    tuckOrder: bar => [...bar].reverse().sort((a, b) => priorityOf(a) - priorityOf(b)),
  };
}

export const TOOLBAR = toolbarOf(TABLE);
