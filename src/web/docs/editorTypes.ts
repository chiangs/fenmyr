// The doc editor is TipTap, built separately into web/vendor/editor.js (and Word export into docx.js) without its types.
// These list what the docs code uses. A chained command is TipTap's own: it takes that command's arguments and returns
// the chain, which ends with run(). A command not listed here is a type error until it's added.
type ChainCommand =
  | 'addColumnAfter'
  | 'clearNodes'
  | 'addRowAfter'
  | 'deleteColumn'
  | 'deleteRow'
  | 'deleteTable'
  | 'extendMarkRange'
  | 'focus'
  | 'insertContent'
  | 'insertContentAt'
  | 'insertTable'
  | 'lift'
  | 'redo'
  | 'setBlockquote'
  | 'setCodeBlock'
  | 'setColor'
  | 'setFontFamily'
  | 'setFontSize'
  | 'setHeading'
  | 'setHighlight'
  | 'setHorizontalRule'
  | 'setImage'
  | 'setLineHeight'
  | 'setLink'
  | 'setParagraph'
  | 'setTextAlign'
  | 'setTextSelection'
  | 'toggleBlockquote'
  | 'toggleBold'
  | 'toggleBulletList'
  | 'toggleHeaderRow'
  | 'toggleItalic'
  | 'toggleOrderedList'
  | 'toggleStrike'
  | 'toggleSubscript'
  | 'toggleSuperscript'
  | 'toggleTaskList'
  | 'toggleUnderline'
  | 'undo'
  | 'unsetAllMarks'
  | 'unsetColor'
  | 'unsetFontFamily'
  | 'unsetHighlight'
  | 'unsetLineHeight'
  | 'unsetLink'
  | 'updateAttributes';
type DocChain = { [K in ChainCommand]: (...args: unknown[]) => DocChain } & { run(): boolean };
type Coords = { left: number; right: number; top: number; bottom: number };
type ResolvedPos = { depth: number; after(depth: number): number };

export type DocEditor = {
  chain(): DocChain;
  can(): { undo(): boolean; redo(): boolean };
  commands: {
    setContent(content: unknown, emit?: boolean): boolean;
    clearContent(): boolean;
    focus(at?: unknown): boolean;
    setTextSelection(at: number | { from: number; to: number }): boolean;
    undo(): boolean;
  };
  isActive(name: string | Record<string, unknown>, attrs?: Record<string, unknown>): boolean;
  getAttributes(name: string): Record<string, unknown>;
  getJSON(): unknown;
  getHTML(): string;
  getText(options?: { blockSeparator?: string }): string;
  isFocused: boolean;
  isEditable: boolean;
  state: {
    selection: { from: number; to: number; empty: boolean };
    doc: {
      content: { size: number };
      firstChild: { textContent: string } | null;
      textBetween(from: number, to: number, separator?: string): string;
      resolve(pos: number): ResolvedPos;
    };
  };
  view: {
    coordsAtPos(pos: number): Coords;
    posAtCoords(at: { left: number; top: number }): { pos: number } | null;
  };
  storage: { characterCount: { words(): number } };
};

type EditorView = { posAtCoords(at: { left: number; top: number }): { pos: number } | null };
type EditorOptions = {
  element: HTMLElement;
  extensions: unknown[];
  editorProps: {
    attributes: Record<string, string>;
    handleKeyDown(view: EditorView, e: KeyboardEvent): boolean;
    handleDrop(view: EditorView, e: DragEvent): boolean;
    handlePaste(view: EditorView, e: ClipboardEvent): boolean;
  };
  onUpdate(): void;
  onSelectionUpdate(): void;
  onTransaction(): void;
  onFocus(): void;
  onBlur(): void;
};

export type EditorBundle = {
  Editor: new (options: EditorOptions) => DocEditor;
  extensions(placeholder?: string): unknown[];
  generateHTML(doc: unknown, extensions: unknown[]): string;
  generateJSON(html: string, extensions: unknown[]): unknown;
};
export type DocxBundle = { toDocx(doc: unknown, options: unknown): Promise<Uint8Array> };
