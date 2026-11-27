import { $ } from '../core/dom.ts';
import { session } from '../core/state.ts';
import { boardMenu } from '../features/export.ts';
import { renderSees } from '../myra/seesStrip.ts';
import { paintStatus } from '../myra/status.ts';
import { setTab } from '../settings/colors.ts';
import { settings } from '../settings/settings.ts';
import { applySettings } from '../settings/widgets.ts';
import { activeGrants, vaults } from '../vault/vaults.ts';
import { closestTo, esc, htmlIn } from './dom.ts';
import { openLeftOfPanel } from './popover.ts';
import { PANEL, TOOLBAR } from './toolbarTable.ts';

const DEFAULT_ORDER = TOOLBAR.tools.map(t => t.id);

// the HTML elements matching a selector, under root
const toolButton = (k: string) => {
  const b = $('tools').querySelector(`:scope > [data-add="${k}"]`);
  return b instanceof HTMLElement ? b : null;
};
const iconOf = (b: Element) => b.querySelector('svg')?.outerHTML || '';

const nameOf = (b: HTMLElement) => TOOLBAR.tool(b.dataset.add ?? '')?.label ?? '';

// the Vault note tool only shows on a board that can read a vault
const vaultToolOn = () => {
  try {
    return !!(Fenmyr.native && session.board && vaults.length && activeGrants(session.board).length);
  } catch (_e) {
    return false;
  }
};

export function renderTools() {
  const more = $('tbMore');
  for (const t of TOOLBAR.tools) {
    const tip = t.key ? `${t.label} · ${t.key}` : t.label,
      b = document.createElement('button'),
      icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    b.dataset.add = t.id;
    b.setAttribute('aria-label', t.aria ?? tip);
    b.dataset.tip = tip;
    if (t.lit) b.className = 'on';
    if (t.toggle) b.ariaPressed = 'false';
    if (t.needs) b.hidden = true;
    icon.setAttribute('class', 'ic');
    icon.dataset.ico = t.icon;
    icon.setAttribute('width', '18');
    icon.setAttribute('height', '18');
    b.append(icon);
    more.before(b);
  }
  hydrateIcons($('tools'));
}

export function applyToolbar() {
  const box = $('tools'),
    hidden = new Set(settings.toolbar?.hidden ?? []);
  const order = (settings.toolbar?.order ?? []).filter(k => DEFAULT_ORDER.includes(k));
  DEFAULT_ORDER.forEach((k, i) => {
    if (!order.includes(k)) order.splice(Math.min(i, order.length), 0, k);
  }); // tools added in a later version slot in where they belong
  const end = $('tbMore');
  order.forEach(k => {
    const b = toolButton(k);
    if (b) {
      box.insertBefore(b, end);
      b.hidden = hidden.has(k) || (TOOLBAR.tool(k)?.needs === 'vault' && !vaultToolOn());
    }
  });
  document.body.dataset.tb = settings.tbSize || 'm';
  fitPanel();
  try {
    renderSees();
    paintStatus();
  } catch (_e) {}
  return order;
}

// Settings → Layout → Toolbar: the tool list (switches + drag to reorder) and the icon size
export function renderTbList() {
  const L = $('setTbList');
  if (!L) return;
  const order = applyToolbar(),
    hidden = new Set(settings.toolbar?.hidden ?? []);
  L.innerHTML = order
    .map(k => {
      const b = toolButton(k);
      if (!b) return '';
      const key = esc(TOOLBAR.tool(k)?.key ?? ''),
        off = hidden.has(k) ? ' off' : '',
        icon = iconOf(b),
        name = esc(nameOf(b)),
        keycap = key ? `<kbd class="keycap">${key}</kbd>` : '',
        checked = hidden.has(k) ? '' : 'checked';
      // a hidden tool's key stays as it is: its shortcut still works
      return `<div class="tbe-row${off}" draggable="true" data-tb="${k}"><span class="tbe-grip">⋮⋮</span><span class="tbe-ic">${icon}</span><span class="tbe-name">${name}</span><span class="tbe-key">${keycap}</span><input type="checkbox" class="tgl" ${checked} aria-label="Show ${name}"></div>`;
    })
    .join('');
}

const openToolbarSettings = () => {
  $('gearBtn').click();
  setTab('layout');
};

const idsOf = (bs: readonly HTMLElement[]) => bs.map(b => b.dataset.add ?? '');

// Each group starts a row under a hairline (.tb-start), and a tooltip in the last column ends at its button (.tb-end).
function markRows(shown: readonly HTMLElement[], cols: number) {
  const starts = new Set(TOOLBAR.starts(idsOf(shown))),
    more = $('tbMore');
  let col = 0;
  for (const b of shown) {
    const start = starts.has(b.dataset.add ?? '');
    if (start) col = 0;
    b.classList.toggle('tb-start', start);
    b.classList.toggle('tb-end', col === cols - 1);
    col = (col + 1) % cols;
  }
  more.classList.toggle('tb-end', !more.hidden && col === cols - 1);
}

// the most of the window's height the panel takes before tools tuck
const MAX_SHARE = 0.45;

/** Tucks tools into ··· in the table's tuck order while the panel is more than PANEL.maxRows rows or MAX_SHARE of the
 *  window tall. Rows come from the groups and the columns, so a tool never tucks for width. One tool always stays.
 *  It runs a frame after the panel resizes, so a caller that measures the panel straight after changing its room runs
 *  it first. */
export function fitPanel() {
  const box = $('tools'),
    more = $('tbMore');
  for (const b of htmlIn(box, ':scope > .tb-over')) b.classList.remove('tb-over');
  more.hidden = true;
  let shown = htmlIn(box, ':scope > [data-add]').filter(b => !b.hidden);
  // in a phone's sheet, or hidden, every tool shows; the panel fits again when it is back
  const laidOut = !document.body.classList.contains('phone') && box.checkVisibility(),
    cols = laidOut ? getComputedStyle(box).gridTemplateColumns.split(' ').length : 1,
    queue = laidOut ? TOOLBAR.tuckOrder(idsOf(shown)).slice(0, -1) : [];
  markRows(shown, cols);
  for (const id of queue) {
    if (TOOLBAR.rows(idsOf(shown), cols, !more.hidden) <= PANEL.maxRows && box.offsetHeight <= innerHeight * MAX_SHARE)
      break;
    shown.find(b => b.dataset.add === id)?.classList.add('tb-over');
    shown = shown.filter(b => b.dataset.add !== id);
    more.hidden = false;
    markRows(shown, cols);
  }
}

/** Runs every frame, so it writes only on a change: ··· lights, and reads as pressed, while a tool tucked in it is in
 *  hand. A class set from here, not a :has() rule, which made every style recalc dearer. */
export function syncMore() {
  const more = $('tbMore'),
    held = !!$('tools').querySelector(':scope > .tb-over.on');
  // putting a tool down clears every lit button in the bar, ··· too, so each is checked on its own
  if (more.classList.contains('on') !== held) more.classList.toggle('on', held);
  if ((more.ariaPressed === 'true') !== held) more.ariaPressed = held ? 'true' : null;
}

export function init19() {
  // ---------- your toolbar: pick which tools show at the bottom and in what order (shortcuts keep working for hidden ones) ----------
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
    openLeftOfPanel($('rowMenu'), closestTo(e.target, 'button') ?? $('tools'));
  });
  // pickers that open from a tool open from ··· when the tool is tucked away
  $('tbMore').onclick = e => {
    e.stopPropagation();
    const over = htmlIn($('tools'), ':scope > .tb-over');
    boardMenu({ clientX: 0, clientY: 0 }, [
      ...over.map(b => {
        const icon = iconOf(b),
          name = esc(nameOf(b));
        return {
          label: `<span class="tbm-row">${icon}<span>${name}</span></span>`,
          run: () => b.click(),
          checked: b.classList.contains('on'),
        };
      }),
      '-',
      { label: 'Customise toolbar…', run: openToolbarSettings },
    ]);
    $('rowMenu').classList.add('tb-menu');
    openLeftOfPanel($('rowMenu'), $('tbMore'));
  };

  const fitSoon = () => requestAnimationFrame(fitPanel);
  addEventListener('resize', fitSoon);
  // the right widgets start under the panel, however many rows it has; it fits again once it shows after Home
  new ResizeObserver(([e]) => {
    const h = e?.borderBoxSize[0]?.blockSize;
    if (h) document.body.style.setProperty('--tools-h', `${h}px`);
    fitSoon();
  }).observe($('tools'));
}
