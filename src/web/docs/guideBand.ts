import type { GuideRole } from '../../shared/cardTypes.ts';
import type { CardOf } from '../../shared/model.ts';
import { renderCard } from '../canvas/render.ts';
import { save } from '../core/history.ts';
import { session } from '../core/state.ts';
import { say } from '../myra/say.ts';
import { rootOf } from '../repo/codeFolder.ts';
import { child, closestTo, elementById, esc } from '../ui/dom.ts';

type DocCard = CardOf<'doc'>;

// The band between a prototype's rules or design doc and its words: what the doc is for, the switch that leaves the
// repo's own file out, and a way to reach that file. A doc with no role has no band.
const FILES: Record<GuideRole, { noun: string; verb: string; file: string }> = {
  rules: { noun: 'rules', verb: 'are', file: 'prototypes/myra.md' },
  design: { noun: 'design', verb: 'is', file: 'prototypes/design.md' },
};

const bandEl = () => elementById('dvGuide', HTMLElement);
let shown: DocCard | null = null;

const repoPath = (root: string, role: GuideRole) => `${root}/${FILES[role].file}`;

function hintOf(c: DocCard, role: GuideRole, root: string | null) {
  const { noun, verb, file } = FILES[role];
  if (!root) return `This prototype’s project has no repo, so there are no repo ${noun} to add to.`;
  if (c.ignoreRepo)
    return `Only this goes to the builder for this prototype. The repo’s ${noun} in ${file} ${verb} ignored.`;
  return `Only what’s different for this prototype. It adds to the repo’s ${noun} in ${file}, and where the two differ, this wins.`;
}

/** Draws the band for the doc that is opening, or takes it away for none, or for a doc with no role. */
export function showGuide(c: DocCard | null) {
  const role = c?.role,
    band = bandEl();
  shown = role ? c : null;
  band.hidden = !role;
  if (!c || !role) return band.replaceChildren();
  const root = rootOf(session.board),
    hint = esc(hintOf(c, role, root)),
    checked = c.ignoreRepo ? ' checked' : '',
    label = `Ignore the repo ${FILES[role].noun}`,
    path = esc(root ? repoPath(root, role) : ''),
    tip = `Show ${path} in its folder`,
    // the switch and the button need a repo; the button needs the app, which can open a folder
    ignore = root
      ? `<label class="vg-sw"><span>${label}</span><input type="checkbox" class="tgl" id="dvIgnore"${checked}></label>`
      : '',
    reveal =
      root && Fenmyr.native
        ? `<button type="button" class="dv-guide-btn" id="dvReveal" data-tip="${tip}" aria-label="${tip}">Show in folder</button>`
        : '',
    acts = ignore || reveal ? `<div class="dv-guide-acts">${ignore}${reveal}</div>` : '';
  band.innerHTML = `<p class="dv-guide-hint">${hint}</p>${acts}`;
}

export function initGuideBand() {
  const band = bandEl();
  band.onchange = e => {
    const c = shown;
    if (!c?.role || !(e.target instanceof HTMLInputElement) || e.target.id !== 'dvIgnore') return;
    if (e.target.checked) c.ignoreRepo = true;
    else delete c.ignoreRepo;
    // only the words change, so the switch keeps the keyboard's place
    child(band, '.dv-guide-hint').textContent = hintOf(c, c.role, rootOf(session.board));
    renderCard(c);
    save();
  };
  band.onclick = e => {
    const root = rootOf(session.board);
    if (!shown?.role || !root || !closestTo(e.target, '#dvReveal')) return;
    Fenmyr.reveal(repoPath(root, shown.role)).catch(err => say(err instanceof Error ? err.message : String(err), 6000));
  };
}
