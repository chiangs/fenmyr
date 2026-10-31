// @ts-nocheck
import { byId } from '../canvas/wires.ts';
import { addImages } from '../cards/spotify.ts';
import { $, stage } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { filterTpl } from '../features/templates.ts';
import { closeHome, homeAt, openBoard } from '../library/home.ts';
import { newBoardIn } from '../library/nesting.ts';
import { refreshBoards, renameNewest, uniqueName } from '../library/rowMenu.ts';
import { foldersIn, makeFolder, makeProject, saveLib } from '../library/tree.ts';
import { readyToRecord } from '../media/devices.ts';
import { fillVideo } from '../media/video.ts';
import { newBoard } from '../model/boards.ts';
import { drawOn, enterDraw, exitDraw } from '../tools/draw.ts';
import { endPen, penT, startPen } from '../tools/pen.ts';
import { placing, startPlacing, stopPlacing } from '../tools/place.ts';
import { renderWheel } from '../tools/stamps.ts';
import { tbRect } from './toolbarConfig.ts';
import { openVaultPicker } from '../vault/ask.ts';
import { appState, session } from '../core/state.ts';

// links get a little paste box under the toolbar (the app can't show the browser's prompt)

// ---------- toolbar ----------
// the select arrow: puts down whatever tool you're holding (placing, drawing, the pen, a picker) so you're just selecting and moving. It lights up whenever no other tool is on
export function toPointer() {
  if (penT) endPen(true);
  stopPlacing();
  if (drawOn) exitDraw();
  ['shapePick', 'tplPick', 'stampWheel', 'stampPick'].forEach(id => $(id)?.classList.remove('on'));
  syncPointer();
}

function syncPointer() {
  const p = $('tools').querySelector('[data-add="pointer"]');
  if (!p) return;
  const busy =
    drawOn ||
    placing ||
    penT ||
    $('tools').querySelector('[data-add]:not([data-add="pointer"]).on') ||
    ['shapePick', 'tplPick', 'stampWheel', 'stampPick'].some(id => $(id)?.classList.contains('on'));
  p.classList.toggle('on', !busy);
}

// + Project / + Folder / + Board: the folder and board add into wherever you are: the folder you're in, or the project you're in
export function scope() {
  const f = homeAt
    ? homeAt.level === 'folder'
      ? appState.folders.find(x => x.id === homeAt.id)
      : null
    : appState.folders.find(x => x.id === session.board?.folder);
  const p =
    homeAt?.level === 'project'
      ? appState.projects.find(x => x.id === homeAt.id)
      : homeAt?.level === 'all'
        ? null
        : f && appState.projects.find(x => x.id === f.project);
  return { f, p };
}
export function init21() {
  {
    const mo = new MutationObserver(() => syncPointer());
    mo.observe($('tools'), { subtree: true, attributes: true, attributeFilter: ['class'] });
    mo.observe($('dock'), { attributes: true, attributeFilter: ['class'] });
    ['shapePick', 'tplPick', 'stampWheel', 'stampPick'].forEach(
      id => $(id) && mo.observe($(id), { attributes: true, attributeFilter: ['class'] }),
    );
  }

  $('tools').onclick = e => {
    const b = e.target.closest('[data-add]');
    if (!b) return;
    const t = b.dataset.add;
    if (t === 'pointer') return toPointer();
    if (t === 'pen') return penT ? endPen(true) : startPen();
    if (penT) endPen(true); // picking another tool finishes the pen line
    if (t === 'vnote') {
      stopPlacing();
      return openVaultPicker();
    }
    if (t === 'image') return $('filePick').click();
    if (t === 'draw') return drawOn ? exitDraw() : enterDraw();
    if (t === 'stamp') {
      const on = !$('stampWheel').classList.contains('on');
      stopPlacing();
      const r = tbRect(b),
        sr = stage.getBoundingClientRect();
      ['stampWheel', 'stampPick'].forEach(id => ($(id).style.left = r.left + r.width / 2 - sr.left + 'px'));
      renderWheel();
      $('stampWheel').classList.toggle('on', on);
      b.classList.toggle('on', on);
      $('mBubble').classList.remove('on');
      return;
    }
    if (t === 'shape') {
      const on = !$('shapePick').classList.contains('on');
      stopPlacing();
      const r = tbRect(b),
        sr = stage.getBoundingClientRect();
      $('shapePick').style.left = r.left + r.width / 2 - sr.left + 'px';
      $('shapePick').classList.toggle('on', on);
      b.classList.toggle('on', on);
      $('mBubble').classList.remove('on');
      return;
    }
    if (t === 'tpl') {
      const on = !$('tplPick').classList.contains('on');
      stopPlacing();
      const r = tbRect(b),
        sr = stage.getBoundingClientRect();
      $('tplPick').style.left = r.left + r.width / 2 - sr.left + 'px';
      $('tplPick').classList.toggle('on', on);
      b.classList.toggle('on', on);
      $('mBubble').classList.remove('on');
      if (on) {
        $('tpSearch').value = '';
        filterTpl();
        setTimeout(() => $('tpSearch').focus(), 30);
      }
      return;
    }
    if (t === 'audio') return readyToRecord().then(ok => ok && startPlacing('audio'));
    startPlacing(t);
  };

  $('filePick').onchange = e => {
    const fs = [...e.target.files],
      tgt = $('filePick').dataset.into;
    delete $('filePick').dataset.into;
    e.target.value = '';
    const c = tgt && byId(tgt),
      v = fs.find(f => f.type.startsWith('video/'));
    if (c && v) return fillVideo(c, v);
    addImages(fs);
  };

  $('boardName').oninput = e => {
    session.board.name = e.target.value || 'Untitled board';
    save();
  };

  $('newBoard').onclick = async () => {
    const { f, p } = scope(),
      into = f || (p && foldersIn(p.id)[0]);
    if (into) return newBoardIn(into.id);
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
