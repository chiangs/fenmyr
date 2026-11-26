import { GUIDE_ROLES, type GuideRole } from '../../shared/cardTypes.ts';
import { guideDocs, guidesOf } from '../../shared/guides.ts';
import { $ } from '../core/dom.ts';
import { session } from '../core/state.ts';
import { openDoc } from '../docs/editor.ts';
import { rootOf } from '../repo/codeFolder.ts';
import { closestTo, esc } from '../ui/dom.ts';
import { type Chip, type GuideInput, guideChips } from './sees.ts';

// The strip's chips for the four documents a build is sent: the repo's prototypes/myra.md and design.md, and the board's
// own rules and design cards. They say what a build gets, so they are not choices, with no × or +. The repo's are
// information, and the board's open the card they come from.

type Guide = Extract<Chip, { kind: 'guide' }>;

/** What the open board says of its rules and design, or null when it isn't a prototype. */
export function guideInput(): GuideInput | null {
  const b = session.board;
  return b?.kind === 'prototype' ? { repo: rootOf(b) !== null, board: guidesOf(b.cards) } : null;
}

/** What the strip and its estimate read of the board's own rules and design: the chips, and how long each one's words
 *  are, so a change to either draws the strip again and works the estimate out again, and typing elsewhere does neither. */
export const guideKey = (g: GuideInput | null) =>
  JSON.stringify([guideChips(g), g && GUIDE_ROLES.map(r => g.board[r].text.length)]);

const WORDS: Record<GuideRole, { file: string; replaces: string; board: string }> = {
  rules: {
    file: 'prototypes/myra.md',
    replaces: 'this board’s rules replace it',
    board: 'This board’s rules go with every build, and win where they differ from the repo’s',
  },
  design: {
    file: 'prototypes/design.md',
    replaces: 'this board’s design replaces it',
    board: 'This board’s design goes with every build, and wins where it differs from the repo’s',
  },
};

function wordsOf(c: Guide) {
  const w = WORDS[c.role],
    repo = c.from === 'repo',
    tip = repo
      ? c.ignored
        ? `${w.file} is ignored: ${w.replaces}`
        : `${w.file} goes with every build of this prototype`
      : w.board;
  return { tip, label: `${repo ? 'Repo' : 'Board'} ${c.role}${c.ignored ? ' · ignored' : ''}` };
}

// The tooltip is the strip's own: fixed to the window and placed by seesStrip.ts, so the scrolling strip doesn't cut it off.
export function guideHTML(c: Guide): string {
  const { tip, label } = wordsOf(c),
    words = esc(tip),
    name = esc(`${tip}. Press to open the ${c.role} card`),
    shown = esc(label),
    cls = c.ignored ? 'mcs-chip guide out' : 'mcs-chip guide',
    attrs = `data-chip="guide" data-guide="${c.from}-${c.role}" data-tip="${words}" data-tip-at="below"`,
    text = `<span class="mcs-t">${shown}</span>`;
  return c.from === 'repo'
    ? `<span class="${cls}" role="group" tabindex="0" ${attrs} aria-label="${words}">${text}</span>`
    : `<button type="button" class="${cls}" ${attrs} data-open-guide="${c.role}" aria-label="${name}">${text}</button>`;
}

// The first of the role's cards that has words, which is the one the chip came from.
function openGuide(role: GuideRole) {
  const docs = guideDocs(session.board.cards, role),
    doc = docs.find(c => (c.body ?? '').trim()) ?? docs[0];
  if (doc) openDoc(doc);
}

export function initGuides() {
  $('mcSees').addEventListener('click', e => {
    const want = closestTo(e.target, '[data-open-guide]')?.dataset.openGuide,
      role = GUIDE_ROLES.find(r => r === want);
    if (role) openGuide(role);
  });
}
