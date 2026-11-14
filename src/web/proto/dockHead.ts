import type { Board } from '../../shared/model.ts';
import type { Proto } from '../../shared/repos.ts';
import { $ } from '../core/dom.ts';

// The docked chat's header names the prototype and what its code is written in. Myra's own name stays the chat's
// accessible name, hidden from view there.
const STACK: Record<Proto['stack'], string> = { react: 'React', html: 'HTML' };

export function renderDockHead(b: Board) {
  if (b.kind !== 'prototype') return;
  const name = $('mcBoardName');
  name.textContent = b.name;
  name.title = b.name;
  $('mcStack').textContent = `Prototype · ${STACK[b.proto.stack]}`;
}
