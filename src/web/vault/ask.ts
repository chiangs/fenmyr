import { showDialog } from '../ui/popover.ts';
import { esc } from '../ui/dom.ts';
import { $ } from '../core/dom.ts';
import { saveLib } from '../library/tree.ts';
import { say } from '../settings/licenses.ts';
import { addVaultNote } from './notes.ts';
import { activeGrants, folderChecklist, loadVaults, renderVaults, vaultById, vaultInfo } from './vaults.ts';
import { appState, session } from '../core/state.ts';
import type { Board, StoredBoard, VaultGrant } from '../../shared/model.ts';
import type { VaultHit, VaultListItem, VaultPatch } from '../../shared/ops.ts';
import { child, closestTo, elementById } from '../ui/dom.ts';

type Found = VaultHit & { vault: string; vaultId: string };
type Pickable = VaultListItem & { g: VaultGrant };
const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const aiGrants = (b: Board | StoredBoard) => activeGrants(b).filter(g => g.ai);

export function updateVaultChip() {
  const b = $('mcVault');
  if (!b) return;
  const can = !!(Fenmyr.native && session.board && aiGrants(session.board).length);
  b.hidden = !can;
  if (!can) appState.vaultChip = false;
  b.classList.toggle('on', appState.vaultChip);
  b.setAttribute('aria-pressed', appState.vaultChip ? 'true' : 'false');
}

// the app (never Claude) finds the notes: the best few across the allowed folders, cut short
export async function gatherVault(q: string) {
  const all: Found[] = [];
  for (const g of aiGrants(session.board)) {
    const v = vaultById(g.vault);
    if (!v) continue;
    try {
      (await Fenmyr.vaultSearch(g.vault, g.folders, q)).forEach(h =>
        all.push({ ...h, vault: v.name, vaultId: g.vault }),
      );
    } catch (e) {}
  }
  all.sort((a, b) => b.score - a.score);
  const out: Found[] = [];
  let total = 0;
  for (const n of all) {
    if (out.length >= 8 || total >= 12000) break;
    const text = n.text.slice(0, 12000 - total);
    total += text.length;
    out.push({ ...n, text });
  }
  return out;
}

export async function openVaultPicker() {
  await loadVaults();
  const gs = activeGrants(session.board);
  $('vaultPick')?.remove();
  if (!gs.length) {
    say(
      'This board can’t read any vault yet. Connect one in Settings → Vaults, then give this board or its project access (right-click → Vault access) ✦',
      7000,
    );
    return;
  }
  const d = showDialog(
    '<div class="tdlg vdlg"><h3>Add a note from a vault</h3><input id="vpQ" placeholder="Search by name or folder…" autocomplete="off" spellcheck="false"><div class="vp-list" id="vpList"></div><div class="tdlg-btns"><button class="set-btn" id="vpNo">Close</button></div></div>',
    'vaultPick',
  );
  const q = child(d, '#vpQ', HTMLInputElement),
    list = child(d, '#vpList');
  let seq = 0,
    rows: Pickable[] = [];
  const run = async () => {
    const my = ++seq,
      text = q.value.trim();
    const all = (
      await Promise.all(
        gs.map(g =>
          Fenmyr.vaultNotes(g.vault, g.folders, text).then(
            r => r.map(x => ({ ...x, g })),
            (): Pickable[] => [],
          ),
        ),
      )
    ).flat();
    if (my !== seq) return;
    rows = all.sort((a, b) => b.mtime - a.mtime).slice(0, 40);
    list.innerHTML = rows.length
      ? rows
          .map((r, i) => {
            const title = esc(r.title),
              from = gs.length > 1 ? (vaultById(r.g.vault)?.name || '') + (r.folder ? ' · ' : '') : '',
              where = esc(from + r.folder);
            return `<button class="vp-row" data-i="${i}"><b>${title}</b><small>${where}</small></button>`;
          })
          .join('')
      : '<div class="vr-none">No notes found.</div>';
  };
  let t: ReturnType<typeof setTimeout> | undefined;
  q.oninput = () => {
    clearTimeout(t);
    t = setTimeout(run, 120);
  };
  run();
  q.focus();
  const close = () => d.remove();
  d.onclick = async e => {
    if (e.target === d || (e.target instanceof Element && e.target.id === 'vpNo')) return close();
    const b = closestTo(e.target, '.vp-row');
    if (!b) return;
    const r = rows[Number(b.dataset.i)];
    close();
    if (!r) return;
    try {
      await addVaultNote(r.g, r.rel);
    } catch (err) {
      say('Hmm: ' + messageOf(err), 3500);
    }
  };
  d.onkeydown = e => {
    e.stopPropagation();
    if (e.key === 'Escape') close();
    if (e.key === 'Enter' && rows[0]) {
      e.preventDefault();
      const r = rows[0];
      close();
      addVaultNote(r.g, r.rel).catch(err => say('Hmm: ' + messageOf(err), 3500));
    }
  };
}
export function init39() {
  // ---------- Myra reads notes with AI: only from grants with the switch on, only when you tick "Search my vault" for that question ----------
  appState.vaultChip = false;

  $('mcVault').onclick = () => {
    appState.vaultChip = !appState.vaultChip;
    updateVaultChip();
    elementById('mcInput', HTMLTextAreaElement).focus();
  };

  $('vaultAdd').onclick = async () => {
    try {
      const dir = await Fenmyr.vaultPick();
      if (!dir) return;
      const v = await Fenmyr.vaultAdd(dir);
      await renderVaults();
      say(
        `Connected “${v.name}”. Nobody can see it yet: give a project or board access from its right-click menu ✦`,
        6000,
      );
    } catch (e) {
      say('Hmm: ' + messageOf(e), 4000);
    }
  };

  $('vaultList').onclick = async e => {
    const b = closestTo(e.target, '[data-vb]'),
      row = closestTo(e.target, '.vrow', HTMLElement);
    if (!b || !row) return;
    const v = vaultById(row.dataset.id ?? '');
    if (!v) return;
    const more = child(row, '.vr-more');
    if (b.dataset.vb === 'scan') {
      delete vaultInfo[v.id];
      return renderVaults();
    }
    if (b.dataset.vb === 'rm') {
      if (!b.classList.contains('sure')) {
        b.classList.add('sure');
        b.textContent = 'Disconnect? Click again';
        setTimeout(() => {
          b.classList.remove('sure');
          b.textContent = 'Disconnect';
        }, 3000);
        return;
      }
      await Fenmyr.vaultRemove(v.id);
      delete vaultInfo[v.id];
      appState.projects.forEach(p => {
        if (p.vaults) p.vaults = p.vaults.filter(g => g.vault !== v.id);
      });
      await saveLib();
      return renderVaults();
    }
    if (b.dataset.vb === 'more') {
      if (!more.hidden) {
        more.hidden = true;
        return;
      }
      const info = vaultInfo[v.id] || (await Fenmyr.vaultScan(v.id).catch(() => ({ folders: [], notes: 0 })));
      vaultInfo[v.id] = info;
      const name = esc(v.name),
        obsidian = esc(v.obsidian || '');
      more.innerHTML = `<label class="vr-f">Name here<input data-k="name" value="${name}" maxlength="60"></label><label class="vr-f">Name in Obsidian<input data-k="obsidian" value="${obsidian}" maxlength="120"><small>Used for the “Open in Obsidian” link. It's the vault's name in Obsidian, normally its folder name.</small></label><div class="vr-h">Off-limits folders<small>Never read, whatever a project or board allows.</small></div>`;
      more.appendChild(
        folderChecklist(info.folders, v.off, async off => {
          v.off = off;
          await Fenmyr.vaultUpdate(v.id, { off });
        }),
      );
      more.onchange = async ev => {
        const i = closestTo(ev.target, 'input[data-k]', HTMLInputElement);
        const k = i?.dataset.k;
        if (!i || (k !== 'name' && k !== 'obsidian')) return;
        const patch: VaultPatch = { [k]: i.value };
        const nv = await Fenmyr.vaultUpdate(v.id, patch);
        Object.assign(v, nv);
        if (k === 'name') child(row, '.vr-name').textContent = v.name;
      };
      more.onkeydown = ev => {
        ev.stopPropagation();
        if (ev.key === 'Enter' && ev.target instanceof HTMLElement) ev.target.blur();
      };
      more.hidden = false;
    }
  };
}
