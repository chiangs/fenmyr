import type { Card } from '../../shared/model.ts';
import { elementById, textField } from '../ui/dom.ts';

const findField = () => elementById('fbQ', HTMLInputElement);

import { byId, selectOnly } from '../canvas/wires.ts';
import { find, hasAll, queryWords } from '../core/base.ts';
import { $ } from '../core/dom.ts';
import { session } from '../core/state.ts';
import { setChatText } from '../myra/chatInput.ts';
import { myraOpen } from '../myra/chatWindow.ts';
import { glideTo, wordsOf } from '../myra/greet.ts';
import { reply } from '../myra/say.ts';
import { applyDim } from './focus.ts';
import { cleanTag } from './tags.ts';

const readingOrder = (a: Card, b: Card) => Math.round(a.y / 90) - Math.round(b.y / 90) || a.x - b.x;

function findRun(keep: boolean) {
  const words = queryWords(findField().value);
  find.hits = words.length
    ? session.board.cards.filter(c => !c.hidden && hasAll(words, wordsOf(c))).sort(readingOrder)
    : [];
  find.i = keep && find.i < find.hits.length ? find.i : 0;
  find.cur = find.hits[find.i]?.id || null;
  find.set = find.hits.length ? new Set(find.hits.map(c => c.id)) : null;
  const tray = words.length ? session.board.tray.filter(c => hasAll(words, wordsOf(c))).length : 0;
  $('fbCount').textContent = !words.length
    ? 'Type to find'
    : find.hits.length
      ? `${find.i + 1} of ${find.hits.length}${tray ? ` · +${tray} in Unsorted` : ''}`
      : tray
        ? `${tray} in Unsorted`
        : 'No matches';
  $('fbCount').classList.toggle('none', !!words.length && !find.hits.length);
  elementById('fbPrev', HTMLButtonElement).disabled = elementById('fbNext', HTMLButtonElement).disabled =
    find.hits.length < 2;
  applyDim();
  const cur = find.cur ? byId(find.cur) : undefined;
  if (cur) glideTo([cur]);
  return find.hits.length;
}

function findStep(d: number) {
  if (find.hits.length < 2) return;
  find.i = (find.i + d + find.hits.length) % find.hits.length;
  findRun(true);
}

function findOpen(query = '') {
  find.on = true;
  myraOpen(false);
  selectOnly([]);
  $('findBar').hidden = false;
  findField().value = query;
  const n = findRun(false);
  findField().focus();
  findField().select();
  return n;
}

export function findClose(keep?: boolean) {
  if (!find.on) return;
  if (keep && find.cur && byId(find.cur)) selectOnly([find.cur]);
  find.on = false;
  find.set = find.cur = null;
  find.hits = [];
  $('findBar').hidden = true;
  applyDim();
}

let findT: ReturnType<typeof setTimeout> | undefined;

export function slashFind(arg: string) {
  const q = arg.trim();
  if (!q) {
    findOpen();
    return reply('Type what to look for in the find bar ✦');
  }
  const n = findOpen(q);
  reply(
    n
      ? `Found ${n} ${n === 1 ? 'card' : 'cards'} for “${q}”. Step through them with the find bar ✦`
      : `Nothing for “${q}”.`,
  );
}

export function slashTag(arg: string) {
  const t = cleanTag(arg).toLowerCase(),
    all = session.board.tags || [];
  if (!t)
    return reply(
      all.length
        ? 'Tags on this board: ' +
            all
              .map(
                x =>
                  `#${x} (${session.board.cards.filter(c => (c.tags || []).some(y => y.toLowerCase() === x.toLowerCase())).length})`,
              )
              .join(', ') +
            '. Try /tag ' +
            all[0] +
            ' ✦'
        : 'No tags on this board yet. Type # in a note to add one ✦',
    );
  const n = findOpen(`#${t}`);
  reply(
    n
      ? `Found ${n} ${n === 1 ? 'card' : 'cards'} tagged #${t}. Step through them with the find bar ✦`
      : `Nothing tagged #${t}.`,
  );
}

// Ctrl+F: Myra's chat opens ready to search. A draft in her box stays, so the find bar opens on its own.
export function startFind() {
  if (!session.board) return;
  if (find.on) {
    findField().focus();
    findField().select();
    return;
  }
  const el = textField('mcInput'),
    had = /^\/find /i.test(el.value);
  if (el.value.trim() && !/^\/find\b/i.test(el.value)) {
    findOpen();
    return;
  }
  myraOpen(true);
  if (!had) setChatText('/find ');
  el.focus();
  el.setSelectionRange(had ? 6 : el.value.length, el.value.length);
}
export function init34() {
  $('fbQ').addEventListener('input', () => {
    clearTimeout(findT);
    findT = setTimeout(() => findRun(false), 120);
  });

  $('fbQ').addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(findT);
      findStep(e.shiftKey ? -1 : 1);
    }
    if (e.key === 'Escape') findClose(true);
  });

  $('fbNext').onclick = () => findStep(1);
  $('fbPrev').onclick = () => findStep(-1);
  $('fbX').onclick = () => findClose(true);
}
