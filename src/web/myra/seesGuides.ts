import { GUIDE_ROLES, type GuideRole } from '../../shared/cardTypes.ts';
import { guideDocs, guidesOf } from '../../shared/guides.ts';
import { $ } from '../core/dom.ts';
import { session } from '../core/state.ts';
import { openDoc } from '../docs/editor.ts';
import { rootOf } from '../repo/codeFolder.ts';
import { closestTo, esc } from '../ui/dom.ts';
import { type Chip, type GuideInput, guideChips } from './sees.ts';

// The strip's chips for the two documents a build is sent, the rules and the design: one each, saying whether the text
// comes from the repo's prototypes/myra.md or design.md, from the board's own card, or from both. They say what a build
// gets, so they are not choices, with no × or +. One with the board's words opens the card they come from, and one that
// only names the repo's file is information.

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

type Say = { label: string; tip: string };

// What a document's chip says, by where the repo's file stands and whether the board has words of its own: the repo's
// file alone, the repo's file and the board's words, or (with no repo) the board's words alone.
type Words = {
  repo: Record<'sent' | 'ignored', Say>;
  both: Record<'sent' | 'ignored', Say>;
  board: Say;
};

const WORDS: Record<GuideRole, Words> = {
  rules: {
    repo: {
      sent: { label: 'Repo rules', tip: 'prototypes/myra.md goes with every build of this prototype' },
      ignored: {
        label: 'Repo rules · ignored',
        tip: 'prototypes/myra.md is ignored and this board’s rules are empty, so no rules go with a build',
      },
    },
    both: {
      sent: {
        label: 'Repo + board rules',
        tip: 'prototypes/myra.md and this board’s rules go with every build; where they differ, the board’s win',
      },
      ignored: {
        label: 'Board rules',
        tip: 'Only this board’s rules go with every build: prototypes/myra.md is ignored',
      },
    },
    board: { label: 'Board rules', tip: 'This board’s rules go with every build' },
  },
  design: {
    repo: {
      sent: { label: 'Repo design', tip: 'prototypes/design.md goes with every build of this prototype' },
      ignored: {
        label: 'Repo design · ignored',
        tip: 'prototypes/design.md is ignored and this board’s design is empty, so no design goes with a build',
      },
    },
    both: {
      sent: {
        label: 'Repo + board design',
        tip: 'prototypes/design.md and this board’s design go with every build; where they differ, the board’s wins',
      },
      ignored: {
        label: 'Board design',
        tip: 'Only this board’s design goes with every build: prototypes/design.md is ignored',
      },
    },
    board: { label: 'Board design', tip: 'This board’s design goes with every build' },
  },
};

function sayOf(c: Guide): Say {
  const w = WORDS[c.role];
  if (c.repo === 'none') return w.board;
  return c.board ? w.both[c.repo] : w.repo[c.repo];
}

// The tooltip is the strip's own: fixed to the window and placed by seesStrip.ts, so the scrolling strip doesn't cut it off.
// A chip with the board's words opens their card. One that only says the repo's file is ignored is dashed, like a chip
// that is left out, and offers nothing to press.
export function guideHTML(c: Guide): string {
  const { tip, label } = sayOf(c),
    words = esc(tip),
    name = esc(`${tip}. Press to open the ${c.role} card`),
    shown = esc(label),
    out = c.repo === 'ignored' && !c.board,
    cls = out ? 'mcs-chip guide out' : 'mcs-chip guide',
    attrs = `data-chip="guide" data-guide="${c.role}" data-tip="${words}" data-tip-at="below"`,
    text = `<span class="mcs-t">${shown}</span>`;
  return c.board
    ? `<button type="button" class="${cls}" ${attrs} data-open-guide="${c.role}" aria-label="${name}">${text}</button>`
    : `<span class="${cls}" role="group" tabindex="0" ${attrs} aria-label="${words}">${text}</span>`;
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
