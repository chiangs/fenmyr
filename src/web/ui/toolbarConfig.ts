// @ts-nocheck
import { esc } from '../canvas/render.ts';
import { $ } from '../core/dom.ts';
import { boardMenu } from '../features/export.ts';
import { setTab } from '../settings/colors.ts';
import { settings } from '../settings/settings.ts';
import { applySettings } from '../settings/widgets.ts';
import { updateVaultChip } from '../vault/ask.ts';
import { activeGrants, vaults } from '../vault/vaults.ts';
import { session } from '../core/state.ts';
let TB_DEFAULT;

const tbName = b => (b.dataset.tip || b.getAttribute('aria-label') || '').split('·')[0].trim();

// the Vault note tool only shows on a board that can read a vault
const vaultToolOn = () => {
  try {
    return !!(Fenmyr.native && session.board && vaults.length && activeGrants(session.board).length);
  } catch (e) {
    return false;
  }
};

export function applyToolbar() {
  const box = $('tools'),
    cfg = settings.toolbar || {},
    hidden = new Set(cfg.hidden || []);
  const order = (cfg.order || []).filter(k => TB_DEFAULT.includes(k));
  TB_DEFAULT.forEach((k, i) => {
    if (!order.includes(k)) order.splice(Math.min(i, order.length), 0, k);
  }); // tools added in a later version slot in where they belong
  const end = $('zoom');
  order.forEach(k => {
    const b = box.querySelector(`:scope > [data-add="${k}"]`);
    if (b) {
      box.insertBefore(b, end);
      b.hidden = hidden.has(k) || (k === 'vnote' && !vaultToolOn());
    }
  });
  document.body.dataset.tb = settings.tbSize || 'm';
  requestAnimationFrame(fitToolbar);
  try {
    updateVaultChip();
  } catch (e) {}
  return order;
}

// Settings → Toolbar: the tool list (switches + drag to reorder) and the icon size
export function renderTbList() {
  const L = $('setTbList');
  if (!L) return;
  const order = applyToolbar(),
    hidden = new Set((settings.toolbar || {}).hidden || []);
  L.innerHTML = order
    .map(k => {
      const b = $('tools').querySelector(`:scope > [data-add="${k}"]`);
      if (!b) return '';
      return `<div class="tbe-row${hidden.has(k) ? ' off' : ''}" draggable="true" data-tb="${k}"><span class="tbe-grip">⋮⋮</span><span class="tbe-ic">${b.querySelector('svg')?.outerHTML || ''}</span><span class="tbe-name">${esc(tbName(b))}</span><input type="checkbox" class="tgl" ${hidden.has(k) ? '' : 'checked'} aria-label="Show ${esc(tbName(b))}"></div>`;
    })
    .join('');
}

const openToolbarSettings = () => {
  $('gearBtn').click();
  setTab('toolbar');
  renderTbList();
};

// tools that don't fit the screen tuck into ··· at the end (never a toolbar wider than the window)
function fitToolbar() {
  const box = $('tools'),
    more = $('tbMore'),
    dock = $('dock');
  if (!box || !more) return;
  box.querySelectorAll(':scope > .tb-over').forEach(b => b.classList.remove('tb-over'));
  more.hidden = true;
  const m = $('myra'),
    others = m && m.offsetWidth && getComputedStyle(m).position !== 'absolute' ? m.offsetWidth + 10 : 0; // only Myra's pill shares the row
  const room = innerWidth - 32 - others;
  if (box.offsetWidth <= room) return;
  more.hidden = false;
  const shown = [...box.querySelectorAll(':scope > [data-add]')].filter(b => !b.hidden);
  for (let i = shown.length - 1; i > 0 && box.offsetWidth > room; i--) shown[i].classList.add('tb-over');
}

export const tbRect = b => (b.classList.contains('tb-over') ? $('tbMore') : b).getBoundingClientRect();
export function init19() {
  // ---------- your toolbar: pick which tools show at the bottom and in what order (shortcuts keep working for hidden ones) ----------
  TB_DEFAULT = [...$('tools').querySelectorAll(':scope > [data-add]')].map(b => b.dataset.add);

  (() => {
    const L = $('setTbList');
    if (!L) return;
    const now = () => ({
      order: [...L.querySelectorAll('.tbe-row')].map(r => r.dataset.tb),
      hidden: [...L.querySelectorAll('.tbe-row')].filter(r => !r.querySelector('input').checked).map(r => r.dataset.tb),
    });
    const commit = () => {
      settings.toolbar = now();
      applySettings();
    };
    L.onchange = e => {
      if (e.target.matches('input')) {
        e.target.closest('.tbe-row').classList.toggle('off', !e.target.checked);
        commit();
      }
    };
    let dragging = null;
    L.ondragstart = e => {
      dragging = e.target.closest('.tbe-row');
      if (!dragging) return;
      dragging.classList.add('drag');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', dragging.dataset.tb);
    };
    L.ondragover = e => {
      if (!dragging) return;
      e.preventDefault();
      const r = e.target.closest('.tbe-row');
      if (!r || r === dragging) return;
      const box = r.getBoundingClientRect();
      L.insertBefore(dragging, e.clientY < box.top + box.height / 2 ? r : r.nextSibling);
    };
    L.ondragend = () => {
      if (!dragging) return;
      dragging.classList.remove('drag');
      dragging = null;
      commit();
    };
    $('tbReset').onclick = () => {
      delete settings.toolbar;
      settings.tbSize = 'm';
      applySettings();
      renderTbList();
    };
  })();

  $('tools').addEventListener('contextmenu', e => {
    e.preventDefault();
    e.stopPropagation();
    boardMenu(e, [{ label: 'Customise toolbar…', run: openToolbarSettings }]);
  });
  // pickers that open from a tool open from ··· when the tool is tucked away
  $('tbMore').onclick = e => {
    e.stopPropagation();
    const r = $('tbMore').getBoundingClientRect(),
      over = [...$('tools').querySelectorAll(':scope > .tb-over')];
    boardMenu({ clientX: r.left, clientY: r.top - 8 - over.length * 36 }, [
      ...over.map(b => ({
        label: `<span class="tbm-row">${b.querySelector('svg')?.outerHTML || ''}<span>${esc(tbName(b))}</span></span>`,
        run: () => b.click(),
      })),
      '-',
      { label: 'Customise toolbar…', run: openToolbarSettings },
    ]);
    $('rowMenu')?.classList.add('tb-menu');
  };

  addEventListener('resize', () => requestAnimationFrame(fitToolbar));
}
