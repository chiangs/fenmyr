import { kindOf } from '../../shared/askFiles.ts';
import type { BuildRecord } from '../../shared/build.ts';
import { GUIDE_ROLES, type GuideRole } from '../../shared/cardTypes.ts';
import {
  type ContextUse,
  counted,
  MAX_PICTURES,
  num,
  type Part,
  type PartKind,
  PICTURE_TOKENS,
  roomOf,
  shareWords,
  tokensOf,
  usedTokens,
  windowOf,
} from '../../shared/contextFit.ts';
import { guidesOf, isGuide } from '../../shared/guides.ts';
import { session } from '../core/state.ts';
import { brief, screensOf, wiresOf } from '../proto/brief.ts';
import { hasPicture } from '../proto/pictures.ts';
import { settings } from '../settings/settings.ts';
import { fitBoard } from './boardFit.ts';
import { modelLists } from './modelPicker.ts';
import type { Added } from './sees.ts';

// What the next message would take of the model's window, worked out before it is sent so the person can narrow it
// first. It reads the board the way a send does, through the same fit, so what it says is what the send will do.
// `trimmed`: some of the board wouldn't go whole.
export type Estimate = { trimmed: boolean; lines: string[] };

// a data: URL's bytes, which a text file's characters can't outnumber
function bytesOf(data: string): number {
  const b64 = data.slice(data.indexOf(',') + 1),
    padding = /=*$/.exec(b64)?.[0].length ?? 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

// What one thing added to the message costs. The host finds a vault note itself, so the window can't count it.
function addedTokens(a: Added): number {
  switch (a.kind) {
    case 'note':
      return 0;
    case 'paste':
      return tokensOf(a.text.length);
    case 'file':
      return kindOf(a.name) === 'picture' ? PICTURE_TOKENS : tokensOf(bytesOf(a.data));
    default: {
      const never: never = a;
      throw new Error(`unknown added ${String(never)}`);
    }
  }
}

function cutWords(shortened: number, left: number) {
  if (!left) return `${counted(shortened, 'card')} would be shortened`;
  if (!shortened) return `${counted(left, 'card')} would be left out`;
  return `${counted(shortened, 'card')} would be shortened and ${num(left)} left out`;
}

// the parts a build records for the repo's file and for the board's own words, for each document
const PARTS: Record<GuideRole, { repo: PartKind; board: PartKind }> = {
  rules: { repo: 'myra', board: 'boardRules' },
  design: { repo: 'design', board: 'boardDesign' },
};

// What a build from these cards would read, as a build sends it: each card's brief, the pictures a build takes, the
// board's own rules and design as they are now, and design.md and myra.md as the board's newest build was sent them,
// unless the board ignores one. The board's rules and design cards are not among the cards, since a build is given their
// words as those parts. The request and the preview's errors aren't known yet.
function buildUse(sel: ReadonlySet<string>, window: number): ContextUse {
  const b = session.board,
    about = b.cards.filter(c => !isGuide(c)),
    picked = about.filter(c => sel.has(c.id)),
    cards = picked.length ? picked : about,
    screens = screensOf(b.cards),
    wires = wiresOf(cards, b.links),
    pictures = Math.min(MAX_PICTURES, cards.filter(hasPicture).length),
    // the same charge the host makes for a card: its text and a comma
    cardTokens = cards.reduce((n, c) => n + tokensOf(JSON.stringify(brief(c, screens, wires)).length + 1), 0),
    before = b.chat?.flatMap(m => m.acts ?? []).findLast((a): a is BuildRecord => a.kind === 'build' && !!a.start?.use)
      ?.start?.use;
  const parts: Part[] = [{ kind: 'cards', tokens: cardTokens, count: cards.length }];
  if (pictures) parts.push({ kind: 'pictures', tokens: pictures * PICTURE_TOKENS, count: pictures });
  const guides = guidesOf(b.cards);
  for (const role of GUIDE_ROLES) {
    const { repo, board } = PARTS[role],
      tokens = guides[role].ignoreRepo ? 0 : before?.parts.find(p => p.kind === repo)?.tokens,
      words = guides[role].text.length;
    if (tokens) parts.push({ kind: repo, tokens });
    if (words) parts.push({ kind: board, tokens: tokensOf(words) });
  }
  return { window, parts, left: [], pictures: [], shortened: [], unseen: [], tooBig: [] };
}

/** What the next message would take of the model's window and whether the board would be trimmed, for the cards `sel`
 *  and what was `added`. On a prototype it adds what a build from those cards would take. */
export function estimateNext(sel: readonly string[], added: readonly Added[]): Estimate {
  const window = windowOf(modelLists(), settings.myraModel),
    selected = new Set(sel),
    { use } = fitBoard(selected, window),
    files = added.filter(a => a.kind !== 'note'),
    tokens = added.reduce((n, a) => n + addedTokens(a), 0),
    fileParts: Part[] = files.length ? [{ kind: 'files', tokens, count: files.length }] : [],
    lines = [`Your next message: ${shareWords({ ...use, parts: [...use.parts, ...fileParts] })}`];
  let trimmed = use.left.length + use.shortened.length > 0;
  if (trimmed) lines.push(`Too big to send whole: ${cutWords(use.shortened.length, use.left.length)}`);
  if (session.board.kind === 'prototype') {
    const build = buildUse(selected, window);
    lines.push(`A build from these cards: ${shareWords(build)}`);
    if (usedTokens(build) > roomOf(window)) {
      trimmed = true;
      lines.push('A build would leave some out to fit');
    }
  }
  return { trimmed, lines };
}
