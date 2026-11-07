import { linkMarkup } from '../docs/popMarkup.ts';
import { linkAddress } from '../richtext/doc.ts';
import { runsHtml } from '../richtext/render.ts';
import { child } from '../ui/dom.ts';
import { closeOnOutsidePress, keepOnScreen } from '../ui/popover.ts';
import { type Away, comeBack, type Return, stepAway } from './noteAway.ts';

type Open = Away & { readonly link: Element | null; readonly pop: HTMLElement };

let open: Open | null = null,
  closesOnOutsidePress = false;

// The address a press on a link in a note would follow, unless the note is being typed in.
export function linkUnder(a: Element | null) {
  return a?.matches('.card.note .text a[href]') && !(a instanceof HTMLElement && a.isContentEditable)
    ? linkAddress(a.getAttribute('href') ?? '')
    : undefined;
}

// What was typed in the box, as an address: an email address gets mailto:, anything else without a scheme https://.
function addressOf(typed: string) {
  const v = typed.trim();
  if (/^[^\s@/:]+@[^\s@/]+\.[^\s@/]+$/.test(v)) return linkAddress(`mailto:${v}`);
  return v ? linkAddress(/^(https?|mailto):/i.test(v) ? v : `https://${v}`) : undefined;
}

function close(how: Return) {
  const o = open;
  if (!o) return null;
  open = null;
  o.pop.remove();
  comeBack(o, how);
  return o;
}

// The whole link when the selection sits inside one, so a new address or Remove link changes all of it.
function selectLink(o: Open) {
  if (o.link && getSelection()?.isCollapsed) getSelection()?.selectAllChildren(o.link);
}

function apply(typed: string) {
  const o = close('refocus');
  if (!o) return;
  const href = addressOf(typed);
  selectLink(o);
  if (!href) {
    if (o.link) document.execCommand('unlink');
  } else if (getSelection()?.isCollapsed)
    document.execCommand('insertHTML', false, runsHtml([{ text: typed.trim(), marks: 0, href }]));
  else document.execCommand('createLink', false, href);
}

function act(what: string | undefined, href: string) {
  const o = close('refocus');
  if (what === 'open') Fenmyr.openURL(href);
  if (what !== 'remove' || !o) return;
  selectLink(o);
  document.execCommand('unlink');
}

export function openLinkPop(t: HTMLElement) {
  const away = open ? null : stepAway(t);
  if (!away) return;
  if (!closesOnOutsidePress)
    closeOnOutsidePress(
      '.note-link, .card.editing',
      () => !!open,
      () => close('leave'),
    );
  closesOnOutsidePress = true;
  const { range } = away,
    at = range.commonAncestorContainer,
    link = (at instanceof Element ? at : at.parentElement)?.closest('a[href]') ?? null,
    href = link?.getAttribute('href') ?? '',
    pop = document.createElement('div'),
    spot = range.getClientRects()[0] ?? t.getBoundingClientRect();
  pop.className = 'dv-pop pop-link note-link';
  pop.role = 'dialog';
  pop.ariaLabel = 'Link';
  pop.innerHTML = linkMarkup(href);
  pop.style.left = `${spot.left}px`;
  pop.style.top = `${spot.bottom + 8}px`;
  document.body.append(pop);
  keepOnScreen(pop);
  open = { ...away, link: link && t.contains(link) ? link : null, pop };
  const input = child(pop, 'input', HTMLInputElement);
  child(pop, 'form', HTMLFormElement).onsubmit = e => {
    e.preventDefault();
    apply(input.value);
  };
  pop.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape') close('refocus');
  });
  pop.addEventListener('focusout', e => {
    const to = e.relatedTarget instanceof Node ? e.relatedTarget : null;
    if (!pop.contains(to)) close(to && t.contains(to) ? 'back' : 'leave');
  });
  pop.addEventListener('click', e => {
    const b = e.target instanceof Element ? e.target.closest('[data-link]') : null;
    if (b instanceof HTMLElement) act(b.dataset.link, href);
  });
  input.focus();
  input.select();
}
