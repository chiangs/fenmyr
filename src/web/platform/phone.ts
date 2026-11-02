import { fit, toWorld } from '../canvas/handles.ts';
import { applyView } from '../canvas/view.ts';
import { renderTray, selectOnly, takeFromTray } from '../canvas/wires.ts';
import { $, stage } from '../core/dom.ts';
import { myraOpen } from '../myra/chatWindow.ts';
import { goos } from '../myra/goos.ts';
import { lyFlash, renderLayers } from '../panels/layers.ts';
import { drawOn } from '../tools/draw.ts';
import { placing } from '../tools/place.ts';
import { session } from '../core/state.ts';
import { child, closestTo } from '../ui/dom.ts';

export type Phone = { on: boolean; set(on: boolean): void; hide(): void; count(): void; init(): void };
type Sheet = { title: string; tabs: [label: string, get: () => HTMLElement | null][] };
export let phone: Phone;

const box = (k: string) => {
  const el = document.querySelector(`.box[data-box="${k}"]`);
  return el instanceof HTMLElement ? el : null;
};
// the hub's buttons, each with the sheet it opens
const sheetButtons = (hub: HTMLElement) =>
  [...hub.querySelectorAll('[data-sheet]')].filter(b => b instanceof HTMLElement);
export function init62() {
  // ---------- phone: the board gets the whole screen. Panels slide up as bottom sheets, and the bottom bar becomes a hub ----------
  // The sheets hold the app's real panels (moved in while on a phone, put back on a bigger screen), so everything works the same.
  phone = (() => {
    const mq = matchMedia('(max-width: 700px)'),
      home = new Map<HTMLElement, [ParentNode | null, Node | null]>();
    const hub = document.createElement('div');
    hub.className = 'hub';
    hub.id = 'hub';
    hub.innerHTML =
      `<button data-sheet="boards">${Icon('boards')}<span>Boards</span></button>` +
      `<button data-sheet="layers">${Icon('layers')}<span>Layers</span></button>` +
      `<button class="hub-add" data-sheet="add" aria-label="Add something">${Icon('plus')}</button>` +
      `<button data-sheet="tray">${Icon('tray')}<span>Unsorted</span><b class="hub-n" id="hubN"></b></button>` +
      `<button data-hub="myra"><canvas id="hubGoo" width="64" height="56"></canvas><span>Myra</span></button>`;
    const sh = document.createElement('div');
    sh.className = 'sheet';
    sh.id = 'sheet';
    sh.innerHTML =
      '<div class="sh-veil"></div><div class="sh-panel" role="dialog"><div class="sh-grab"><i></i></div><div class="sh-head"><b id="shTitle"></b><div class="sh-tabs" id="shTabs"></div><button class="sh-x" aria-label="Close">×</button></div><div class="sh-body" id="shBody"></div></div>';
    document.body.appendChild(sh);
    const hubGoo = Goo(child(hub, '#hubGoo', HTMLCanvasElement));
    goos.push(hubGoo);
    const SHEETS: Record<string, Sheet> = {
      boards: { title: 'Boards', tabs: [['Boards', () => box('boards')]] },
      layers: { title: 'Layers', tabs: [['Layers', () => box('layers')]] },
      add: {
        title: 'Add',
        tabs: [
          ['Basics', () => $('tools')],
          ['Wireframe', () => $('design')],
          ['Colours', () => box('colors')],
        ],
      },
      tray: { title: 'Unsorted', tabs: [['Ideas', () => $('tray')]] },
    };
    let open: string | null = null;
    // move a real panel into the sheet (remembering where it lived) or put it back
    const adopt = (el: HTMLElement) => {
      if (!home.has(el)) home.set(el, [el.parentNode, el.nextSibling]);
    };
    const restoreAll = () =>
      home.forEach(([p, n], el) => {
        p?.insertBefore(el, n && n.parentNode === p ? n : null);
        el.classList.remove('in-sheet');
      });
    function show(name: string, t = 0) {
      const S0 = SHEETS[name];
      if (!S0) return;
      open = name;
      const S = {
        ...S0,
        tabs: S0.tabs.filter(([, get]) => {
          const el = get();
          return el && !el.classList.contains('wg-off');
        }),
      }; // widgets turned off in Settings stay out of the sheets too
      $('shTitle').textContent = S.title;
      const tabButton = ([label]: Sheet['tabs'][number], i: number) => {
        const on = i === t ? 'on' : '';
        return `<button data-t="${i}" class="${on}">${label}</button>`;
      };
      $('shTabs').innerHTML = S.tabs.length > 1 ? S.tabs.map(tabButton).join('') : '';
      const body = $('shBody');
      [...body.children].forEach(c => c.classList.remove('shown'));
      S.tabs.forEach(([, get], i) => {
        const el = get();
        if (!el) return;
        adopt(el);
        if (el.parentNode !== body) body.appendChild(el);
        el.classList.add('in-sheet');
        el.classList.toggle('shown', i === t);
      });
      if (name === 'tray') $('tray').classList.remove('closed');
      sh.classList.add('on');
      for (const b of sheetButtons(hub)) b.classList.toggle('on', b.dataset.sheet === name);
      if (name === 'layers') renderLayers();
    }
    function hide() {
      open = null;
      sh.classList.remove('on');
      child(sh, '.sh-panel').style.transform = '';
      for (const b of sheetButtons(hub)) b.classList.remove('on');
    }
    hub.addEventListener('click', e => {
      const b = closestTo(e.target, '[data-sheet], [data-hub]');
      if (!b) return;
      const sheet = b.dataset.sheet ?? '';
      if (b.dataset.hub === 'myra') {
        hide();
        hubGoo.hop();
        return myraOpen(!$('myra').classList.contains('chat'));
      }
      if (open === sheet) return hide();
      myraOpen(false);
      show(sheet);
    });
    $('shTabs').onclick = e => {
      const b = closestTo(e.target, '[data-t]');
      if (b && open) show(open, Number(b.dataset.t));
    };
    child(sh, '.sh-veil').onclick = hide;
    child(sh, '.sh-x').onclick = hide;
    // drag the sheet down by its handle to close it
    {
      const grab = child(sh, '.sh-grab'),
        panel = child(sh, '.sh-panel');
      let y0: number | null = null,
        dy = 0;
      grab.addEventListener('pointerdown', e => {
        y0 = e.clientY;
        dy = 0;
        grab.setPointerCapture(e.pointerId);
        panel.style.transition = 'none';
      });
      grab.addEventListener('pointermove', e => {
        if (y0 === null) return;
        dy = Math.max(0, e.clientY - y0);
        panel.style.transform = `translateY(${dy}px)`;
      });
      grab.addEventListener('pointerup', () => {
        if (y0 === null) return;
        y0 = null;
        panel.style.transition = '';
        if (dy > 90) hide();
        else panel.style.transform = '';
      });
    }
    // picking something to place closes the sheet, so the next tap lands on the board
    const ready = () =>
      placing || drawOn || ['shapePick', 'tplPick', 'stampWheel'].some(id => $(id).classList.contains('on'));
    $('shBody').addEventListener('click', () => {
      setTimeout(() => ready() && hide(), 0);
      setTimeout(() => open && ready() && hide(), 700);
    }); // the second look catches tools that get ready a moment later (a voice memo asks for the mic first)
    // layers and boards: once you pick one, get out of the way so you can see it
    box('layers')?.addEventListener('click', e => {
      if (phone.on && closestTo(e.target, '.ly') && !closestTo(e.target, '.ly-tw, .ly-b')) setTimeout(hide, 60);
    });
    box('boards')?.addEventListener('click', e => {
      if (phone.on && closestTo(e.target, '.board-row')) setTimeout(hide, 60);
    });
    // Unsorted on a phone: tap an idea to drop it in the middle of the board (Myra points it out)
    $('trayList').addEventListener(
      'pointerdown',
      e => {
        if (!phone.on) return;
        const it = closestTo(e.target, '.tray-item');
        if (!it) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        const c = session.board.tray.find(x => x.id === it.dataset.id);
        if (!c) return;
        const r = stage.getBoundingClientRect(),
          w = toWorld(r.left + r.width / 2, r.top + r.height * 0.42);
        const got = takeFromTray(c, { x: w.x - c.w / 2, y: w.y - c.h / 2 });
        renderTray();
        hide();
        selectOnly(got.map(m => m.id));
        lyFlash(got.map(m => m.id));
      },
      true,
    );
    function set(on: boolean) {
      phone.on = on;
      document.body.classList.toggle('phone', on);
      if (on) {
        $('dock').prepend(hub);
        // no keyboard on a phone, so just the names
        for (const b of $('tools').querySelectorAll('[data-tip]'))
          if (b instanceof HTMLElement) b.dataset.name = (b.dataset.tip ?? '').split(' · ')[0];
        if (session.board?.cards.length && session.view.z < 0.6) {
          fit(session.board.cards, 40, 1);
          applyView();
        }
      } // start where the cards are, at a size you can read
      else {
        hide();
        restoreAll();
        hub.remove();
      }
      child(hub, '#hubN').textContent = String(session.board?.tray?.length || '');
    }
    mq.addEventListener('change', e => set(e.matches));
    const bar = $('selbar');
    bar.addEventListener(
      'scroll',
      () => bar.classList.toggle('end', bar.scrollLeft + bar.clientWidth >= bar.scrollWidth - 4),
      { passive: true },
    );
    return {
      on: false,
      set,
      hide,
      count: () => {
        child(hub, '#hubN').textContent = String(session.board?.tray?.length || '');
      },
      init: () => set(mq.matches),
    };
  })();

  window.__phone = phone;
}
