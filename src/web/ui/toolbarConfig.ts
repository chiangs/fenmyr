import { $ } from '../core/dom.ts';
import { session } from '../core/state.ts';
import { boardMenu } from '../features/export.ts';
import { JOIN_RESERVE } from '../myra/chatRules.ts';
import { renderSees } from '../myra/seesStrip.ts';
import { paintStatus } from '../myra/status.ts';
import { setTab } from '../settings/colors.ts';
import { settings } from '../settings/settings.ts';
import { applySettings } from '../settings/widgets.ts';
import { activeGrants, vaults } from '../vault/vaults.ts';
import { closestTo, esc, htmlIn } from './dom.ts';

let TB_DEFAULT: string[] = [];

// the HTML elements matching a selector, under root
const toolButton = (k: string) => {
  const b = $('tools').querySelector(`:scope > [data-add="${k}"]`);
  return b instanceof HTMLElement ? b : null;
};
const iconOf = (b: Element) => b.querySelector('svg')?.outerHTML || '';

const tbName = (b: HTMLElement) => (b.dataset.tip || b.getAttribute('aria-label') || '').split('·')[0]?.trim() ?? '';

// the Vault note tool only shows on a board that can read a vault
const vaultToolOn = () => {
  try {
    return !!(Fenmyr.native && session.board && vaults.length && activeGrants(session.board).length);
  } catch (_e) {
    return false;
  }
};

export function applyToolbar() {
  const box = $('tools'),
    hidden = new Set(settings.toolbar?.hidden ?? []);
  const order = (settings.toolbar?.order ?? []).filter(k => TB_DEFAULT.includes(k));
  TB_DEFAULT.forEach((k, i) => {
    if (!order.includes(k)) order.splice(Math.min(i, order.length), 0, k);
  }); // tools added in a later version slot in where they belong
  const end = $('zoom');
  order.forEach(k => {
    const b = toolButton(k);
    if (b) {
      box.insertBefore(b, end);
      b.hidden = hidden.has(k) || (k === 'vnote' && !vaultToolOn());
    }
  });
  document.body.dataset.tb = settings.tbSize || 'm';
  requestAnimationFrame(fitToolbar);
  try {
    renderSees();
    paintStatus();
  } catch (_e) {}
  return order;
}

// Settings → Toolbar: the tool list (switches + drag to reorder) and the icon size
export function renderTbList() {
  const L = $('setTbList');
  if (!L) return;
  const order = applyToolbar(),
    hidden = new Set(settings.toolbar?.hidden ?? []);
  L.innerHTML = order
    .map(k => {
      const b = toolButton(k);
      if (!b) return '';
      const off = hidden.has(k) ? ' off' : '',
        icon = iconOf(b),
        name = esc(tbName(b)),
        checked = hidden.has(k) ? '' : 'checked';
      return `<div class="tbe-row${off}" draggable="true" data-tb="${k}"><span class="tbe-grip">⋮⋮</span><span class="tbe-ic">${icon}</span><span class="tbe-name">${name}</span><input type="checkbox" class="tgl" ${checked} aria-label="Show ${name}"></div>`;
    })
    .join('');
}

const openToolbarSettings = () => {
  $('gearBtn').click();
  setTab('toolbar');
  renderTbList();
};

// A joined chat is worth tucking tools for only while Select and the first three tools (Note, Doc and Checklist by
// default) still show: a bar of Select alone costs more than a wide chat does.
const JOIN_KEEPS = 4;

// tools that don't fit tuck into ··· at the end: the bar ends 16 px inside the window, or 14 px before the right
// widgets where they reach down to it, so it never covers them. On a computer they also leave room for Myra's chat to
// open joined to them, open or not so nothing jumps, unless that would tuck past JOIN_KEEPS.
function fitToolbar() {
  const box = $('tools'),
    more = $('tbMore');
  if (!box || !more) return;
  const m = $('myra'),
    others = m?.offsetWidth && getComputedStyle(m).position !== 'absolute' ? m.getBoundingClientRect().width : 0; // only Myra's box shares the row
  const bar = $('dock').getBoundingClientRect(),
    widgets = htmlIn($('sideR'), ':scope > *')
      .filter(w => w.checkVisibility())
      .map(w => w.getBoundingClientRect()),
    end = widgets.some(w => w.bottom > bar.top) ? Math.min(...widgets.map(w => w.left)) - 14 : innerWidth - 16,
    room = end - bar.left - others,
    body = document.body.classList,
    desk = !body.contains('phone') && !body.contains('proto'),
    joinRoom = Math.min(room, innerWidth - JOIN_RESERVE - box.getBoundingClientRect().left),
    width = () => box.getBoundingClientRect().width; // to the fraction of a pixel, as the bar is laid out
  const fit = (limit: number, keep: number) => {
    box.querySelectorAll(':scope > .tb-over').forEach(b => {
      b.classList.remove('tb-over');
    });
    more.hidden = true;
    if (width() <= limit) return true;
    more.hidden = false;
    const shown = htmlIn(box, ':scope > [data-add]').filter(b => !b.hidden);
    for (let i = shown.length - 1; i >= keep && width() > limit; i--) shown[i]?.classList.add('tb-over');
    return width() <= limit;
  };
  if (!desk || !fit(joinRoom, JOIN_KEEPS)) fit(room, 1);
}

export const tbRect = (b: Element) => (b.classList.contains('tb-over') ? $('tbMore') : b).getBoundingClientRect();
export function init19() {
  // ---------- your toolbar: pick which tools show at the bottom and in what order (shortcuts keep working for hidden ones) ----------
  TB_DEFAULT = htmlIn($('tools'), ':scope > [data-add]').map(b => b.dataset.add ?? '');

  (() => {
    const L = $('setTbList');
    if (!L) return;
    const now = () => ({
      order: htmlIn(L, '.tbe-row').map(r => r.dataset.tb ?? ''),
      hidden: htmlIn(L, '.tbe-row')
        .filter(r => !r.querySelector('input')?.checked)
        .map(r => r.dataset.tb ?? ''),
    });
    const commit = () => {
      settings.toolbar = now();
      applySettings();
    };
    L.onchange = e => {
      if (e.target instanceof HTMLInputElement) {
        e.target.closest('.tbe-row')?.classList.toggle('off', !e.target.checked);
        commit();
      }
    };
    let dragging: HTMLElement | null = null;
    L.ondragstart = e => {
      dragging = closestTo(e.target, '.tbe-row', HTMLElement);
      if (!dragging) return;
      dragging.classList.add('drag');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', dragging.dataset.tb ?? '');
      }
    };
    L.ondragover = e => {
      if (!dragging) return;
      e.preventDefault();
      const r = closestTo(e.target, '.tbe-row', HTMLElement);
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
      over = htmlIn($('tools'), ':scope > .tb-over');
    boardMenu({ clientX: r.left, clientY: r.top - 8 - over.length * 36 }, [
      ...over.map(b => {
        const icon = iconOf(b),
          name = esc(tbName(b));
        return { label: `<span class="tbm-row">${icon}<span>${name}</span></span>`, run: () => b.click() };
      }),
      '-',
      { label: 'Customise toolbar…', run: openToolbarSettings },
    ]);
    $('rowMenu')?.classList.add('tb-menu');
  };

  const fitSoon = () => requestAnimationFrame(fitToolbar);
  addEventListener('resize', fitSoon);
  // the right widgets grow as Unsorted fills and shrink as one folds, and the bar keeps clear of them
  const widgetSizes = new ResizeObserver(fitSoon);
  for (const w of htmlIn(document, '#tray, #design, .box[data-box]')) widgetSizes.observe(w);
}
