import type { CaelestiaScheme, UsageTotals } from '../../shared/ops.ts';
import { checkUpdate } from '../app/updates.ts';
import { byId, selectOnly } from '../canvas/wires.ts';
import { $ } from '../core/dom.ts';
import { appState, session } from '../core/state.ts';
import { devName, openMedia } from '../media/devices.ts';
import { camOff, camOn, cams } from '../media/video.ts';
import { paintBd } from '../myra/birthday.ts';
import { showConnections } from '../myra/helpers.ts';
import { renderGitSetup } from '../repo/setup.ts';
import { placing, stopPlacing } from '../tools/place.ts';
import { luminance, mixHex } from '../ui/color.ts';
import { child, closestTo, elementById, esc, htmlIn } from '../ui/dom.ts';
import { PRESETS } from '../ui/palette.ts';
import { renderTbList } from '../ui/toolbarConfig.ts';
import { renderVaults } from '../vault/vaults.ts';
import { myCur, paintCursor } from './cursor.ts';
import { applyPanelH, fitSides, gripBulge, panelMin } from './panelHeights.ts';
import { settings } from './settings.ts';
import { applySettings } from './widgets.ts';

type Mode = 'light' | 'dark';
export const htmlOrNull = (el: Element | null) => (el instanceof HTMLElement ? el : null);

// ---------- your colors: the board, its dots, the panels and the accent, set per light/dark; one board can also have its own background ----------
const COLOR_DEFAULTS: Record<Mode, Record<string, string>> = {
  light: { bg: '#faf7f2', dot: '#e4dccf', panel: '#ffffff', accent: '#e88a24' },
  dark: { bg: '#12100d', dot: '#332d25', panel: '#242019', accent: '#e88a24' },
};

const modeName = (): Mode => (document.body.classList.contains('dark') ? 'dark' : 'light');

export const following = () => !!(settings.caelestia && appState.cae);

function caeColors({ colours: c }: CaelestiaScheme) {
  const picked: Record<string, string | undefined> = {
    bg: c.surface,
    dot: c.outlineVariant || c.outline,
    panel: c.surfaceContainer || c.surface,
    accent: c.primary,
  };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(picked)) if (v) out[k] = v;
  return out;
}

export const myColors = (): Record<string, string> => {
  const cae = appState.cae;
  if (settings.caelestia && cae) return caeColors(cae);
  return settings.colors[modeName()];
};

const boardBg = () => (typeof session.board?.bg === 'string' ? session.board.bg : '');
export const colorOf = (k: string) => (k === 'bg' && boardBg()) || myColors()[k] || COLOR_DEFAULTS[modeName()][k] || '';

export function applyColors() {
  const B = document.body.style,
    mine = myColors(),
    bg = colorOf('bg'),
    darkBg = luminance(bg) < 0.2;
  B.setProperty('--board', bg);
  if (mine.dot) B.setProperty('--dot', mine.dot);
  else if (darkBg !== (modeName() === 'dark')) B.setProperty('--dot', mixHex(bg, darkBg ? '#ffffff' : '#000000', 0.13));
  else B.removeProperty('--dot');
  document.body.classList.toggle('tint-panels', !!mine.panel);
  if (mine.panel) B.setProperty('--panel', mine.panel);
  else B.removeProperty('--panel');
  document.body.classList.toggle('panel-dark', !!mine.panel && luminance(mine.panel) < 0.2);
  if (mine.accent) {
    B.setProperty('--pink-deep', mine.accent);
    B.setProperty('--pink', mixHex(mine.accent, '#ffffff', 0.3));
    B.setProperty('--blush', mixHex(mine.accent, modeName() === 'dark' ? '#1d1a16' : '#ffffff', 0.82));
  } else
    ['--pink-deep', '--pink', '--blush'].forEach(v => {
      B.removeProperty(v);
    });
  document.body.classList.toggle('board-dark', darkBg);
  document.body.classList.toggle('board-light', !darkBg && modeName() === 'dark');
  for (const b of htmlIn(document, '[data-col]'))
    b.style.setProperty('--chip', b.dataset.col === 'cursor' ? settings.cursor : colorOf(b.dataset.col ?? ''));
  const reset = document.getElementById('colReset');
  if (reset) reset.hidden = !Object.keys(mine).length;
  paintCursor();
  // settings: name, cursor colors and the little preview
  const nameIn = document.getElementById('setName');
  if (nameIn instanceof HTMLInputElement && document.activeElement !== nameIn) nameIn.value = settings.name || '';
  paintBd();
  const cursors = PRESETS.cursor ?? [],
    swatches = document.getElementById('curColors');
  if (swatches) {
    const anyOn = cursors.includes(settings.cursor) ? '' : ' on',
      swatch = (h: string) => {
        const name = h.toUpperCase(),
          on = settings.cursor === h ? 'on' : '';
        return `<button data-cc="${h}" title="${name}" style="background:${h}" class="${on}"></button>`;
      };
    const dots = cursors.map(swatch).join('');
    swatches.innerHTML = `${dots}<button class="rand${anyOn}" data-col="cursor" title="Any colour"></button>`;
  }
  const pv = document.querySelector('#curPrev .mcur');
  if (pv instanceof HTMLElement) {
    pv.innerHTML = myCur.innerHTML;
    pv.setAttribute('style', myCur.getAttribute('style') || '');
    pv.style.transform = '';
  }
}

// Settings → Camera & microphone: the same choice the little menus on video and memo cards make
async function fillDevices() {
  let list: MediaDeviceInfo[] = [];
  try {
    list = await navigator.mediaDevices.enumerateDevices();
  } catch {}
  const named = list.some(d => d.label); // names only show once Myra has been allowed to use them
  $('devAllow').hidden = named || !navigator.mediaDevices;
  const pickers: [id: string, kind: MediaDeviceKind, key: 'camId' | 'micId', title: string][] = [
    ['devCam', 'videoinput', 'camId', 'Camera'],
    ['devMic', 'audioinput', 'micId', 'Microphone'],
  ];
  for (const [id, kind, key, title] of pickers) {
    const sel = elementById(id, HTMLSelectElement),
      ds = list.filter(
        d => d.kind === kind && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications',
      );
    const kindName = title.toLowerCase(),
      option = (d: MediaDeviceInfo, i: number) => {
        const value = esc(d.deviceId),
          name = esc(devName(d, `${title} ${i + 1}`));
        return `<option value="${value}">${name}</option>`;
      };
    const options = ds.map(option).join('');
    sel.innerHTML = `<option value="">Default ${kindName}</option>${options}`;
    sel.value = ds.some(d => d.deviceId === settings[key]) ? (settings[key] ?? '') : '';
    sel.disabled = !ds.length && named;
    sel.onchange = () => {
      if (sel.value) settings[key] = sel.value;
      else delete settings[key];
      applySettings();
      if (key === 'micId' && appState.warm) {
        appState.warm.getTracks().forEach(t => {
          t.stop();
        });
        appState.warm = null;
      }
      [...cams.keys()].forEach(cid => {
        const c = byId(cid);
        camOff(cid);
        if (c?.type === 'video') camOn(c);
      });
    };
  }
}

export const closeSettings = () => $('settings').classList.remove('on');

// settings tabs: one topic at a time, so it isn't one long scroll
export function setTab(t: string) {
  for (const b of htmlIn($('setTabs'), 'button')) b.classList.toggle('on', b.dataset.tab === t);
  for (const sec of htmlIn($('settings'), '.set-body section[data-tab]'))
    sec.classList.toggle('tab-off', sec.dataset.tab !== t);
  child($('settings'), '.set-body').scrollTop = 0;
  if (t === 'helpers') {
    showUsage();
    if (Fenmyr.native) renderGitSetup();
  }
}

// panel heights: drag the little bar at the bottom of your boards list, Layers, Wireframe or Unsorted (double-click it to go back to automatic). Layers always keeps at least one row showing
export const PANELS: Record<string, () => HTMLElement | null> = {
  boards: () => $('boards'),
  layers: () => $('layers'),
  tray: () => $('trayList'),
  design: () => htmlOrNull(document.querySelector('#design .dz-body')),
};
// Claude usage (desktop app): Myra's own tally, plus a door to the plan limits page
const kTok = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n));

const usLine = (u: UsageTotals | undefined) =>
  !u?.asks ? 'No asks yet' : `${u.asks} ask${u.asks === 1 ? '' : 's'} · ${kTok(u.tokensIn + u.tokensOut)} tokens`;

async function showUsage() {
  if (!Fenmyr.native) return;
  let u = null;
  try {
    u = await Fenmyr.usage();
  } catch (_e) {}
  if (!u) return;
  $('usToday').textContent = usLine(u.today);
  $('usWeek').textContent = usLine(u.week);
  $('usAll').textContent = usLine(u.all);
  $('usNote').textContent = `${
    u.week.cost >= 0.01
      ? `About $${u.week.cost.toFixed(2)} this week if you paid per request (on a Pro or Max plan you don't). `
      : ''
  }Just Myra's share, counted on this computer. Your plan's limits cover everything you do with Claude.`;
}
export function init28() {
  // Settings → General → Follow Caelestia: the desktop's Material You scheme (from the host, live) stands in for your own colors
  appState.cae = null;

  const nameIn = elementById('setName', HTMLInputElement);
  nameIn.oninput = () => {
    settings.name = nameIn.value.trim().slice(0, 24);
    applySettings();
  };

  $('setName').onkeydown = e => e.stopPropagation();

  $('curColors').onclick = e => {
    const b = closestTo(e.target, '[data-cc]');
    if (b) {
      settings.cursor = b.dataset.cc ?? settings.cursor;
      applySettings();
    }
  };

  $('colReset').onclick = () => {
    settings.colors[modeName()] = {};
    applySettings();
  };

  $('devAllow').onclick = async () => {
    try {
      const st = await openMedia(true);
      st.getTracks().forEach(t => {
        t.stop();
      });
    } catch (_e) {
      try {
        const st = await openMedia(false);
        st.getTracks().forEach(t => {
          t.stop();
        });
      } catch (_e2) {}
    }
    fillDevices();
  };

  navigator.mediaDevices?.addEventListener?.('devicechange', () => {
    if ($('settings').classList.contains('on')) fillDevices();
  });

  $('gearBtn').onclick = e => {
    e.stopPropagation();
    fillDevices();
    showConnections(true); // always a fresh look at Claude's connections
    if (placing) stopPlacing();
    if (session.sel.size) selectOnly([]);
    checkUpdate();
    showUsage();
    $('boardCount').textContent =
      `${appState.boardList.length} board${appState.boardList.length === 1 ? '' : 's'}, kept on this computer. They never leave your computer.`;
    showConnections(true);
    $('settings').classList.add('on');
  };
  // a saved height is a wish: on a short window the panel shrinks to fit instead of spilling out of its column
  Object.entries(PANELS).forEach(([k, f]) => {
    const el = f();
    if (!el) return;
    const grip = document.createElement('div');
    grip.className = 'rz-grip';
    grip.title = 'Drag to change the height · double-click for automatic';
    grip.dataset.panel = k;
    el.insertAdjacentElement('afterend', grip);
    gripBulge(grip);
    grip.addEventListener('pointerdown', e => {
      e.preventDefault();
      e.stopPropagation();
      const y0 = e.clientY,
        h0 = el.getBoundingClientRect().height;
      grip.setPointerCapture(e.pointerId);
      grip.classList.add('on');
      const mv = (ev: PointerEvent) => {
        settings.panelH = {
          ...settings.panelH,
          [k]: Math.round(Math.max(panelMin(k), Math.min(innerHeight - 140, h0 + ev.clientY - y0))),
        };
        applyPanelH();
        const got = Math.round(el.getBoundingClientRect().height);
        const want = settings.panelH[k];
        if (want !== undefined && got < want) settings.panelH[k] = got;
      };
      const up = () => {
        grip.classList.remove('on');
        grip.removeEventListener('pointermove', mv);
        grip.removeEventListener('pointerup', up);
        applySettings();
      };
      grip.addEventListener('pointermove', mv);
      grip.addEventListener('pointerup', up);
    });
    grip.addEventListener('dblclick', e => {
      e.stopPropagation();
      const p = { ...settings.panelH };
      delete p[k];
      settings.panelH = p;
      applyPanelH();
      applySettings();
    });
  });

  addEventListener('resize', fitSides);
  document.querySelectorAll('.side').forEach(el => {
    new ResizeObserver(() => requestAnimationFrame(fitSides)).observe(el);
  });

  applyPanelH();

  const myraNameIn = elementById('myraNameIn', HTMLInputElement);
  myraNameIn.oninput = () => {
    settings.myraName = myraNameIn.value.slice(0, 18);
    applySettings();
  };

  myraNameIn.onkeydown = e => {
    e.stopPropagation();
    if (e.key === 'Enter') myraNameIn.blur();
  };

  $('setTabs').onclick = e => {
    const b = closestTo(e.target, '[data-tab]');
    if (b) {
      setTab(b.dataset.tab ?? 'general');
      if (b.dataset.tab === 'toolbar') renderTbList();
      if (b.dataset.tab === 'vaults') renderVaults();
    }
  };

  setTab('general');

  $('usLimits').onclick = () => Fenmyr.openURL('https://claude.ai/settings/usage');

  $('sendFeedback').onclick = () => Fenmyr.openURL('https://github.com/chiangs/fenmyr/issues/new');
  // ideas and bugs go to this version's GitHub issues
  $('usReset').onclick = async () => {
    await Fenmyr.resetUsage();
    showUsage();
  };

  $('setClose').onclick = closeSettings;
}
