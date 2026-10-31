import type { BoardSummary } from '../../shared/ops.ts';
import type { Board, BoardOrder, Folder, Project, View } from '../../shared/model.ts';

// What one open board holds, kept together so a second view can have its own later (split screen, issue #49).
type Session = {
  board: Board;
  view: View;
  sel: Set<string>;
  editing: string | null;
  space: boolean;
  focusSet: Set<string> | null;
  selWire: unknown;
};
// main.ts fills these before any feature reads them.
export const session = {} as Session;

// App-wide values more than one module assigns. Typing the modules that own one replaces its `unknown`.
type AppState = {
  projects: Project[];
  folders: Folder[];
  boardList: BoardSummary[];
  boardOrder: BoardOrder;
  saveT: ReturnType<typeof setTimeout> | undefined;
  mrotKeep: unknown;
  lastTap: unknown;
  drag: unknown;
  pendingPaste: unknown;
  cae: unknown;
  deselectAt: unknown;
  toggleLog: unknown;
  dizzyAuto: unknown;
  histOpen: unknown;
  haveClaude: unknown;
  aiAnimAt: number;
  dueHold: unknown;
  flightLive: unknown;
  lastActive: unknown;
  lastKey: unknown;
  animPose: unknown;
  vaultChip: unknown;
  micOK: unknown;
  warm: MediaStream | null;
  firstRunSetup: unknown;
};
export const appState = {} as AppState;
