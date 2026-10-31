// @ts-nocheck
import { showDialog } from '../ui/popover.ts';
import { esc } from '../ui/dom.ts';
import { $ } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { saveLib } from '../library/tree.ts';
import { setTab } from '../settings/colors.ts';
import { chirp } from '../settings/licenses.ts';
import { applyToolbar } from '../ui/toolbarConfig.ts';
import { refreshVNotes } from './notes.ts';
import { appState, session } from '../core/state.ts';

// ---------- Obsidian vaults: connect folders here; a project or board is then granted what it may see (read-only) ----------
export let vaults = [];
export const vaultInfo = {};
// vaultInfo[id] = { folders, notes } from the last scan
export const vaultById = id => vaults.find(v => v.id === id);

export async function loadVaults() {
  vaults = await Fenmyr.vaults().catch(() => []);
  if (typeof applyToolbar === 'function' && session.board) applyToolbar();
}

// a scrollable list of a vault's folders with a tick each. A ticked folder includes the ones inside it. whole: a first row that ticks the whole vault ('')
export function folderChecklist(folders, chosen, onChange, { whole = false } = {}) {
  const box = document.createElement('div');
  box.className = 'fchk';
  const set = new Set(chosen),
    paint = () => {
      const wholeOn = set.has('');
      box.innerHTML =
        (whole
          ? `<label class="fc-row"><input type="checkbox" data-f="" ${wholeOn ? 'checked' : ''}><span><b>The whole vault</b></span></label>`
          : '') +
        folders
          .map(f => {
            const depth = f.split('/').length - 1,
              covered = (wholeOn && whole) || [...set].some(c => c !== '' && f.startsWith(c + '/'));
            return `<label class="fc-row${covered ? ' cov' : ''}" style="padding-left:${10 + depth * 16}px"><input type="checkbox" data-f="${esc(f)}" ${set.has(f) || covered ? 'checked' : ''} ${covered ? 'disabled' : ''}><span>${esc(f.split('/').pop())}</span></label>`;
          })
          .join('') +
        (folders.length
          ? ''
          : '<div class="fc-none">No folders yet. Notes in the top of the vault are covered by “the whole vault”.</div>');
    };
  paint();
  box.onchange = e => {
    const i = e.target.closest('[data-f]');
    if (!i) return;
    i.checked ? set.add(i.dataset.f) : set.delete(i.dataset.f);
    onChange([...set]);
    paint();
  };
  return box;
}

export async function renderVaults() {
  await loadVaults();
  const host = $('vaultList');
  host.innerHTML = vaults.length
    ? vaults
        .map(
          v => `<div class="vrow" data-id="${esc(v.id)}"><div class="vr-top"><div><b class="vr-name">${esc(v.name)}</b><small>${esc(v.path)}<span class="vr-c"></span>${v.obsidianFolder === false ? ' · doesn’t look like an Obsidian vault (no .obsidian folder), but I can still read its notes' : ''}</small></div>
        <div class="set-btns"><button class="set-btn" data-vb="more">Edit</button><button class="set-btn" data-vb="scan">Rescan</button><button class="set-btn" data-vb="rm">Disconnect</button></div></div><div class="vr-more" hidden></div></div>`,
        )
        .join('')
    : '<div class="vr-none">No vault connected yet.</div>';
  paintVaultCounts();
  vaults.forEach(v =>
    Fenmyr.vaultScan(v.id)
      .then(info => {
        vaultInfo[v.id] = info;
        paintVaultCounts();
      })
      .catch(() => {}),
  );
}

const countText = i =>
  ` · ${i.notes} note${i.notes === 1 ? '' : 's'}, ${i.folders.length} folder${i.folders.length === 1 ? '' : 's'}`;

function paintVaultCounts() {
  vaults.forEach(v => {
    const c = $('vaultList').querySelector(`[data-id="${v.id}"] .vr-c`),
      i = vaultInfo[v.id];
    if (c && i) c.textContent = countText(i);
  });
}

// what a board may read: its own choice, or else its project's. A grant: { vault, folders: ['' = the whole vault, or folder paths], ai, write, writeTo }
function grantsFor(b = session.board) {
  if (Array.isArray(b.vaultAccess)) return b.vaultAccess;
  const f = appState.folders.find(x => x.id === b.folder),
    p = f && appState.projects.find(x => x.id === f.project);
  return (p && p.vaults) || [];
}

export const activeGrants = b => grantsFor(b).filter(g => vaultById(g.vault) && (g.folders || []).length);

function vaultAccessDialog({ title, grants, inherit }) {
  // inherit: null, or the project's name (a board can follow its project)
  return new Promise(async res => {
    await loadVaults();
    const mine = JSON.parse(JSON.stringify(grants || []));
    let follow = inherit != null;
    const d =
      showDialog(`<div class="tdlg vdlg" role="dialog"><h3>Vault access</h3><p class="set-note">${esc(title)}. Notes are only read, and only from the folders you tick. Off-limits folders and #private notes are never read.</p>
        ${inherit != null ? `<div class="tdlg-row"><span>Who decides</span><div class="seg" id="vaFollow"><button data-v="1">${inherit ? 'Same as “' + esc(inherit) + '”' : 'Same as its project'}</button><button data-v="0">This board only</button></div></div>` : ''}
        <div class="va-list" id="vaList"></div><div class="tdlg-btns"><button class="set-btn" id="vaNo">Cancel</button><button class="set-btn hot" id="vaOk">Save</button></div></div>`);
    const list = d.querySelector('#vaList');
    const paint = async () => {
      d.querySelectorAll('#vaFollow [data-v]').forEach(b => b.classList.toggle('on', (b.dataset.v === '1') === follow));
      list.hidden = follow;
      if (follow) return;
      list.innerHTML = vaults.length
        ? ''
        : '<div class="vr-none">No vault is connected yet. <button class="set-link" id="vaGo">Connect one in Settings</button></div>';
      for (const v of vaults) {
        let g = mine.find(x => x.vault === v.id);
        const info =
          vaultInfo[v.id] || (vaultInfo[v.id] = await Fenmyr.vaultScan(v.id).catch(() => ({ folders: [], notes: 0 })));
        const blk = document.createElement('div');
        blk.className = 'vg';
        blk.innerHTML = `<label class="vg-use"><input type="checkbox" ${g ? 'checked' : ''}><b>${esc(v.name)}</b></label>`;
        list.appendChild(blk);
        blk.querySelector('input').onchange = e => {
          if (e.target.checked) mine.push({ vault: v.id, folders: [], ai: false, write: false, writeTo: 'Myra' });
          else
            mine.splice(
              mine.findIndex(x => x.vault === v.id),
              1,
            );
          paint();
        };
        if (!g) continue;
        const body = document.createElement('div');
        body.className = 'vg-body';
        body.innerHTML = '<div class="vr-h">Folders Myra may use</div>';
        blk.appendChild(body);
        body.appendChild(
          folderChecklist(
            info.folders.filter(f => !(v.off || []).some(o => f === o || f.startsWith(o + '/'))),
            g.folders,
            f => {
              g.folders = f;
            },
            { whole: true },
          ),
        );
        body.insertAdjacentHTML(
          'beforeend',
          `<label class="vg-sw"><span>Let Myra read these with AI<small>When you tick “Search my vault” in her chat, she finds notes in these folders that match your question and sends their text to Claude (a cloud service). Never #private notes or off-limits folders.</small></span><input type="checkbox" class="tgl" data-k="ai" ${g.ai ? 'checked' : ''}></label>`,
        );
        body.onchange = e => {
          const k = e.target.dataset.k;
          if (k) g[k] = e.target.checked;
        };
      }
    };
    const done = v => {
      d.remove();
      res(v);
    };
    d.onclick = e => {
      const b = e.target.closest('#vaFollow [data-v]');
      if (b) {
        follow = b.dataset.v === '1';
        paint();
      }
      if (e.target.id === 'vaGo') {
        done(null);
        $('gearBtn').click();
        setTab('vaults');
        renderVaults();
      }
      if (e.target === d || e.target.id === 'vaNo') done(null);
      if (e.target.id === 'vaOk') done({ follow, grants: mine.filter(g => (g.folders || []).length) });
    };
    d.onkeydown = e => {
      e.stopPropagation();
      if (e.key === 'Escape') done(null);
    };
    paint();
  });
}

export async function editVaultAccess(kind, obj) {
  if (kind === 'project') {
    const r = await vaultAccessDialog({
      title: `What “${obj.name}” and its boards may read`,
      grants: obj.vaults || [],
    });
    if (!r) return;
    obj.vaults = r.grants;
    await saveLib();
    refreshVNotes();
    applyToolbar();
    return chirp(
      r.grants.length
        ? `Saved: “${obj.name}” can read ${r.grants.length} vault${r.grants.length === 1 ? '' : 's'} ✦`
        : `“${obj.name}” can’t read any vault ✦`,
      3500,
    );
  }
  const b = session.board && session.board.id === obj.id ? session.board : await Fenmyr.load(obj.id);
  if (!b) return;
  const f = appState.folders.find(x => x.id === b.folder),
    p = f && appState.projects.find(x => x.id === f.project);
  const r = await vaultAccessDialog({
    title: `What “${b.name}” may read`,
    grants: Array.isArray(b.vaultAccess) ? b.vaultAccess : (p && p.vaults) || [],
    inherit: p ? p.name : null,
  });
  if (!r) return;
  if (r.follow) delete b.vaultAccess;
  else b.vaultAccess = r.grants;
  if (session.board && session.board.id === b.id) {
    save();
    refreshVNotes();
    applyToolbar();
  } else await Fenmyr.save(b);
  chirp(r.follow ? `“${b.name}” follows its project ✦` : `Saved: “${b.name}” has its own vault access ✦`, 3500);
}
