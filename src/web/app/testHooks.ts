import type { MyraReply } from '../../shared/myraReply.ts';
import type { Chattiness } from '../../shared/ops.ts';
import { copyCards, pasteCards } from '../canvas/clipboard.ts';
import { fit } from '../canvas/handles.ts';
import { renderAll, renderCard } from '../canvas/render.ts';
import { selectOnly, selectWire } from '../canvas/selection.ts';
import { renderTray } from '../canvas/tray.ts';
import { applyView } from '../canvas/view.ts';
import { appState, session } from '../core/state.ts';
import { liveEditor } from '../docs/editor.ts';
import { docPrintHTML } from '../docs/pdf.ts';
import { startEdit } from '../edit/editing.ts';
import {
  DUE_FIRED,
  DUE_KEY,
  dueAnnounce,
  dueArm,
  dueHeld,
  dueState,
  lsRead,
  setDue,
  slashDue,
} from '../features/due.ts';
import { durText, parseTimer, timerRequest } from '../features/duration.ts';
import { runTemplate, templateEntries } from '../features/templateList.ts';
import { saveAsTemplate, saveWithDialog, useTemplate } from '../features/templates.ts';
import { currentPose, timer, timerCheck } from '../features/timer.ts';
import { addBoardHere, addFolderHere } from '../library/addHere.ts';
import { changeBoard } from '../library/boardWrites.ts';
import { createBoard, createExample, createFolder, createProject, currentPlace } from '../library/create.ts';
import { openHome } from '../library/home.ts';
import { openNewProject } from '../library/newProject.ts';
import { openBoard } from '../library/openBoard.ts';
import { refreshBoards, renameBoard } from '../library/rowMenu.ts';
import { boardsIn, moveBoard, putFolder } from '../library/tree.ts';
import { card } from '../model/boards.ts';
import { ANIMS, animIntent, animName, animRequest, lastAnim, playAnim, stopAnim } from '../myra/anim.ts';
import { applyHeld, asItWouldLand, holdReply, planHeld, Turn } from '../myra/apply.ts';
import type { Picked } from '../myra/applyTypes.ts';
import {
  bdState,
  birthdayCheck,
  birthdayDue,
  birthdayFacts,
  celebrateBirthday,
  dayKey,
  hatOn,
  setBirthday,
} from '../myra/birthday.ts';
import { ask } from '../myra/chat.ts';
import { draftBoards } from '../myra/chatDraft.ts';
import { goo } from '../myra/goos.ts';
import { daily, greet, greeter, SLASH } from '../myra/greet.ts';
import { heldLists, planAsk, settle } from '../myra/heldPlan.ts';
import { dozeCheck, idleCheck, idleState } from '../myra/idle.ts';
import { perched, perchGoo } from '../myra/perch.ts';
import { forgetReactions, lastReaction, react } from '../myra/react.ts';
import { replyRecord } from '../myra/replyMemory.ts';
import { nextBoards, peekSees } from '../myra/seesStrip.ts';
import { snapshot } from '../myra/snapshot.ts';
import { startJob } from '../myra/status.ts';
import { centerWorld } from '../panels/zoomMenu.ts';
import { placeSelbar } from '../selbar/selbar.ts';
import { settings } from '../settings/settings.ts';
import { addCard } from '../tools/penEdit.ts';
import { applyToolbar } from '../ui/toolbarConfig.ts';
import { openVaultPicker } from '../vault/ask.ts';
import { refreshVNotes } from '../vault/notes.ts';
import { editVaultAccess } from '../vault/vaults.ts';
import { PIECE_GROUPS } from '../wireframe/pieceGroups.ts';
import { PIECES } from '../wireframe/pieces.ts';
import { placePiece } from '../wireframe/placePiece.ts';
import { restack } from '../wireframe/stack.ts';
import { maybeNews } from './news.ts';
import { openSetup, startTour } from './onboarding.ts';

// a reply driven from a test goes with what the strip would send now
const NO_VAULT: Omit<Picked, 'sees'> = { asked: false, used: [] };

// what tests reach through window.__fenmyr
const makeHooks = () => ({
  stopAnim,
  dueRelease: () => {
    appState.dueHold = false;
    if (dueHeld.length) dueAnnounce(dueHeld.splice(0));
  },
  greet,
  greeter,
  daily,
  dayKey,
  slashDue,
  setGreet: (g: boolean, chat: Chattiness) => {
    settings.greet = g;
    settings.chat = chat;
  },
  setDue,
  dueArm,
  dueState,
  dueRaw: () => lsRead(DUE_KEY, {}),
  dueFiredRaw: () => lsRead(DUE_FIRED, {}),
  copyCards,
  pasteCards,
  openBoard,
  // a build's write to a board, open or not
  changeBoard,
  curBoard: () => session.board,
  nextBoards,
  draftBoards,

  refreshBoards: () => refreshBoards(),
  // what dropping a board or folder in the library calls
  moveBoard,
  // what renaming a board in the library calls
  renameBoard,
  putFolder,
  boardOrder: () => appState.boardOrder,
  boardsOf: (fid: string) => boardsIn(fid).map(b => b.name),
  slashNames: () => SLASH.filter(c => !c.dev).map(c => c.cmd),
  birthdayDue,
  birthdayCheck,
  setBirthday,
  bdSetting: () => settings.birthday,
  birthdayFacts,
  bdState,
  celebrateBirthday,
  bdActive: (ms: number, keyMs = 99999) => {
    appState.lastActive = Date.now() - ms;
    appState.lastKey = Date.now() - keyMs;
  },
  hatOn: () => hatOn,
  timerRequest,
  durText,
  dizzyAuto: (v: boolean) => {
    appState.dizzyAuto = !!v;
    appState.toggleLog = [];
  },
  perchGoo,
  lastAnimName: () => lastAnim,
  perched: () => perched,
  idleCheck,
  idleState,
  dozeCheck,
  react,
  forgetReactions,
  lastReaction: () => lastReaction,
  // the look her sprite has while she works, whether there is room for its prop, and a job as the app starts one
  busyLook: () => goo.busyLook(),
  propRoom: () => goo.roomy(),
  startJob,
  playAnim,
  animRequest,
  animName,
  animIntent,
  animNames: () => ANIMS.map(a => a.name),
  currentPose: () => currentPose,
  timerState: () => timer,
  timerCheck,
  parseTimer,
  placePiece,
  PIECES,
  PIECE_GROUPS,
  newNote: (x = 0, y = 0) => {
    const w = centerWorld(),
      c = card('note', { color: 'white', name: '' });
    c.x = w.x + x;
    c.y = w.y + y;
    addCard(c);
    selectOnly([c.id]);
    startEdit(c.id);
    return c.id;
  },
  selectWire,
  renderTray,
  ask,
  applyToolbar,
  renderCard,
  openVaultPicker,
  editVaultAccess,
  refreshVNotes,
  saveWithDialog,
  saveAsTemplate,
  useTemplate,
  runTemplate,
  templateEntries,
  selectOnly,
  restack,
  openSetup,
  startTour,
  maybeNews,
  get board() {
    return session.board;
  },
  // a reply as if Claude had just sent it: it waits its turn behind any other
  applyMyra: (r: MyraReply, q = '', ctx = NO_VAULT) =>
    Turn.take(async turn => applyHeld(turn, await holdReply(r, q, { ...ctx, sees: peekSees() })), session.board.id),
  // a reply as if Claude had just sent it, through the check that holds a big one as a plan, and about any plan waiting
  answerMyra: (r: MyraReply, q = '', ctx = NO_VAULT) =>
    Turn.take(
      async turn => settle(turn, await holdReply(r, q, { ...ctx, sees: peekSees() }), planAsk()?.id ?? null),
      session.board.id,
    ),
  heldLists,
  replyRecord,
  previewMyra: async (r: MyraReply) => {
    const p = planHeld(await holdReply(r, '', { ...NO_VAULT, sees: peekSees() }));
    return { lists: asItWouldLand(p).lists, changes: p.changes };
  },
  fit,
  lib: () => snapshot().library,
  docEditor: liveEditor,
  docPrintHTML,
  openHome,
  openNewProject,
  addBoardHere,
  addFolderHere,
  createProject,
  createFolder,
  createBoard,
  createExample,
  currentPlace,
  get editing() {
    return session.editing;
  },
  get sel() {
    return [...session.sel];
  },
  placeSelbar,
  renderAll,
  get view() {
    return session.view;
  },
  applyView,
});
export type TestHooks = ReturnType<typeof makeHooks>;

export function init65() {
  if (window.fenmyrHost?.test) window.__fenmyr = makeHooks();
}
