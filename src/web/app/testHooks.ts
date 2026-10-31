// @ts-nocheck
import { openSetup, startTour } from './onboarding.ts';
import { copyCards, pasteCards } from '../canvas/clipboard.ts';
import { fit } from '../canvas/handles.ts';
import { renderAll, renderCard } from '../canvas/render.ts';
import { applyView } from '../canvas/view.ts';
import { renderTray, selectOnly, selectWire } from '../canvas/wires.ts';
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
import { startEdit } from '../features/tags.ts';
import { saveAsTemplate, saveWithDialog, useTemplate } from '../features/templates.ts';
import { currentPose, durText, parseTimer, timer, timerCheck, timerRequest } from '../features/timer.ts';
import { openBoard, openHome } from '../library/home.ts';
import { refreshBoards } from '../library/rowMenu.ts';
import { boardsIn } from '../library/tree.ts';
import { card } from '../model/boards.ts';
import { ANIMS, animIntent, animName, animRequest, lastAnim, playAnim, stopAnim } from '../myra/anim.ts';
import { applyMyra } from '../myra/apply.ts';
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
import { ask, perchGoo, perched, snapshot } from '../myra/chat.ts';
import { SLASH, daily, greet, greeter } from '../myra/greet.ts';
import { idleCheck, idleState } from '../myra/idle.ts';
import { centerWorld } from '../panels/zoomMenu.ts';
import { placeSelbar } from '../selbar/selbar.ts';
import { settings } from '../settings/settings.ts';
import { addCard } from '../tools/penEdit.ts';
import { applyToolbar } from '../ui/toolbarConfig.ts';
import { openVaultPicker } from '../vault/ask.ts';
import { refreshVNotes } from '../vault/notes.ts';
import { editVaultAccess } from '../vault/vaults.ts';
import { GROUPS, PIECES, placePiece, restack } from '../wireframe/pieces.ts';
import { appState, session } from '../core/state.ts';
export function init65() {
  window.__fenmyr = {
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
    setGreet: (g, chat) => {
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
    curBoard: () => session.board,

    refreshBoards: () => refreshBoards(),
    boardOrder: () => appState.boardOrder,
    boardsOf: fid => boardsIn(fid).map(b => b.name),
    slashNames: () => SLASH.filter(c => !c.dev).map(c => c.cmd),
    birthdayDue,
    birthdayCheck,
    setBirthday,
    bdSetting: () => settings.birthday,
    birthdayFacts,
    bdState,
    celebrateBirthday,
    bdActive: (ms, keyMs = 99999) => {
      appState.lastActive = Date.now() - ms;
      appState.lastKey = Date.now() - keyMs;
    },
    hatOn: () => hatOn,
    timerRequest,
    durText,
    dizzyAuto: v => {
      appState.dizzyAuto = !!v;
      appState.toggleLog = [];
    },
    perchGoo,
    lastAnimName: () => lastAnim,
    perched: () => perched,
    idleCheck,
    idleState,
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
    GROUPS,
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
    selectOnly,
    restack,
    openSetup,
    startTour,
    get board() {
      return session.board;
    },
    applyMyra,
    fit,
    lib: () => snapshot().library,
    openHome,
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
  };
}
