import type { Card } from '../../shared/model.ts';
import { appState, session } from '../core/state.ts';
import { hasDue } from '../features/due.ts';
import { myTpls } from '../features/templates.ts';
import { foldersIn, looseFolders } from '../library/tree.ts';
import { canonical } from '../richtext/dialect.ts';
import { settings } from '../settings/settings.ts';
import { FONTS } from '../wireframe/wireframes.ts';
import { birthdayFacts } from './birthday.ts';
import { chatKeep, chatLog } from './chatLog.ts';
import { SLASH } from './greet.ts';

// what Myra sees: the cards (trimmed), where they are, what's selected, and what's in Unsorted
export function snapshot() {
  const words = (c: Card) =>
    c.type === 'note' && c.rich ? canonical(c.text ?? '') : c.text || c.title || c.label || '';
  const brief = (c: Card) =>
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
          text: words(c).slice(0, 300),
          font: c.font,
          name: c.name,
          kids: 'kids' in c ? c.kids : undefined,
          desc: c.desc,
          body: 'body' in c && c.body ? c.body.slice(0, 600) : undefined,
          shape: 'shape' in c ? c.shape : undefined,
          label: c.tagText,
          tags: (c.tags || []).length ? c.tags : undefined,
          due: hasDue(c) ? c.due : undefined,
          items: 'items' in c && c.items ? c.items.map(i => i.t) : undefined,
          hex: c.hex,
          url: 'url' in c ? c.url : undefined,
          selected: session.sel.has(c.id) || undefined,
        };
  return {
    today: `${new Date().toDateString()}, ${new Date().toTimeString().slice(0, 5)}`,
    name: session.board.name,
    boardTags: session.board.tags || [],
    myTemplates: myTpls.map(t => t.name),
    cards: session.board.cards.map(brief),
    links: session.board.links.map(l => [l.a, l.b]),
    unsorted: session.board.tray.map(brief),
    boardColors: session.board.palette,
    fontsOnThisComputer: FONTS.filter(f => !/^(\.|Apple |System|STIX|Noto Sans [A-Z][a-z]+ [A-Z])/.test(f)).slice(
      0,
      400,
    ),
    recentChat: (chatKeep() === 'off' ? chatLog().slice(-2) : chatLog().slice(-8)).map(
      m => `${m.who === 'me' ? 'Person' : 'Myra'}: ${m.text}`,
    ),
    myraStyle: { name: settings.name || '', chat: settings.chat, emoji: !!settings.emoji }, // the host turns these into words (TONES in linux/prompts.js)
    commands: SLASH.filter(c => !c.dev).map(c => ({ cmd: c.cmd, arg: c.arg, desc: c.desc, ex: c.ex, opts: c.opts })),
    prototype:
      session.board.kind === 'prototype'
        ? { stack: session.board.proto.stack, purpose: session.board.proto.purpose, device: session.board.proto.device }
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
