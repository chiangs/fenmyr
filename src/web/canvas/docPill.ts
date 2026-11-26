import type { CardOf } from '../../shared/model.ts';
import { CIC } from '../cards/shapes.ts';
import { esc } from '../ui/dom.ts';

// A doc card is its title in a pill. A prototype's own rules or design that leaves the repo's file out says so.
export function docPill(c: CardOf<'doc'>) {
  const text = esc(c.text),
    ignored = c.role && c.ignoreRepo ? '<span class="guide-tag">Repo ignored</span>' : '';
  return `<div class="pill">${CIC.doc}<span class="text">${text}</span>${ignored}</div>`;
}
