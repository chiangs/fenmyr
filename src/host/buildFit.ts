import {
  CHARS_PER_TOKEN,
  type ContextUse,
  fitRanked,
  MAX_PICTURES,
  type Part,
  PICTURE_TOKENS,
  roomOf,
  tokensOf,
} from '../shared/contextFit.ts';
import type { BoardGuide, BoardGuides } from '../shared/guides.ts';

type Card = { id: string; text: string };
type Picture = { id: string; name: string; data: string };

/** What the window sent for a build, before it is fitted: cards and pictures ranked with the most worth keeping first,
 *  and the card ids the window already knows have no picture (unseen: screens out of view; tooBig: pictures too big to
 *  send; over: cards past the most pictures a build takes). design and myra are the repo's files; guides is what the
 *  board says for each of them. */
export type Sent = {
  request: string;
  purpose: string;
  device: string;
  errors: string;
  design: string;
  myra: string;
  guides: BoardGuides;
  cards: Card[];
  pictures: Picture[];
  unseen: string[];
  tooBig: string[];
  over: string[];
};

/** What the builder is given, and what that took of the window. cards: the kept cards as one JSON array, or '' when
 *  none were kept. design and myra are the repo's text, '' when the board ignores it; ignoreRepo says which. */
export type Fitted = {
  request: string;
  purpose: string;
  device: string;
  errors: string;
  design: string;
  myra: string;
  boardRules: string;
  boardDesign: string;
  ignoreRepo: { rules: boolean; design: boolean };
  cards: string;
  pictures: Picture[];
  use: ContextUse;
};

/** Each of the preview's errors, and design.md with the board's design, and myra.md with the board's rules, may take this
 *  share of the room, so none of them crowds out the cards, which are what the build is about. The request may take a
 *  quarter. */
export const TEXT_SHARE = 1 / 8;
const REQUEST_SHARE = 1 / 4;
// fields rather than content, so they don't follow the window
const PURPOSE_CHARS = 500;
const DEVICE_CHARS = 20;

const cutTo = (text: string, max: number) => ({ text: text.slice(0, max), cut: text.length > max });

type TextKind = 'errors' | 'design' | 'myra' | 'boardRules' | 'boardDesign';

// A text cut to nothing is still listed, with no words, so a cut is never silent.
function textPart(kind: TextKind, t: { text: string; cut: boolean }): Part[] {
  if (!t.text) return t.cut ? [{ kind, tokens: 0, count: 0, cut: true }] : [];
  const cut: { cut?: true } = t.cut ? { cut: true } : {};
  return [{ kind, tokens: tokensOf(t.text.length), ...cut }];
}

// One document takes one share for the repo's text and the board's together. The board's is cut to it first, since it
// wins, and the repo's gets what is left. The repo's text is not used at all when the board ignores it.
function guided(repo: string, guide: BoardGuide, share: number) {
  const board = cutTo(guide.text, share);
  return { board, repo: guide.ignoreRepo ? { text: '', cut: false } : cutTo(repo, share - board.text.length) };
}

/** Fits what a build is sent to the part of the model's window the board may fill, and records what that took and what
 *  was left out. The texts are cut first, then the cards are kept in their ranked order while each still fits, then the
 *  pictures with what the cards left. A card or picture that doesn't fit is left out whole, and a smaller one after it
 *  can still go in. */
export function fitBuild(s: Sent, window: number): Fitted {
  const room = roomOf(window),
    chars = room * CHARS_PER_TOKEN,
    purpose = s.purpose.slice(0, PURPOSE_CHARS),
    device = s.device.slice(0, DEVICE_CHARS),
    request = cutTo(s.request, Math.floor(chars * REQUEST_SHARE)),
    each = Math.floor(chars * TEXT_SHARE),
    errors = cutTo(s.errors, each),
    design = guided(s.design, s.guides.design, each),
    myra = guided(s.myra, s.guides.rules, each);
  const asked: { cut?: true } = request.cut ? { cut: true } : {};
  const requestPart: Part = {
    kind: 'request',
    tokens: tokensOf(request.text.length + purpose.length + device.length),
    ...asked,
  };
  const texts = [
    ...textPart('errors', errors),
    ...textPart('design', design.repo),
    ...textPart('boardDesign', design.board),
    ...textPart('myra', myra.repo),
    ...textPart('boardRules', myra.board),
  ];
  const spent = requestPart.tokens + texts.reduce((sum, p) => sum + p.tokens, 0);

  // what the fit charges is what the part records, so the parts never add up to more than the room
  const cost = (c: Card) => tokensOf(c.text.length + 1);
  const { kept, left } = fitRanked(s.cards, room - spent, cost);
  const cardTokens = kept.reduce((sum, c) => sum + cost(c), 0);

  const within = s.pictures.slice(0, MAX_PICTURES),
    beyond = s.pictures.slice(MAX_PICTURES),
    shots = fitRanked(within, room - spent - cardTokens, () => PICTURE_TOKENS);
  const pictureParts: Part[] = s.pictures.length
    ? [{ kind: 'pictures', tokens: shots.kept.length * PICTURE_TOKENS, count: shots.kept.length }]
    : [];

  const use: ContextUse = {
    window,
    parts: [requestPart, { kind: 'cards', tokens: cardTokens, count: kept.length }, ...pictureParts, ...texts],
    left: left.map(c => c.id),
    pictures: [...s.over, ...beyond.map(p => p.id), ...shots.left.map(p => p.id)],
    shortened: [],
    unseen: s.unseen,
    tooBig: s.tooBig,
  };
  return {
    request: request.text,
    purpose,
    device,
    errors: errors.text,
    design: design.repo.text,
    myra: myra.repo.text,
    boardRules: myra.board.text,
    boardDesign: design.board.text,
    ignoreRepo: { rules: s.guides.rules.ignoreRepo, design: s.guides.design.ignoreRepo },
    cards: kept.length ? `[${kept.map(c => c.text).join(',\n')}]` : '',
    pictures: shots.kept,
    use,
  };
}
