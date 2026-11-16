import type { Board } from '../../shared/model.ts';
import type { Proto } from '../../shared/repos.ts';
import { $ } from '../core/dom.ts';
import { newestChanges } from './buildRecord.ts';
import { markChanged, openChanged } from './code.ts';
import { openColumn } from './layout.ts';

// The docked chat's header names the prototype and what its code is written in. Myra's own name stays the chat's
// accessible name, hidden from view there.
const STACK: Record<Proto['stack'], string> = { react: 'React', html: 'HTML' };

export function renderDockHead(b: Board) {
  if (b.kind !== 'prototype') return;
  const name = $('mcBoardName');
  name.textContent = b.name;
  name.title = b.name;
  $('mcStack').textContent = `Prototype · ${STACK[b.proto.stack]}`;
  showChanges(b);
}

/** The changes counter: how many files the newest build changed, which opens the code pane on them, each marked with a
 *  dot there. It reads the build's record, so it costs no git process. The git bar counts something else: what isn't
 *  committed. */
export function showChanges(b: Board) {
  const files = newestChanges(b),
    count = files.length === 1 ? '1 change' : `${files.length} changes`,
    btn = $('mcChanges');
  btn.hidden = !files.length;
  btn.textContent = count;
  btn.ariaLabel = `${count} in the last build`;
  btn.onclick = () => openColumn('code').then(openChanged);
  markChanged(files);
}
