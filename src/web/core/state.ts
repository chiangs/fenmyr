// @ts-nocheck
// What one open board holds, kept together so a second view can have its own later (split screen, issue #49).
export const session = {
  board: undefined,
  view: undefined,
  sel: undefined,
  editing: undefined,
  space: undefined,
  focusSet: undefined,
  selWire: undefined,
};
// App-wide values more than one module assigns.
export const appState = {
  projects: undefined,
  folders: undefined,
  boardList: undefined,
  boardOrder: undefined,
  saveT: undefined,
  mrotKeep: undefined,
  lastTap: undefined,
  drag: undefined,
  pendingPaste: undefined,
  cae: undefined,
  deselectAt: undefined,
  toggleLog: undefined,
  dizzyAuto: undefined,
  histOpen: undefined,
  haveClaude: undefined,
  aiAnimAt: undefined,
  dueHold: undefined,
  flightLive: undefined,
  lastActive: undefined,
  lastKey: undefined,
  animPose: undefined,
  vaultChip: undefined,
  micOK: undefined,
  warm: undefined,
  firstRunSetup: undefined,
};
