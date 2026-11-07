import { byId } from '../canvas/wires.ts';
import { addImages } from '../cards/spotify.ts';
import { $ } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { appState, session } from '../core/state.ts';
import { filterTpl } from '../features/templates.ts';
import { closeHome, homeAt } from '../library/home.ts';
import { openBoard } from '../library/openBoard.ts';
import { refreshBoards, renameNewest, uniqueName } from '../library/rowMenu.ts';
import { foldersIn, makeFolder, makeProject, saveLib } from '../library/tree.ts';
import { readyToRecord } from '../media/devices.ts';
import { fillVideo } from '../media/videoFile.ts';
import { newBoard } from '../model/boards.ts';
import { offerRename } from '../repo/codeFolder.ts';
import { addBoardTo } from '../repo/prototypes.ts';
import { drawOn, enterDraw, exitDraw } from '../tools/draw.ts';
import { endPen, penT, startPen } from '../tools/pen.ts';
import { placing, startPlacing, stopPlacing } from '../tools/place.ts';
import { renderWheel } from '../tools/stamps.ts';
import { openVaultPicker } from '../vault/ask.ts';
import { closestTo, elementById } from './dom.ts';
import { countAsMenu } from './popover.ts';
import { tbRect } from './toolbarConfig.ts';

// links get a little paste box under the toolbar (the app can't show the browser's prompt)

// ---------- toolbar ----------
// the select arrow: puts down whatever tool you're holding (placing, drawing, the pen, a picker) so you're just selecting and moving. It lights up whenever no other tool is on
export function toPointer() {
  if (penT) endPen(true);
  stopPlacing();
  if (drawOn) exitDraw();
  PICKERS.forEach(id => {
    $(id)?.classList.remove('on');
  });
  syncPointer();
}

const PICKERS = ['shapePick', 'tplPick', 'stampWheel', 'stampPick'];
const pickerOpen = () => PICKERS.some(id => $(id)?.classList.contains('on'));

/** Any tool but the select arrow: placing, drawing, the pen or a lit tool button. */
export const toolInHand = () =>
  drawOn || !!placing || !!penT || !!$('tools').querySelector('[data-add]:not([data-add="pointer"]).on');

function syncPointer() {
  const p = $('tools').querySelector('[data-add="pointer"]');
  if (!p) return;
  $('tools').querySelector('[data-add="draw"]')?.classList.toggle('on', drawOn);
  p.classList.toggle('on', !toolInHand() && !pickerOpen());
}

// + Project / + Folder / + Board: the folder and board add into wherever you are: the folder you're in, or the project you're in
export function scope() {
  const at = homeAt;
  const f = at
    ? at.level === 'folder'
      ? appState.folders.find(x => x.id === at.id)
      : null
    : appState.folders.find(x => x.id === session.board?.folder);
  const p =
    at?.level === 'project'
      ? appState.projects.find(x => x.id === at.id)
      : at?.level === 'all'
        ? null
        : f && appState.projects.find(x => x.id === f.project);
  return { f, p };
}
export function init21() {
  {
    const mo = new MutationObserver(() => syncPointer());
    mo.observe($('tools'), { subtree: true, attributes: true, attributeFilter: ['class'] });
    mo.observe($('drawbar'), { attributes: true, attributeFilter: ['hidden'] });
    PICKERS.forEach(id => {
      $(id) && mo.observe($(id), { attributes: true, attributeFilter: ['class'] });
    });
  }
  countAsMenu(pickerOpen);

  $('tools').onclick = e => {
    const b = closestTo(e.target, '[data-add]');
    if (!b) return;
    const t = b.dataset.add ?? '';
    if (t === 'pointer') return toPointer();
    if (t === 'pen') return penT ? endPen(true) : startPen();
    if (penT) endPen(true); // picking another tool finishes the pen line, and drawing
    if (drawOn && t !== 'draw') exitDraw();
    if (t === 'vnote') {
      stopPlacing();
      return openVaultPicker();
    }
    if (t === 'image') return $('filePick').click();
    if (t === 'draw') return drawOn ? exitDraw() : enterDraw();
    if (t === 'stamp') {
      const on = !$('stampWheel').classList.contains('on');
      stopPlacing();
      const r = tbRect(b);
      ['stampWheel', 'stampPick'].forEach(id => {
        $(id).style.left = `${r.left + r.width / 2}px`;
      });
      renderWheel();
      $('stampWheel').classList.toggle('on', on);
      b.classList.toggle('on', on);
      $('mBubble').classList.remove('on');
      return;
    }
    if (t === 'shape') {
      const on = !$('shapePick').classList.contains('on');
      stopPlacing();
      const r = tbRect(b);
      $('shapePick').style.left = `${r.left + r.width / 2}px`;
      $('shapePick').classList.toggle('on', on);
      b.classList.toggle('on', on);
      $('mBubble').classList.remove('on');
      return;
    }
    if (t === 'tpl') {
      const on = !$('tplPick').classList.contains('on');
      stopPlacing();
      const r = tbRect(b);
      $('tplPick').style.left = `${r.left + r.width / 2}px`;
      $('tplPick').classList.toggle('on', on);
      b.classList.toggle('on', on);
      $('mBubble').classList.remove('on');
      if (on) {
        elementById('tpSearch', HTMLInputElement).value = '';
        filterTpl();
        setTimeout(() => $('tpSearch').focus(), 30);
      }
      return;
    }
    if (t === 'audio') return readyToRecord().then(ok => ok && startPlacing('audio'));
    startPlacing(t);
  };

  const pick = elementById('filePick', HTMLInputElement);
  pick.onchange = () => {
    const fs = [...(pick.files ?? [])],
      tgt = pick.dataset.into;
    delete pick.dataset.into;
    pick.value = '';
    const c = tgt && byId(tgt),
      v = fs.find(f => f.type.startsWith('video/'));
    if (c && c.type === 'video' && v) fillVideo(c, v);
    else addImages(fs);
  };

  const nameField = elementById('boardName', HTMLInputElement);
  nameField.oninput = () => {
    session.board.name = nameField.value || 'Untitled board';
    save();
  };
  nameField.onchange = () => offerRename(session.board);

  $('newBoard').onclick = async () => {
    const { f, p } = scope(),
      into = f || (p && foldersIn(p.id)[0]);
    if (into) return addBoardTo(into);
    const b = newBoard();
    await Fenmyr.save(b);
    closeHome();
    openBoard(b.id);
  };

  $('newFolder').onclick = async () => {
    const f = makeFolder(uniqueName(appState.folders, 'New folder'), scope().p?.id || null);
    await saveLib();
    await refreshBoards();
    renameNewest('.node.folder', f);
  };

  $('newProject').onclick = async () => {
    const p = makeProject(uniqueName(appState.projects, 'New project'));
    await saveLib();
    await refreshBoards();
    renameNewest('.node.project', p);
  };
}
