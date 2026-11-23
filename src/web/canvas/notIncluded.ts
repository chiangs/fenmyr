import type { CardOf } from '../../shared/model.ts';
import { esc } from '../ui/dom.ts';

// What a card says where its video or its text was left out of the zip it came from.
export function videoGone(c: CardOf<'video'>) {
  const title = esc(c.title || 'Video');
  return `<div class="vd-stage"><div class="vd-msg"><b>Video not included in this file</b></div></div><div class="vd-bar"><span class="vd-title">${title}</span></div>`;
}

export const whyGone = (c: CardOf<'vnote'>) =>
  c.notIncluded
    ? 'Text not included'
    : c.missing
      ? 'I can’t find this note any more.'
      : 'Not available: this board isn’t allowed to read it.';
