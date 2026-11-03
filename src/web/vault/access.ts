import type { Project } from '../../shared/model.ts';
import type { BoardSummary, Vault } from '../../shared/ops.ts';
import { $ } from '../core/dom.ts';
import { appState } from '../core/state.ts';
import { child, closestTo, esc } from '../ui/dom.ts';
import { showDialog } from '../ui/popover.ts';
import { editVaultAccess, USE_EVENT, vaultById } from './vaults.ts';

// ---------- Settings → Vaults: who may read each vault, and the way in to change it ----------
type Reader = { kind: 'project' | 'board'; id: string; name: string; ai: boolean; follows: number };
type Who = { kind: 'project' | 'board'; id: string; name: string; state: string };

const projectOf = (b: BoardSummary) => {
  const folder = appState.folders.find(f => f.id === b.folder);
  return folder ? appState.projects.find(p => p.id === folder.project) : undefined;
};
const topLevel = (b: BoardSummary) => !b.parent;
const grantOf = (p: Project, vault: string) => p.vaults?.find(g => g.vault === vault && g.folders.length > 0);

// projects with a folder ticked for this vault, and boards that chose their own access (boards that follow their project are counted under it)
function readersOf(vault: string): Reader[] {
  const out: Reader[] = [];
  for (const p of appState.projects) {
    const g = grantOf(p, vault);
    if (!g) continue;
    const follows = appState.boardList.filter(b => topLevel(b) && !b.vaultAccess && projectOf(b)?.id === p.id).length;
    out.push({ kind: 'project', id: p.id, name: p.name, ai: g.ai, follows });
  }
  for (const b of appState.boardList) {
    const g = topLevel(b) ? b.vaultAccess?.find(x => x.vault === vault) : undefined;
    if (g) out.push({ kind: 'board', id: b.id, name: b.name, ai: g.ai, follows: 0 });
  }
  return out;
}

const readerChip = (r: Reader) => {
  const name = esc(r.name),
    id = esc(r.id),
    ai = r.ai ? ' · AI reading on' : '',
    follow = r.follows ? ` · ${r.follows} board${r.follows === 1 ? '' : 's'} follow it` : '',
    note = `${r.kind}${ai}${follow}`;
  return `<button class="vr-chip" data-vb="edit" data-kind="${r.kind}" data-rid="${id}" title="Change what it may read">${name}<small>${note}</small></button>`;
};

function paintRow(row: HTMLElement) {
  const readers = readersOf(row.dataset.id ?? ''),
    chips = readers.map(readerChip).join(''),
    unused = '<span class="vr-unused">Not used by anything yet. Choose who may read it.</span>',
    used = `<span class="vr-by">Read by</span>${chips}`,
    use = row.querySelector('.vr-use'),
    give = row.querySelector('[data-vb="access"]');
  if (use) use.innerHTML = readers.length ? used : unused;
  give?.classList.toggle('hot', !readers.length);
}

async function paintVaultUse() {
  const list = await Fenmyr.list().catch(() => null);
  if (list) appState.boardList = list;
  for (const row of $('vaultList').querySelectorAll('.vrow')) if (row instanceof HTMLElement) paintRow(row);
}

// every project and board, with what it may read of this vault now
function whoList(vault: string): Who[] {
  const asked = (g: { ai: boolean } | undefined) => (g ? `Can read${g.ai ? ' · AI reading on' : ''}` : 'No access');
  const projects = appState.projects.map(p => ({
    kind: 'project' as const,
    id: p.id,
    name: p.name,
    state: asked(grantOf(p, vault)),
  }));
  const boards = appState.boardList.filter(topLevel).map(b => {
    const p = projectOf(b),
      own = b.vaultAccess,
      grant = own ? own.find(x => x.vault === vault) : p && grantOf(p, vault),
      via = !own && p ? ` · follows ${p.name}` : '';
    return { kind: 'board' as const, id: b.id, name: b.name, state: `${asked(grant)}${via}` };
  });
  return [...projects, ...boards];
}

const whoRow = (w: Who, i: number) => {
  const name = esc(w.name),
    kind = w.kind === 'project' ? 'Project' : 'Board',
    state = esc(w.state);
  return `<button class="vp-row" data-i="${i}"><span>${name}</span><small>${kind} · ${state}</small></button>`;
};

async function chooseWhoMayRead(v: Vault) {
  const name = esc(v.name);
  const d = showDialog(
    `<div class="tdlg vdlg" role="dialog"><h3>Give access to “${name}”</h3><p class="set-note">Pick a project or a board. Next you choose which folders it may read, and whether Myra may read them with AI.</p><input id="apQ" placeholder="Search projects and boards…" autocomplete="off" spellcheck="false"><div class="vp-list" id="apList"></div><div class="tdlg-btns"><button class="set-btn" id="apNo">Close</button></div></div>`,
    'vaultWho',
  );
  const q = child(d, '#apQ', HTMLInputElement),
    list = child(d, '#apList');
  let rows: Who[] = [];
  const paint = () => {
    const words = q.value.trim().toLowerCase();
    rows = whoList(v.id).filter(w => w.name.toLowerCase().includes(words));
    list.innerHTML = rows.length ? rows.map(whoRow).join('') : '<div class="vr-none">Nothing matches.</div>';
  };
  const close = () => d.remove();
  q.oninput = paint;
  d.onclick = async e => {
    const b = closestTo(e.target, '[data-i]'),
      pick = b ? rows[Number(b.dataset.i)] : undefined;
    if (e.target === d || (e.target instanceof Element && e.target.id === 'apNo')) return close();
    if (!pick) return;
    close();
    await openAccessFor(pick.kind, pick.id);
  };
  d.onkeydown = e => {
    e.stopPropagation();
    if (e.key === 'Escape') close();
  };
  paint();
  q.focus();
}

async function openAccessFor(kind: 'project' | 'board', id: string) {
  const project = kind === 'project' ? appState.projects.find(p => p.id === id) : undefined;
  if (kind === 'project' && !project) return;
  await editVaultAccess(kind, project ?? { id });
  setTimeout(paintVaultUse, 700);
}

// the buttons on a vault's row: Give access…, and the names of what already reads it
export async function vaultUseClick(b: HTMLElement | SVGElement, vaultId: string) {
  const v = vaultById(vaultId);
  if (b.dataset.vb === 'access' && v) return chooseWhoMayRead(v);
  const kind = b.dataset.kind;
  if (b.dataset.vb === 'edit' && (kind === 'project' || kind === 'board'))
    return openAccessFor(kind, b.dataset.rid ?? '');
}

export function initVaultAccess() {
  document.addEventListener(USE_EVENT, () => void paintVaultUse());
}
