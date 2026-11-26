import type { GuideRole } from './cardTypes.ts';
import { rankCards } from './contextFit.ts';
import { type Card, isRecord } from './model.ts';

/** What a prototype board says for one of the repo's documents: its text, and whether the repo's own text is left out. */
export type BoardGuide = { text: string; ignoreRepo: boolean };
export type BoardGuides = Record<GuideRole, BoardGuide>;

/** A doc card that is the board's own rules or design, not one of the cards the build is about. */
export const isGuide = (c: Card) => c.type === 'doc' && c.role !== undefined;

const guideOf = (cards: readonly Card[], role: GuideRole): BoardGuide => {
  const docs = rankCards(
    cards.flatMap(c => (c.type === 'doc' && c.role === role ? [c] : [])),
    new Set(),
    [],
  );
  return {
    text: docs
      .map(c => (c.body ?? '').trim())
      .filter(Boolean)
      .join('\n\n'),
    ignoreRepo: docs.some(c => c.ignoreRepo === true),
  };
};

/** The board's text for each document, from its doc cards by role. Copying a card makes two of one role, so all of them
 *  count: their words in reading order, and the repo's text left out when any of them says so. */
export const guidesOf = (cards: readonly Card[]): BoardGuides => ({
  rules: guideOf(cards, 'rules'),
  design: guideOf(cards, 'design'),
});

const readGuide = (x: unknown): BoardGuide =>
  isRecord(x)
    ? { text: typeof x.text === 'string' ? x.text : '', ignoreRepo: x.ignoreRepo === true }
    : { text: '', ignoreRepo: false };

/** The host's parse of what the window sent: anything malformed reads as no text, with the repo's text kept. */
export const readBoardGuides = (x: unknown): BoardGuides => {
  const o = isRecord(x) ? x : {};
  return { rules: readGuide(o.rules), design: readGuide(o.design) };
};
