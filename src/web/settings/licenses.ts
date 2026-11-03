import { openSettingsKey } from '../input/shortcuts.ts';
import { esc, htmlIn } from '../ui/dom.ts';
import { autoUpdateAnswered } from '../app/updates.ts';
import { COLOR_NAMES } from '../core/base.ts';
import { $ } from '../core/dom.ts';
import { addMsg, renderChat, sessionChats } from '../myra/chatLog.ts';
import { chatOpen } from '../myra/chatWindow.ts';
import { hopMyra } from '../myra/goos.ts';
import { showConnections } from '../myra/helpers.ts';
import { closeSettings } from './colors.ts';
import { settings } from './settings.ts';
import { applySettings } from './widgets.ts';
import { appState, session } from '../core/state.ts';
import { isRecord } from '../../shared/model.ts';
import type { CaelestiaScheme } from '../../shared/ops.ts';
import { closestTo } from '../ui/dom.ts';
import { flagOn, setChoice, setFlag } from './settings.ts';

type Licence = {
  name: string;
  version: string;
  license: string;
  where: string;
  url: string;
  note: string;
  text: string;
};
const text = (v: unknown) => (typeof v === 'string' ? v : '');
const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

// web/licenses.js is a script that sets a global, so what it holds is checked like any other outside data
function readLicences() {
  const raw: unknown = Reflect.get(window, 'FENMYR_LICENSES');
  if (!isRecord(raw)) return null;
  const items: Licence[] = (Array.isArray(raw.items) ? raw.items : []).filter(isRecord).map(i => ({
    name: text(i.name),
    version: text(i.version),
    license: text(i.license),
    where: text(i.where),
    url: text(i.url),
    note: text(i.note),
    text: text(i.text),
  }));
  return { fenmyr: text(raw.fenmyr), items };
}

// the host's theme, as it arrives from the bridge
function readScheme(d: unknown): CaelestiaScheme | null {
  if (!isRecord(d) || typeof d.name !== 'string' || (d.mode !== 'dark' && d.mode !== 'light') || !isRecord(d.colours))
    return null;
  const colours: Record<string, string> = {};
  for (const [k, v] of Object.entries(d.colours)) if (typeof v === 'string') colours[k] = v;
  return { name: d.name, mode: d.mode, colours };
}

// ---------- About → Licenses: Myra's license and every third-party notice (web/licenses.js, made by tools/notices.js) ----------
let licLoading: Promise<unknown> | null = null;

const loadLicenses = () =>
  licLoading ||
  (licLoading = new Promise((res, rej) => {
    if (Reflect.get(window, 'FENMYR_LICENSES')) return res(true);
    const sc = document.createElement('script');
    sc.src = 'licenses.js';
    sc.onload = res;
    sc.onerror = rej;
    document.head.appendChild(sc);
  }));

async function openLicenses() {
  $('licView').classList.add('on');
  try {
    await loadLicenses();
  } catch (e) {
    $('licBody').innerHTML = '<p class="lic-loading">The licence list is missing from this copy.</p>';
    return;
  }
  if ($('licBody').dataset.done) return;
  const L = readLicences();
  if (!L) return;
  const row = (
    i: Licence,
  ) => `<details class="lic-item"><summary><b>${esc(i.name)}</b>${i.version ? ` <span>${esc(i.version)}</span>` : ''}<em>${esc(i.license)}</em></summary>
      <p class="lic-meta">${esc(i.where)}${i.url ? ` · <button class="set-link" data-url="${esc(i.url)}">${esc(i.url.replace(/^https?:\/\//, ''))}</button>` : ''}</p>${i.note ? `<p class="lic-note">${esc(i.note)}</p>` : ''}
      ${i.name === 'Electron' && Fenmyr.native ? '<p><button class="set-btn" id="licChromium">Open Chromium’s licences</button></p>' : ''}<pre>${esc(i.text)}</pre></details>`;
  $('licBody').innerHTML =
    `<p class="lic-intro">Fenmyr is open source under the MIT License. The name Fenmyr, its logo, Myra the cloudberry and her art are reserved by Stephen Chiang. It includes ${L.items.length} pieces of software made by others, each listed with its licence.</p>
      <details class="lic-item lic-fenmyr" open><summary><b>Fenmyr</b><em>MIT</em></summary><pre>${esc(L.fenmyr)}</pre></details>` +
    L.items.map(row).join('');
  $('licBody').dataset.done = '1';
  for (const b of htmlIn($('licBody'), '[data-url]')) b.onclick = () => Fenmyr.openURL(b.dataset.url ?? '');
  const chromium = document.getElementById('licChromium');
  if (chromium) chromium.onclick = () => Fenmyr.chromiumLicenses().catch(e => say(messageOf(e), 5000));
}

const closeLicenses = () => $('licView').classList.remove('on');

// switching chats off (or to "until I quit") removes what's saved in the board files right away
async function clearSavedChats() {
  const list = await Fenmyr.list();
  for (const b of list) {
    const bb = b.id === session.board?.id ? session.board : await Fenmyr.load(b.id);
    const has = (log: unknown) => Array.isArray(log) && log.length > 0;
    if (bb && (has(bb.chat) || has(bb.chats))) {
      bb.chat = [];
      delete bb.chats;
      await Fenmyr.save(bb);
    }
  }
}

export const newNoteColor = () =>
  settings.noteColor === 'random' ? COLOR_NAMES[1 + Math.floor(Math.random() * 6)] : settings.noteColor;

export const snapTo = (v: number) => (settings.snap ? Math.round(v / 26) * 26 : v);

let sayT: ReturnType<typeof setTimeout> | undefined;

// the little extras: skipped when she's set to Quiet
export const reply = (text: string, ms?: number, acts?: SayAction[]) => say(text, ms, acts, true);

export function chirp(text: string, ms?: number, acts?: SayAction[]) {
  if (settings.chat !== 'quiet') say(text, ms, acts);
}

export function tip(text: string) {
  if (settings.chat === 'chatty') say(text, 6000);
}

// keep: an answer to something you asked, so it also goes into the chat even when the chat window is closed
// a button under one of Myra's lines
export type SayAction = { label: string; cls?: string; ghost?: boolean; run: () => unknown };
export function say(text: string, ms = 6000, acts: SayAction[] = [], keep = false) {
  $('mBubble').classList.remove('party');
  if (chatOpen()) {
    if (text) addMsg('myra', text, acts);
    return;
  }
  if (keep && text) addMsg('myra', text, acts);
  $('mSay').textContent = text;
  $('mActs').innerHTML = '';
  acts.forEach(a => {
    const b = document.createElement('button');
    b.textContent = a.label;
    b.className = a.cls || (a.ghost ? 'ghost' : '');
    b.onclick = () => {
      $('mBubble').classList.remove('on');
      a.run();
    };
    $('mActs').appendChild(b);
  });
  $('mBubble').classList.add('on');
  hopMyra();
  clearTimeout(sayT);
  if (ms) sayT = setTimeout(() => $('mBubble').classList.remove('on'), ms);
}
export function init29() {
  $('openLicenses').onclick = openLicenses;
  $('licClose').onclick = closeLicenses;

  $('licView').onclick = e => {
    if (e.target === $('licView')) closeLicenses();
  };

  addEventListener(
    'keydown',
    e => {
      if (e.key === 'Escape' && $('licView').classList.contains('on')) {
        e.stopImmediatePropagation();
        closeLicenses();
      }
    },
    true,
  );

  $('settings').onclick = e => {
    if (e.target === $('settings')) closeSettings();
  };

  $('wgReset').onclick = () => {
    settings.layout = null;
    applySettings();
    chirp('Widgets are back where they started ✦', 2600);
  };

  $('obMyra').onclick = $('myraColors').onclick = e => {
    const b = closestTo(e.target, '[data-mc]');
    if (b) {
      settings.myra = b.dataset.mc ?? 'golden';
      applySettings();
      hopMyra();
    }
  };

  for (const t of document.querySelectorAll('[data-set]')) {
    if (!(t instanceof HTMLInputElement)) continue;
    const key = t.dataset.set ?? '';
    t.onchange = () => {
      setFlag(key, t.checked);
      applySettings();
      if (key === 'autoUpdate') autoUpdateAnswered(!!flagOn(key));
    };
  }

  $('recheck').onclick = () => showConnections(true);

  $('clearChats').onclick = async () => {
    await clearSavedChats();
    Object.keys(sessionChats).forEach(k => delete sessionChats[k]);
    renderChat();
    $('clearChats').textContent = 'Cleared ✓';
    setTimeout(() => ($('clearChats').textContent = 'Clear all chats'), 1800);
  };

  for (const g of htmlIn(document, '[data-seg]')) {
    const key = g.dataset.seg ?? '';
    g.onclick = e => {
      const v = closestTo(e.target, '[data-v]')?.dataset.v;
      if (v === undefined) return;
      setChoice(key, v);
      applySettings();
      if (key === 'chatKeep' && v !== 'board') clearSavedChats();
      if (key === 'chatKeep') renderChat();
    };
  }

  $('obNotes').onclick = $('noteColors').onclick = e => {
    const b = closestTo(e.target, '[data-nc]');
    if (b) {
      settings.noteColor = b.dataset.nc ?? 'random';
      applySettings();
    }
  };

  matchMedia('(prefers-color-scheme: dark)').addEventListener(
    'change',
    () => settings.theme === 'system' && applySettings(),
  );

  window.__fenmyrEvent = (name, data) => {
    if (name === 'caelestia') {
      appState.cae = readScheme(data);
      applySettings();
    } else if (name === 'boardsChanged') window.__boardsChanged?.();
    else if (name === 'settings') openSettingsKey();
  };
  // a new wallpaper or scheme: restyle right away
  Fenmyr.caelestia()
    .then(d => {
      appState.cae = d;
      if (d) applySettings();
    })
    .catch(() => {});

  appState.deselectAt = 0;

  $('revealBoards').onclick = () => Fenmyr.reveal();
}
