// @ts-nocheck
import { keepOnScreen } from '../ui/popover.ts';
import { cardEl, removeOnOutsidePress } from '../ui/dom.ts';
import { TILTS, renderCard } from '../canvas/render.ts';
import { applyView } from '../canvas/view.ts';
import { byId, renderWires, selectOnly } from '../canvas/wires.ts';
import { offerFill, spotsIn } from '../cards/imageFill.ts';
import { kanbanMenu } from '../cards/kanban.ts';
import { tilt, uid } from '../core/base.ts';
import { $, stage } from '../core/dom.ts';
import { remember, save } from '../core/history.ts';
import { endEdit } from './tags.ts';
import { saveWithDialog } from './templates.ts';
import { DL } from '../myra/chat.ts';
import { removeSelected } from '../myra/helpers.ts';
import { selCards } from '../selbar/selbar.ts';
import { applyColors } from '../settings/colors.ts';
import { chirp, say } from '../settings/licenses.ts';
import { addCard } from '../tools/penEdit.ts';
import { placing, stopPlacing } from '../tools/place.ts';
import { tintPicker } from '../ui/colorPicker.ts';
import { openVaultPicker } from '../vault/ask.ts';
import { editVaultAccess } from '../vault/vaults.ts';
import { groupSel, restack } from '../wireframe/pieces.ts';
import { makeSection, renameSection } from '../wireframe/sections.ts';
import { groupOf, onFrame, removeSection } from '../wireframe/tilt.ts';
import { session } from '../core/state.ts';

// ---------- export: right-click a card (or the empty board) to save it as an image or PDF ----------
const nextFrame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

async function exportCards(cs, name, pdf) {
  if (!cs.length) return say('Nothing to export yet ✦', 2500);
  if (Fenmyr.web) return say('Saving images and PDFs works in the desktop app ✦', 0, DL);
  const all = new Set(cs);
  cs.forEach(c => {
    if (c.type === 'coll') (c.kids || []).forEach(k => byId(k) && all.add(byId(k)));
    if (c.type === 'frame') onFrame(c).forEach(k => all.add(k));
  });
  const list = [...all],
    x0 = Math.min(...list.map(c => c.x)) - 24,
    y0 = Math.min(...list.map(c => c.y)) - 40,
    x1 = Math.max(...list.map(c => c.x + c.w)) + 24,
    y1 = Math.max(...list.map(c => c.y + c.h)) + 24;
  const keep = { ...session.view },
    keepSel = [...session.sel],
    r = stage.getBoundingClientRect(),
    bw = x1 - x0,
    bh = y1 - y0;
  selectOnly([]);
  session.selWire = null;
  endEdit();
  renderWires();
  document.body.classList.add('exporting');
  const z = Math.min((r.width - 60) / bw, (r.height - 60) / bh, 2);
  session.view = { x: (r.width - bw * z) / 2 - x0 * z, y: (r.height - bh * z) / 2 - y0 * z, z };
  applyView();
  await nextFrame();
  await new Promise(res => setTimeout(res, 150));
  try {
    const saved = await Fenmyr.exportRect({
      x: r.left + (r.width - bw * z) / 2,
      y: r.top + (r.height - bh * z) / 2,
      w: bw * z,
      h: bh * z,
      name,
      pdf,
      scale: Math.min(4, 2 / Math.min(z, 1)),
    });
    if (saved) chirp(`Saved “${saved}” ✦`, 3500);
  } catch (e) {
    say(e.message, 4000);
  } finally {
    document.body.classList.remove('exporting');
    session.view = keep;
    applyView();
    selectOnly(keepSel);
  }
}

export function boardMenu(e, items) {
  $('rowMenu')?.remove();
  const m = document.createElement('div');
  m.id = 'rowMenu';
  m.className = 'row-menu';
  m.style.left = e.clientX + 'px';
  m.style.top = e.clientY + 'px';
  m.innerHTML = items
    .map((it, i) =>
      it === '-'
        ? '<span class="rm-sep"></span>'
        : `<button data-i="${i}" class="${it.danger ? 'danger' : ''}">${it.label}</button>`,
    )
    .join('');
  document.body.appendChild(m);
  keepOnScreen(m);
  m.onclick = ev => {
    const b = ev.target.closest('[data-i]');
    if (!b) return;
    m.remove();
    items[+b.dataset.i].run();
  };
  removeOnOutsidePress(m);
}

export const cardName = cs =>
  (cs.length === 1
    ? cs[0].name ||
      cs[0].text ||
      cs[0].title ||
      cs[0].label ||
      { image: 'Image', stamp: 'Stamp', shape: 'Shape' }[cs[0].type] ||
      'Card'
    : `${session.board.name} – ${cs.length} cards`
  )
    .toString()
    .slice(0, 60)
    .trim() || 'Card';
export function init43() {
  stage.addEventListener('contextmenu', e => {
    // holding something (a sticker, a note to place, a shape) or a picker is open: a right-click just puts it down, like Esc
    if (placing || ['stampWheel', 'stampPick', 'shapePick', 'tplPick'].some(id => $(id).classList.contains('on'))) {
      e.preventDefault();
      stopPlacing();
      return;
    }
    if (e.target.closest('.dock, .side, .tray, .top, .home, .docview, .cpop, .settings')) return;
    e.preventDefault();
    let el = document.elementFromPoint(e.clientX, e.clientY)?.closest('.card'); // the pointer may be captured, so look at what's really under it
    // things are selected and you right-click empty board: the menu is still about what you selected (click empty board first to get the board's own menu)
    if (!el && session.sel.size) el = cardEl([...session.sel][0]);
    const kh = el && document.elementFromPoint(e.clientX, e.clientY)?.closest('.kb-h'),
      ks = kh && byId(el.dataset.id);
    if (ks?.kanban) {
      selectOnly([ks.id]);
      return kanbanMenu(e, ks, +kh.dataset.k);
    }
    if (el) {
      if (!session.sel.has(el.dataset.id)) selectOnly(groupOf(el.dataset.id));
      const cs = selCards(); // like a click: a grouped piece means its group, unless you picked the piece
      boardMenu(e, [
        ...(cs.length > 1 && !cs.every(c => c.group && c.group === cs[0].group)
          ? [
              {
                label: 'Group  ⌘G',
                run: () => {
                  remember();
                  groupSel(true);
                },
              },
            ]
          : []),
        ...(cs.some(c => c.group)
          ? [
              {
                label: 'Ungroup  ⇧⌘G',
                run: () => {
                  remember();
                  groupSel(false);
                },
              },
            ]
          : []),
        ...(!(cs.length === 1 && cs[0].type === 'section')
          ? [{ label: 'Create section  ⌥⌘G', run: () => makeSection(cs) }]
          : []),
        ...(cs.length === 1 && cs[0].type === 'section'
          ? [{ label: 'Rename section', run: () => renameSection(cs[0]) }]
          : []),
        ...(cs.some(c => c.type === 'section')
          ? [{ label: 'Remove section', run: () => removeSection(cs.filter(c => c.type === 'section')) }]
          : []),
        ...(cs.some(c => TILTS(c) && Math.round(c.type === 'stamp' && !c.tilted ? 0 : c.r || 0))
          ? [
              {
                label: cs.length > 1 ? 'Reset tilts' : 'Reset tilt',
                run: () => {
                  remember();
                  cs.filter(TILTS).forEach(c => {
                    c.r = 0;
                    c.tilted = true;
                    renderCard(c);
                  });
                  selectOnly(cs.map(c => c.id));
                  $('selbar').dataset.key = '';
                  save();
                },
              },
            ]
          : []),
        { label: 'Bring to front  ⇧⌘]', run: () => restack('front') },
        { label: 'Bring forward  ⌘]', run: () => restack('forward') },
        { label: 'Send backward  ⌘[', run: () => restack('backward') },
        { label: 'Send to back  ⇧⌘[', run: () => restack('back') },
        '-',
        { label: 'Save as template', run: () => saveWithDialog(cs.map(c => c.id)) },
        { label: 'Export as image', run: () => exportCards(cs, cardName(cs), false) },
        { label: 'Export as PDF', run: () => exportCards(cs, cardName(cs), true) },
        ...(spotsIn(cs).length
          ? [
              {
                label: `Fill ${spotsIn(cs).length} image spot${spotsIn(cs).length > 1 ? 's' : ''}…`,
                run: () => offerFill(spotsIn(cs)),
              },
            ]
          : []),
        '-',
        {
          label: 'Duplicate',
          run: () => {
            const gm = {},
              copies = cs
                .filter(c => c.type !== 'coll')
                .map(c =>
                  Object.assign(JSON.parse(JSON.stringify(c)), { id: uid(), r: tilt(), x: c.x + 30, y: c.y + 30 }),
                );
            copies.forEach(c => {
              if (c.group) c.group = gm[c.group] || (gm[c.group] = uid());
            });
            copies.forEach(c => addCard(c));
            selectOnly(copies.map(c => c.id));
          },
        },
        { label: 'Delete', danger: true, run: () => removeSelected() },
      ]);
    } else
      boardMenu(e, [
        { label: 'Background colour…', run: () => tintPicker('bg', { x: e.clientX + 12, y: e.clientY - 40 }, true) },
        ...(session.board.bg
          ? [
              {
                label: 'Use the default background',
                run: () => {
                  delete session.board.bg;
                  save();
                  applyColors();
                },
              },
            ]
          : []),
        '-',
        { label: 'Save board as template', run: () => saveWithDialog(null) },
        ...(Fenmyr.native
          ? [
              { label: 'Add a note from a vault…', run: openVaultPicker },
              { label: 'Vault access for this board…', run: () => editVaultAccess('board', session.board) },
            ]
          : []),
        { label: 'Export board as image', run: () => exportCards(session.board.cards, session.board.name, false) },
        { label: 'Export board as PDF', run: () => exportCards(session.board.cards, session.board.name, true) },
      ]);
  });
}
