// @ts-nocheck
import { esc } from '../ui/dom.ts';
import { $, stage } from '../core/dom.ts';
import { setTab } from '../settings/colors.ts';
import { settings } from '../settings/settings.ts';
import { applySettings } from '../settings/widgets.ts';

// ---------- updates: check GitHub for a newer Fenmyr (about once a day), show what's new, update with one tap ----------
export let updInfo = null;
// updating is a desktop app thing: the web version changes when the site does
export async function checkUpdate(force) {
  if (!Fenmyr.native) return;
  let last = 0;
  try {
    last = +localStorage.getItem('fenmyr:updChecked') || 0;
  } catch (e) {}
  if (!force && Date.now() - last < 15 * 60 * 1000 && updInfo) return showUpdate(); // at most every 15 minutes (it used to wait 20 hours, so an app left open never noticed)
  $('suSub').textContent = 'Checking for a new version…';
  try {
    updInfo = await Fenmyr.updateCheck();
    localStorage.setItem('fenmyr:updChecked', Date.now());
  } catch (e) {
    updInfo = { error: true };
  }
  showUpdate(true);
}

export function showUpdate(fresh) {
  const u = { ...(updInfo || {}) },
    n = u.behind || 0;
  if (u.since && !u.release) {
    const d = new Date(u.since + 'T12:00');
    if (!isNaN(d)) u.since = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  $('gearBtn').classList.toggle('has-update', n > 0);
  $('setUpdate').classList.toggle('ready', n > 0);
  $('suGo').hidden = !(n > 0);
  $('suTitle').textContent = n > 0 ? `A new Fenmyr is ready ✦` : 'Updates';
  $('suSub').textContent =
    !u.repo && !u.release
      ? 'To get updates, run ./install.sh --update once in a terminal from your Fenmyr folder. After that it works from here.'
      : u.offline
        ? 'I couldn’t reach GitHub just now. I’ll try again later.'
        : u.release
          ? n > 0
            ? `Version ${String(u.latest || '').replace(/^v/, '')} is ready (you have ${u.since}). Your boards and settings stay just as they are.`
            : `You’re up to date (version ${u.since}).`
          : n > 0
            ? `${n} update${n > 1 ? 's' : ''} since your version${u.since ? ' from ' + u.since : ''}. Your boards and settings stay just as they are.`
            : `You’re up to date${u.since ? ' (version from ' + u.since + ')' : ''}.`;
  const notes = (u.notes || []).slice(0, 8);
  $('suNotes').hidden = !(n > 0 && notes.length);
  $('suNotes').innerHTML = notes.map(t => `<li>${esc(t)}</li>`).join('');
  // a quiet bar on the board instead of a pop-up: shown once there's a new version, hidden with × until the next one
  const ver = String(u.latest || u.since || '')
      .replace(/^v/, '')
      .replace(/\.0$/, ''),
    key = (u.latest || '') + ':' + (u.since || '') + ':' + n;
  let hid = '';
  try {
    hid = localStorage.getItem('fenmyr:upbarHidden') || '';
  } catch (e) {}
  $('ubText').textContent = u.latest ? `Fenmyr ${ver} is ready` : 'A new Fenmyr is ready';
  $('ubGo').disabled = false;
  $('ubGo').textContent = 'Update now';
  $('upBar').classList.remove('busy');
  // the first time there's an update, the bar asks once if Fenmyr may keep things up to date; the answer becomes a switch in Settings
  const asking = n > 0 && (settings.autoUpdate === undefined || (u.preview && !showUpdate.answered)); // the preview always asks, so it can be shown again
  $('upBar').classList.toggle('ask', asking);
  requestAnimationFrame(fitUpBar);
  $('ubYes').hidden = $('ubNo').hidden = !asking;
  $('ubNotes').hidden = $('ubGo').hidden = asking;
  if (asking) $('ubText').textContent = `Fenmyr ${ver} is ready. Keep it up to date for you?`;
  else if (n > 0 && settings.autoUpdate)
    $('ubText').textContent = `Fenmyr ${ver} is ready. I’ll put it in when you quit, or`;
  if (n > 0 && settings.autoUpdate && !asking) prepareUpdate();
  $('upBar').hidden = !(n > 0) || (!asking && hid === key && !u.preview);
  $('upBar').dataset.key = key;
  fitUpBar();
}

// the bar sits at the top centre; if it would touch the board's name, it slides down just below it
function fitUpBar() {
  const b = $('upBar');
  if (b.hidden) return;
  b.classList.remove('low');
  b.style.left = '';
  // centre it in the open space between the board's name and the panels on the right; only if that's too tight does it step down
  const st = stage.getBoundingClientRect(),
    t = document.querySelector('.top')?.getBoundingClientRect(),
    w = b.getBoundingClientRect().width;
  const right = [$('design'), $('tray')]
    .map(el => el?.getBoundingClientRect())
    .filter(r => r && r.width && r.top < 140)
    .reduce((m, r) => Math.min(m, r.left), st.right);
  const from = (t ? t.right : st.left) + 20,
    to = right - 20;
  if (to - from >= w) b.style.left = (from + to) / 2 - st.left + 'px';
  else if (t) {
    const r = b.getBoundingClientRect();
    if (r.left < t.right + 16 && r.right > t.left - 16) b.classList.add('low');
  }
}
// the board mustn't grab presses on the bar
// automatic updates: get the new version ready quietly; it goes in when Fenmyr quits
let preparing = null;

function prepareUpdate() {
  if (preparing || !Fenmyr.updatePrepare) return;
  preparing = Fenmyr.updatePrepare().catch(() => {
    preparing = null;
  });
}
export function init59() {
  if (!Fenmyr.native) $('setUpdate').style.display = 'none';

  $('suCheck').onclick = () => checkUpdate(true);

  setInterval(() => checkUpdate(), 60 * 60 * 1000);
  // still open: look again every hour
  addEventListener('focus', () => checkUpdate());
  // and whenever you come back to the window (no more than every 15 minutes)
  ['pointerdown', 'mousedown', 'dblclick'].forEach(t => $('upBar').addEventListener(t, e => e.stopPropagation()));

  addEventListener('resize', () => fitUpBar());

  $('ubYes').onclick = () => {
    showUpdate.answered = true;
    settings.autoUpdate = true;
    applySettings();
    showUpdate();
    prepareUpdate();
    $('ubText').textContent = 'Lovely ✦ I’ll update when you quit Fenmyr, or';
    fitUpBar();
  };

  $('ubNo').onclick = () => {
    showUpdate.answered = true;
    settings.autoUpdate = false;
    applySettings();
    showUpdate();
  };

  $('ubX').onclick = () => {
    try {
      localStorage.setItem('fenmyr:upbarHidden', $('upBar').dataset.key || '');
    } catch (e) {}
    $('upBar').hidden = true;
  };

  $('ubNotes').onclick = () => {
    $('gearBtn').click();
    setTab('about');
    setTimeout(() => $('setUpdate').scrollIntoView({ block: 'center', behavior: 'smooth' }), 120);
  };

  $('ubGo').onclick = async () => {
    $('ubGo').disabled = true;
    $('ubGo').textContent = 'Updating…';
    $('upBar').classList.add('busy');
    $('ubText').textContent = 'Getting the new version. Fenmyr will reopen in a moment';
    try {
      await Fenmyr.updateNow();
    } catch (e) {
      $('ubText').textContent = e.message;
      $('ubGo').textContent = 'Update now';
      $('ubGo').disabled = false;
      $('upBar').classList.remove('busy');
    }
  };

  $('suGo').onclick = async () => {
    $('suGo').disabled = true;
    $('suGo').textContent = 'Updating…';
    $('suSub').textContent =
      'Getting the new version and rebuilding. Fenmyr will close and reopen in about 30 seconds.';
    try {
      await Fenmyr.updateNow();
    } catch (e) {
      $('suGo').disabled = false;
      $('suGo').textContent = 'Update now';
      $('suSub').textContent = e.message;
    }
  };

  document.querySelectorAll('[data-url]').forEach(b => (b.onclick = () => Fenmyr.openURL(b.dataset.url)));
}
