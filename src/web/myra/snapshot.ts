import { buildLine } from '../../shared/build.ts';
import type { ChatMsg } from '../../shared/chat.ts';
import { type Card, swatchName } from '../../shared/model.ts';
import { appState, session } from '../core/state.ts';
import { hasDue } from '../features/due.ts';
import { myTpls } from '../features/templates.ts';
import { foldersIn, looseFolders } from '../library/tree.ts';
import { building, liveOf } from '../proto/buildSlot.ts';
import { canonical } from '../richtext/dialect.ts';
import { currentBuild, currentChannel } from '../settings/about.ts';
import { settings } from '../settings/settings.ts';
import { FONTS } from '../wireframe/wireframes.ts';
import { birthdayFacts } from './birthday.ts';
import { chatKeep, chatLog } from './chatLog.ts';
import { SLASH } from './greet.ts';

// a line as she reads it back: a build's block has no words of its own, so it reads as how the build went
const saidIn = (m: ChatMsg) => {
  const block = m.acts?.find(a => a.kind === 'build');
  return block?.kind === 'build' ? buildLine(block, liveOf(block.build)) : m.text;
};

// how far a card's words are cut when the board has to be shortened to fit: a card's text, and a doc's body
const CUT = { text: 300, body: 600 };

const words = (c: Card) =>
  c.type === 'note' && c.rich ? canonical(c.text ?? '') : c.text || c.title || swatchName(c) || '';
const upTo = (s: string, n: number, cut: boolean) => (cut ? s.slice(0, n) : s);

/** Whether cutting the card's words short would lose any of them. A vault note sends none, so it is never long. */
export const isLong = (c: Card) =>
  c.type !== 'vnote' && (words(c).length > CUT.text || ('body' in c && !!c.body && c.body.length > CUT.body));

/** A card as Myra reads it, with its words whole or, when `cut`, shortened. */
export const brief = (c: Card, selected: ReadonlySet<string>, cut: boolean) =>
  c.type === 'vnote'
    ? { id: c.id, type: 'vnote', x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.w), h: Math.round(c.h) }
    : {
        id: c.id,
        type: c.type,
        x: Math.round(c.x),
        y: Math.round(c.y),
        w: Math.round(c.w),
        h: Math.round(c.h),
        color: c.color,
        text: upTo(words(c), CUT.text, cut),
        font: c.font,
        name: c.name,
        kids: 'kids' in c ? c.kids : undefined,
        desc: c.desc,
        body: 'body' in c && c.body ? upTo(c.body, CUT.body, cut) : undefined,
        shape: 'shape' in c ? c.shape : undefined,
        label: c.tagText,
        tags: (c.tags || []).length ? c.tags : undefined,
        due: hasDue(c) ? c.due : undefined,
        items: 'items' in c && c.items ? c.items.map(i => i.t) : undefined,
        hex: c.hex,
        url: 'url' in c ? c.url : undefined,
        selected: selected.has(c.id) || undefined,
      };

/** short: the cards whose words go cut short. drop: the cards left out, and the links that touch them. */
type Trim = { short: ReadonlySet<string>; drop: ReadonlySet<string> };
const UNTRIMMED: Trim = { short: new Set(), drop: new Set() };

// what Myra sees: the cards, where they are, which are selected, and what's in Unsorted. `selected`: the cards a
// question was sent with, which may differ from what is selected when her turn comes. `trim`: what a board too big for
// her window gives up; with any, she is told in "cutToFit" so she doesn't say a card isn't there.
export function snapshot(selected: ReadonlySet<string> = session.sel, trim: Trim = UNTRIMMED) {
  const build = currentBuild();
  // a card the app can't read is left out: she has nothing she could act on
  const gone = new Set([
    ...[...session.board.cards, ...session.board.tray].filter(c => c.type === 'unknown').map(c => c.id),
    ...trim.drop,
  ]);
  const shown = (cards: Card[]) => cards.filter(c => !gone.has(c.id));
  const cards = shown(session.board.cards),
    unsorted = shown(session.board.tray);
  const shortened = [...cards, ...unsorted].filter(c => trim.short.has(c.id) && isLong(c)).length;
  return {
    today: `${new Date().toDateString()}, ${new Date().toTimeString().slice(0, 5)}`,
    name: session.board.name,
    boardTags: session.board.tags || [],
    myTemplates: myTpls.map(t => t.name),
    cards: cards.map(c => brief(c, selected, trim.short.has(c.id))),
    links: session.board.links.filter(l => !gone.has(l.a) && !gone.has(l.b)).map(l => [l.a, l.b]),
    unsorted: unsorted.map(c => brief(c, selected, trim.short.has(c.id))),
    cutToFit: trim.short.size || trim.drop.size ? { left: trim.drop.size, shortened } : undefined,
    boardColors: session.board.palette,
    fontsOnThisComputer: FONTS.filter(f => !/^(\.|Apple |System|STIX|Noto Sans [A-Z][a-z]+ [A-Z])/.test(f)).slice(
      0,
      400,
    ),
    recentChat: (chatKeep() === 'off' ? chatLog().slice(-2) : chatLog().slice(-8)).map(
      m => `${m.who === 'me' ? 'Person' : 'Myra'}: ${saidIn(m)}`,
    ),
    myraStyle: { name: settings.name || '', chat: settings.chat, emoji: !!settings.emoji }, // the host turns these into words (TONES in linux/prompts.js)
    commands: SLASH.filter(c => !c.dev).map(c => ({ cmd: c.cmd, arg: c.arg, desc: c.desc, ex: c.ex, opts: c.opts })),
    // building: a build runs or waits, so one she asks for now waits its turn
    prototype:
      session.board.kind === 'prototype'
        ? {
            stack: session.board.proto.stack,
            purpose: session.board.proto.purpose,
            device: session.board.proto.device,
            building: building() || undefined,
          }
        : undefined,
    // which Fenmyr this is, for "what version am I on?" and for writing up a bug
    fenmyr: build
      ? { version: build.version, commit: build.short, changes: build.changes, channel: currentChannel() }
      : undefined,
    person: birthdayFacts(), // the slash commands, so she knows every one (the host puts them in her instructions)
    library: {
      projects: appState.projects.map(p => ({
        name: p.name,
        folders: foldersIn(p.id).map(f => f.name),
        prototypingFolders: foldersIn(p.id)
          .filter(f => f.kind === 'prototyping')
          .map(f => f.name),
        repo: p.repo ? { folder: p.repo.path, github: p.repo.github ?? null } : null,
      })),
      foldersNotInAProject: looseFolders().map(f => f.name),
      boards: appState.boardList.map(b => ({
        id: b.id,
        name: b.name,
        folder: appState.folders.find(f => f.id === b.folder)?.name || null,
        current: b.id === session.board.id || undefined,
        prototype: b.kind === 'prototype' || undefined,
      })),
    },
  };
}
