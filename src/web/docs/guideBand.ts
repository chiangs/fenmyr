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
const FILES: Record<GuideRole, { noun: string; file: string }> = {
  rules: { noun: 'rules', file: 'prototypes/myra.md' },
  design: { noun: 'design', file: 'prototypes/design.md' },
};

// what the hint says: this adds to the repo's file, this is all the builder gets because the switch leaves the repo's
// out, or this is all it gets because the project has no repo
type HintState = 'adding' | 'ignoring' | 'noRepo';
const HINTS: Record<GuideRole, Record<HintState, string>> = {
  rules: {
    adding:
      'Rules for this prototype only, such as “buttons are full width on phones”. They’re added to the repo’s rules in prototypes/myra.md, and win where the two differ.',
    ignoring:
      'Only these rules go to the builder. The repo’s rules in prototypes/myra.md are ignored for this prototype.',
    noRepo:
      'Rules for this prototype, such as “buttons are full width on phones”. Its project has no repo, so these are the only rules the builder gets.',
  },
  design: {
    adding:
      'Design for this prototype only: colours, fonts, spacing, components. It’s added to the repo’s design in prototypes/design.md, and wins where the two differ.',
    ignoring:
      'Only this design goes to the builder. The repo’s design in prototypes/design.md is ignored for this prototype.',
    noRepo:
      'Design for this prototype: colours, fonts, spacing, components. Its project has no repo, so this is the only design the builder gets.',
  },
};

const bandEl = () => elementById('dvGuide', HTMLElement);
let shown: DocCard | null = null;

const repoPath = (root: string, role: GuideRole) => `${root}/${FILES[role].file}`;

function hintOf(c: DocCard, role: GuideRole, root: string | null) {
  if (!root) return HINTS[role].noRepo;
  return HINTS[role][c.ignoreRepo ? 'ignoring' : 'adding'];
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
