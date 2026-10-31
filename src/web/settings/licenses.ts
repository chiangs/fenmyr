// @ts-nocheck
import { esc } from '../ui/dom.ts';
import { showUpdate, updInfo } from '../app/updates.ts';
import { COLOR_NAMES } from '../core/base.ts';
import { $ } from '../core/dom.ts';
import { addMsg, renderChat, sessionChats } from '../myra/chat.ts';
import { chatOpen } from '../myra/chatWindow.ts';
import { hopMyra } from '../myra/goos.ts';
import { showConnections } from '../myra/helpers.ts';
import { closeSettings } from './colors.ts';
import { settings } from './settings.ts';
import { applySettings } from './widgets.ts';
import { appState, session } from '../core/state.ts';

// ---------- About → Licenses: Myra's license and every third-party notice (web/licenses.js, made by tools/notices.js) ----------
let licLoading = null;

const loadLicenses = () =>
  licLoading ||
  (licLoading = new Promise((res, rej) => {
    if (window.FENMYR_LICENSES) return res();
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
  const L = window.FENMYR_LICENSES,
    row =
      i => `<details class="lic-item"><summary><b>${esc(i.name)}</b>${i.version ? ` <span>${esc(i.version)}</span>` : ''}<em>${esc(i.license)}</em></summary>
      <p class="lic-meta">${esc(i.where)}${i.url ? ` · <button class="set-link" data-url="${esc(i.url)}">${esc(i.url.replace(/^https?:\/\//, ''))}</button>` : ''}</p>${i.note ? `<p class="lic-note">${esc(i.note)}</p>` : ''}
      ${i.name === 'Electron' && Fenmyr.native ? '<p><button class="set-btn" id="licChromium">Open Chromium’s licences</button></p>' : ''}<pre>${esc(i.text)}</pre></details>`;
  $('licBody').innerHTML =
    `<p class="lic-intro">Fenmyr is open source under the MIT License. The name Fenmyr, its logo, Myra the cloudberry and her art are reserved by Stephen Chiang. It includes ${L.items.length} pieces of software made by others, each listed with its licence.</p>
      <details class="lic-item lic-fenmyr" open><summary><b>Fenmyr</b><em>MIT</em></summary><pre>${esc(L.fenmyr)}</pre></details>` +
    L.items.map(row).join('');
  $('licBody').dataset.done = '1';
  $('licBody')
    .querySelectorAll('[data-url]')
    .forEach(b => (b.onclick = () => Fenmyr.openURL(b.dataset.url)));
  $('licChromium') && ($('licChromium').onclick = () => Fenmyr.chromiumLicenses().catch(e => say(e.message, 5000)));
}

const closeLicenses = () => $('licView').classList.remove('on');

// switching chats off (or to "until I quit") removes what's saved in the board files right away
async function clearSavedChats() {
  const list = await Fenmyr.list();
  for (const b of list) {
    const bb = b.id === session.board?.id ? session.board : await Fenmyr.load(b.id);
    if (bb?.chat?.length || bb?.chats?.length) {
      bb.chat = [];
      delete bb.chats;
      await Fenmyr.save(bb);
    }
  }
}

export const newNoteColor = () =>
  settings.noteColor === 'random' ? COLOR_NAMES[1 + Math.floor(Math.random() * 6)] : settings.noteColor;

export const snapTo = v => (settings.snap ? Math.round(v / 26) * 26 : v);

let sayT = 0;

// the little extras: skipped when she's set to Quiet
export const reply = (text, ms, acts) => say(text, ms, acts, true);

export function chirp(text, ms, acts) {
  if (settings.chat !== 'quiet') say(text, ms, acts);
}

export function tip(text) {
  if (settings.chat === 'chatty') say(text, 6000);
}

// keep: an answer to something you asked, so it also goes into the chat even when the chat window is closed
export function say(text, ms = 6000, acts = [], keep = false) {
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
    const b = e.target.closest('[data-mc]');
    if (b) {
      settings.myra = b.dataset.mc;
      applySettings();
      hopMyra();
    }
  };

  document.querySelectorAll('[data-set]').forEach(
    t =>
      (t.onchange = () => {
        settings[t.dataset.set] = t.checked;
        applySettings();
        if (t.dataset.set === 'autoUpdate') {
          showUpdate.answered = true;
          if (t.checked && updInfo) showUpdate();
        }
      }),
  );

  $('recheck').onclick = () => showConnections(true);

  $('clearChats').onclick = async () => {
    await clearSavedChats();
    Object.keys(sessionChats).forEach(k => delete sessionChats[k]);
    renderChat();
    $('clearChats').textContent = 'Cleared ✓';
    setTimeout(() => ($('clearChats').textContent = 'Clear all chats'), 1800);
  };

  document.querySelectorAll('[data-seg]').forEach(
    g =>
      (g.onclick = e => {
        const b = e.target.closest('[data-v]');
        if (!b) return;
        settings[g.dataset.seg] = b.dataset.v;
        applySettings();
        if (g.dataset.seg === 'chatKeep' && b.dataset.v !== 'board') clearSavedChats();
        if (g.dataset.seg === 'chatKeep') renderChat();
      }),
  );

  $('obNotes').onclick = $('noteColors').onclick = e => {
    const b = e.target.closest('[data-nc]');
    if (b) {
      settings.noteColor = b.dataset.nc;
      applySettings();
    }
  };

  matchMedia('(prefers-color-scheme: dark)').addEventListener(
    'change',
    () => settings.theme === 'system' && applySettings(),
  );

  window.__fenmyrEvent = (name, data) => {
    if (name === 'caelestia') {
      appState.cae = data;
      applySettings();
    } else if (name === 'boardsChanged') window.__boardsChanged();
  };
  // a new wallpaper or scheme: restyle right away
  if (Fenmyr.caelestia)
    Fenmyr.caelestia()
      .then(d => {
        appState.cae = d;
        if (d) applySettings();
      })
      .catch(() => {});

  appState.deselectAt = 0;

  $('revealBoards').onclick = () => Fenmyr.reveal();
}
