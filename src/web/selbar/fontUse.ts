import { oneIn } from '../ui/dom.ts';
import { googleCss, loadFont } from '../wireframe/tilt.ts';

/** What Google Fonts answers for a name typed into the font picker. */
type FontCheck = { kind: 'found'; name: string } | { kind: 'missing' } | { kind: 'unreachable' };

// any name the list doesn't have, offered as a Google font after the matches
export const USE_ROW =
  '<button type="button" class="dp-row dp-use" hidden><span></span><small>Google Fonts</small></button>';
// what the picker says when the Use row's font can't be had
export const USE_NOTE = '<p class="dp-note" role="status" hidden></p>';

/** Offers the typed name when no listed font is called that, and clears what was said about an earlier one. */
export function showUse(pop: HTMLElement, typed: string, listed: boolean) {
  const use = oneIn(pop, '.dp-use'),
    said = use?.querySelector('span'),
    note = oneIn(pop, '.dp-note');
  if (!use || !said) return;
  use.hidden = !typed || listed;
  // one run of text, as the row spreads its parts apart
  said.textContent = `Use “${typed}”`;
  if (use.hidden) delete use.dataset.bfont;
  else use.dataset.bfont = typed;
  if (note) note.hidden = true;
}

// Google's names are case-sensitive: it turns "pacifico" away and answers "Pacifico". So a name is also tried with
// each word's first letter raised, and only a name Google answers for is ever used.
const raised = (s: string) => s.replace(/(^|\s)(\p{Ll})/gu, (_, gap: string, ch: string) => gap + ch.toUpperCase());

async function check(typed: string): Promise<FontCheck> {
  for (const name of new Set([typed, raised(typed)])) if (await loadFont(name, true)) return { kind: 'found', name };
  // a name Google lacks and a network that's down fail alike; a request that can't read the answer tells them apart
  const reached = await fetch(googleCss(typed), { mode: 'no-cors', cache: 'no-store' }).then(
    () => true,
    () => false,
  );
  return reached ? { kind: 'missing' } : { kind: 'unreachable' };
}

function why(got: Exclude<FontCheck, { kind: 'found' }>, typed: string) {
  switch (got.kind) {
    case 'missing':
      return `Google Fonts has no font called “${typed}”. Check the spelling and capitals.`;
    case 'unreachable':
      return `Google Fonts can’t be reached, so “${typed}” wasn’t used. Try again when you’re online.`;
    default: {
      const unknown: never = got;
      return unknown;
    }
  }
}

/** The Use row's pick. The font is fetched first and lands only once it's here, so no card or setting is left naming
 *  a font that won't draw, and no undo step is spent on one. When it can't be had, the picker stays open, says why,
 *  and puts the keyboard back in its search. */
export async function useTyped(pop: HTMLElement, typed: string, pick: (f: string) => void) {
  const use = oneIn(pop, '.dp-use'),
    note = oneIn(pop, '.dp-note');
  use?.setAttribute('aria-busy', 'true');
  const got = await check(typed);
  use?.removeAttribute('aria-busy');
  // the picker closed, or its search moved on, while Google answered
  if (pop.hidden || use?.dataset.bfont !== typed) return;
  if (got.kind === 'found') return pick(got.name);
  if (note) {
    note.textContent = why(got, typed);
    note.hidden = false;
  }
  // back in the search, to put the name right
  oneIn(pop, '.dp-search')?.focus();
}
