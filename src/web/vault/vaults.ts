import type { Board, Project, StoredBoard, VaultGrant } from '../../shared/model.ts';
import type { Vault, VaultScan } from '../../shared/ops.ts';
import { copyOf } from '../core/base.ts';
import { $ } from '../core/dom.ts';
import { save } from '../core/history.ts';
import { appState, session } from '../core/state.ts';
import { saveLib } from '../library/tree.ts';
import { setTab } from '../settings/colors.ts';
import { chirp } from '../settings/licenses.ts';
import { child, closestTo, esc } from '../ui/dom.ts';
import { showDialog } from '../ui/popover.ts';
import { applyToolbar } from '../ui/toolbarConfig.ts';
import { refreshVNotes } from './notes.ts';

type AccessChoice = { follow: boolean; grants: VaultGrant[] };

// sent when what reads a vault may have changed, so Settings → Vaults can repaint its "Read by" lines
export const USE_EVENT = 'fenmyr:vault-use';

// ---------- Obsidian vaults: connect folders here; a project or board is then granted what it may see (read-only) ----------
export let vaults: Vault[] = [];
// vault id → its folders and note count from the last scan
export const vaultInfo: Record<string, VaultScan> = {};
export const vaultById = (id: string) => vaults.find(v => v.id === id);

export async function loadVaults() {
  vaults = await Fenmyr.vaults().catch(() => []);
  if (session.board) applyToolbar();
}

const wholeRow = (on: boolean) => {
  const checked = on ? 'checked' : '';
  return `<label class="fc-row"><input type="checkbox" data-f="" ${checked}><span><b>The whole vault</b></span></label>`;
};

// a scrollable list of a vault's folders with a tick each. A ticked folder includes the ones inside it. whole: a first row that ticks the whole vault ('')
export function folderChecklist(
  folders: string[],
  chosen: string[],
  onChange: (folders: string[]) => void,
  { whole = false } = {},
) {
  const box = document.createElement('div');
  box.className = 'fchk';
  const set = new Set(chosen),
    paint = () => {
      const wholeOn = set.has('');
      box.innerHTML =
        (whole ? wholeRow(wholeOn) : '') +
        folders
          .map(f => {
            const depth = f.split('/').length - 1,
              covered = (wholeOn && whole) || [...set].some(c => c !== '' && f.startsWith(`${c}/`));
            const cov = covered ? ' cov' : '',
              pad = 10 + depth * 16,
              path = esc(f),
              checked = set.has(f) || covered ? 'checked' : '',
              disabled = covered ? 'disabled' : '',
              name = esc(f.split('/').pop());
            return `<label class="fc-row${cov}" style="padding-left:${pad}px"><input type="checkbox" data-f="${path}" ${checked} ${disabled}><span>${name}</span></label>`;
          })
          .join('') +
        (folders.length
          ? ''
          : '<div class="fc-none">No folders yet. Notes in the top of the vault are covered by “the whole vault”.</div>');
    };
  paint();
  box.onchange = e => {
    const i = closestTo(e.target, '[data-f]', HTMLInputElement);
    if (!i) return;
    const f = i.dataset.f ?? '';
    if (i.checked) set.add(f);
    else set.delete(f);
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
        .map(v => {
          const id = esc(v.id),
            name = esc(v.name),
            path = esc(v.path),
            notObsidian = v.obsidianFolder
              ? ''
              : ' · doesn’t look like an Obsidian vault (no .obsidian folder), but I can still read its notes';
          return `<div class="vrow" data-id="${id}"><div class="vr-top"><div><b class="vr-name">${name}</b><small>${path}<span class="vr-c"></span>${notObsidian}</small></div>
        <div class="set-btns"><button class="set-btn" data-vb="access">Give access…</button><button class="set-btn" data-vb="more">Edit</button><button class="set-btn" data-vb="scan">Rescan</button><button class="set-btn" data-vb="rm">Disconnect</button></div></div><div class="vr-use"></div><div class="vr-more" hidden></div></div>`;
        })
        .join('')
    : '<div class="vr-none">No vault connected yet.</div>';
  paintVaultCounts();
  document.dispatchEvent(new Event(USE_EVENT));
  vaults.forEach(v => {
    Fenmyr.vaultScan(v.id)
      .then(info => {
        vaultInfo[v.id] = info;
        paintVaultCounts();
      })
      .catch(() => {});
  });
}

const countText = (i: VaultScan) =>
  ` · ${i.notes} note${i.notes === 1 ? '' : 's'}, ${i.folders.length} folder${i.folders.length === 1 ? '' : 's'}`;

function paintVaultCounts() {
  vaults.forEach(v => {
    const c = $('vaultList').querySelector(`[data-id="${v.id}"] .vr-c`),
      i = vaultInfo[v.id];
    if (c && i) c.textContent = countText(i);
  });
}

// what a board may read: its own choice, or else its project's. A grant: { vault, folders: ['' = the whole vault, or folder paths], ai, write, writeTo }
function grantsFor(b: Board | StoredBoard = session.board): VaultGrant[] {
  if (b.vaultAccess) return b.vaultAccess;
  const f = appState.folders.find(x => x.id === b.folder),
    p = f && appState.projects.find(x => x.id === f.project);
  return p?.vaults ?? [];
}

export const activeGrants = (b: Board | StoredBoard) =>
  grantsFor(b).filter(g => vaultById(g.vault) && g.folders.length);

// inherit: the project's name when a board can follow its project
async function vaultAccessDialog({
  title,
  grants,
  inherit,
}: {
  title: string;
  grants: VaultGrant[];
  inherit?: string | null;
}) {
  await loadVaults();
  return new Promise<AccessChoice | null>(res => {
    const mine = copyOf(grants);
    let follow = inherit != null;
    const shownTitle = esc(title),
      followLabel = inherit ? `Same as “${esc(inherit)}”` : 'Same as its project',
      followRow =
        inherit != null
          ? `<div class="tdlg-row"><span>Who decides</span><div class="seg" id="vaFollow"><button data-v="1">${followLabel}</button><button data-v="0">This board only</button></div></div>`
          : '';
    const d =
      showDialog(`<div class="tdlg vdlg" role="dialog"><h3>Vault access</h3><p class="set-note">${shownTitle}. Notes are only read, and only from the folders you tick. Off-limits folders and #private notes are never read.</p><p class="set-note">To let Myra search these notes with AI, switch on “Let Myra read these with AI” below, then tick “Search my vault” in her chat for each question.</p>
        ${followRow}
        <div class="va-list" id="vaList"></div><div class="tdlg-btns"><button class="set-btn" id="vaNo">Cancel</button><button class="set-btn hot" id="vaOk">Save</button></div></div>`);
    const list = child(d, '#vaList');
    const paint = async () => {
      for (const b of d.querySelectorAll('#vaFollow [data-v]'))
        if (b instanceof HTMLElement) b.classList.toggle('on', (b.dataset.v === '1') === follow);
      list.hidden = follow;
      if (follow) return;
      list.innerHTML = vaults.length
        ? ''
        : '<div class="vr-none">No vault is connected yet. <button class="set-link" id="vaGo">Connect one in Settings</button></div>';
      for (const v of vaults) {
        const g = mine.find(x => x.vault === v.id);
        const info =
          vaultInfo[v.id] || (vaultInfo[v.id] = await Fenmyr.vaultScan(v.id).catch(() => ({ folders: [], notes: 0 })));
        const blk = document.createElement('div');
        blk.className = 'vg';
        const used = g ? 'checked' : '',
          name = esc(v.name);
        blk.innerHTML = `<label class="vg-use"><input type="checkbox" ${used}><b>${name}</b></label>`;
        list.appendChild(blk);
        const use = child(blk, 'input', HTMLInputElement);
        use.onchange = () => {
          if (use.checked) mine.push({ vault: v.id, folders: [], ai: false, write: false, writeTo: 'Myra' });
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
            info.folders.filter(f => !v.off.some(o => f === o || f.startsWith(`${o}/`))),
            g.folders,
            f => {
              g.folders = f;
            },
            { whole: true },
          ),
        );
        const aiOn = g.ai ? 'checked' : '';
        body.insertAdjacentHTML(
          'beforeend',
          `<label class="vg-sw"><span>Let Myra read these with AI<small>When you tick “Search my vault” in her chat, she finds notes in these folders that match your question and sends their text to Claude (a cloud service). Never #private notes or off-limits folders.</small></span><input type="checkbox" class="tgl" data-k="ai" ${aiOn}></label>`,
        );
        body.onchange = e => {
          if (e.target instanceof HTMLInputElement && e.target.dataset.k === 'ai') g.ai = e.target.checked;
        };
      }
    };
    const done = (v: AccessChoice | null) => {
      d.remove();
      res(v);
    };
    d.onclick = e => {
      const b = closestTo(e.target, '#vaFollow [data-v]');
      if (b) {
        follow = b.dataset.v === '1';
        paint();
      }
      const id = e.target instanceof Element ? e.target.id : '';
      if (id === 'vaGo') {
        done(null);
        $('gearBtn').click();
        setTab('vaults');
        renderVaults();
      }
      if (e.target === d || id === 'vaNo') done(null);
      if (id === 'vaOk') done({ follow, grants: mine.filter(g => g.folders.length) });
    };
    d.onkeydown = e => {
      e.stopPropagation();
      if (e.key === 'Escape') done(null);
    };
    paint();
  });
}

export async function editVaultAccess(kind: 'project' | 'board', obj: Project | { id: string }) {
  if (kind === 'project' && 'name' in obj) {
    const r = await vaultAccessDialog({
      title: `What “${obj.name}” and its boards may read`,
      grants: obj.vaults ?? [],
    });
    if (!r) return;
    obj.vaults = r.grants;
    await saveLib();
    refreshVNotes();
    applyToolbar();
    chirp(
      r.grants.length
        ? `Saved: “${obj.name}” can read ${r.grants.length} vault${r.grants.length === 1 ? '' : 's'} ✦`
        : `“${obj.name}” can’t read any vault ✦`,
      3500,
    );
    document.dispatchEvent(new Event(USE_EVENT));
    return;
  }
  const b = session.board && session.board.id === obj.id ? session.board : await Fenmyr.load(obj.id);
  if (!b) return;
  const f = appState.folders.find(x => x.id === b.folder),
    p = f && appState.projects.find(x => x.id === f.project);
  const r = await vaultAccessDialog({
    title: `What “${b.name}” may read`,
    grants: b.vaultAccess ?? p?.vaults ?? [],
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
  document.dispatchEvent(new Event(USE_EVENT));
}
