import type { BoardSummary, CaelestiaScheme } from '../../shared/ops.ts';
import type { Board, BoardOrder, Folder, Project, View } from '../../shared/model.ts';
import type { Pose } from '../goo.ts';

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
  cae: CaelestiaScheme | null;
  deselectAt: unknown;
  toggleLog: unknown;
  dizzyAuto: unknown;
  histOpen: unknown;
  haveClaude: unknown;
  aiAnimAt: number;
  dueHold: boolean;
  flightLive: unknown;
  lastActive: unknown;
  lastKey: unknown;
  animPose: Pose | null;
  vaultChip: boolean;
  micOK: unknown;
  warm: MediaStream | null;
  firstRunSetup: unknown;
};
export const appState = {} as AppState;
