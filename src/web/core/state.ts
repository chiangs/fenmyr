import type { BoardSummary, CaelestiaScheme } from '../../shared/ops.ts';
import type { Board, BoardOrder, Folder, Project, View } from '../../shared/model.ts';
import type { Pose } from '../goo.ts';
import type { Drag } from '../canvas/drag.ts';

// What one open board holds, kept together so a second view can have its own later (split screen, issue #49).
type Session = {
  board: Board;
  view: View;
  sel: Set<string>;
  editing: string | null;
  space: boolean;
  focusSet: Set<string> | null;
  selWire: string | null;
};
// main.ts fills these before any feature reads them.
export const session = {} as Session;

// App-wide values more than one module assigns.
type AppState = {
  projects: Project[];
  folders: Folder[];
  boardList: BoardSummary[];
  boardOrder: BoardOrder;
  saveT: ReturnType<typeof setTimeout> | undefined;
  // after turning several pieces, which one keeps the turn dot
  mrotKeep: { key: string; anchor: string } | null;
  // the last tap on a card, for telling a double-click
  lastTap: { id?: string; t?: number };
  drag: Drag | null;
  pendingPaste: boolean;
  cae: CaelestiaScheme | null;
  deselectAt: number;
  toggleLog: number[];
  dizzyAuto: boolean;
  histOpen: boolean;
  // null until the app has checked
  haveClaude: boolean | null;
  aiAnimAt: number;
  dueHold: boolean;
  flightLive: boolean;
  lastActive: number;
  lastKey: number;
  animPose: Pose | null;
  vaultChip: boolean;
  // the microphone answered once, so recording can start without asking again
  micOK: boolean;
  warm: MediaStream | null;
  // this start-up is the first, and setup is showing
  firstRunSetup: boolean;
};
export const appState: AppState = {
  projects: [],
  folders: [],
  boardList: [],
  boardOrder: {},
  saveT: undefined,
  mrotKeep: null,
  lastTap: {},
  drag: null,
  pendingPaste: false,
  cae: null,
  deselectAt: 0,
  toggleLog: [],
  dizzyAuto: true,
  histOpen: false,
  haveClaude: null,
  aiAnimAt: 0,
  dueHold: false,
  flightLive: false,
  lastActive: 0,
  lastKey: 0,
  animPose: null,
  vaultChip: false,
  micOK: false,
  warm: null,
  firstRunSetup: false,
};
