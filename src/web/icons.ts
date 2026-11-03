import { isRecord } from '../shared/model.ts';
import { esc } from './ui/dom.ts';

// The icon facade. The app asks for a Myra icon name (Icon('note')); the pack in web/icons/pack.js (built by tools/icons.js from
// tools/icons/set.js) says what it looks like, so the icon pack can be swapped without touching the app.
// Every icon carries both weights; the Icon style setting (Regular or Duotone) switches a class on <body>, and only the bottom bar and the chat header show Duotone.

type IconEntry = { r: string; d?: string; t?: string; p?: number; kw?: string };
const text = (v: unknown) => (typeof v === 'string' ? v : undefined);

// web/icons/pack.js is a script that sets a global, so its contents are checked here like any other outside data.
function readPack(): Record<string, IconEntry> {
  const pack: unknown = Reflect.get(window, 'FENMYR_ICON_PACK');
  if (!isRecord(pack) || !isRecord(pack.icons)) return {};
  const icons: Record<string, IconEntry> = {};
  for (const [name, e] of Object.entries(pack.icons)) {
    if (!isRecord(e) || typeof e.r !== 'string') continue;
    const entry: IconEntry = { r: e.r };
    const d = text(e.d),
      t = text(e.t),
      kw = text(e.kw);
    if (d !== undefined) entry.d = d;
    if (t !== undefined) entry.t = t;
    if (kw !== undefined) entry.kw = kw;
    if (typeof e.p === 'number') entry.p = e.p;
    icons[name] = entry;
  }
  return icons;
}

const ICONS = readPack();
// a name nobody has drawn shows a neutral placeholder, with the name as its tooltip, so nothing is ever blank
const entry = (name: string) => ICONS[name] ?? ICONS.missing;
const inside = (name: string, title?: string) => {
  const e = entry(name),
    tip = esc(title || name),
    label = !ICONS[name] || title ? `<title>${tip}</title>` : '',
    regular = e ? e.r : '',
    duotone = e ? (e.d ?? (e.t ?? '') + e.r) : '';
  return `${label}<g class="ico-r">${regular}</g><g class="ico-d">${duotone}</g>`;
};
// Icon('note', { cls: 'ic', size: 18, title: 'Note' }) → an <svg> string
window.Icon = (name, o = {}) => {
  const cls = o.cls ? ` ${o.cls}` : '',
    size = o.size ? ` width="${o.size}" height="${o.size}"` : '',
    shown = esc(name),
    content = inside(name, o.title);
  return `<svg class="ico${cls}" viewBox="0 0 256 256" aria-hidden="true" data-ico="${shown}"${size}>${content}</svg>`;
};
// fills the empty <svg data-ico="note"> placeholders in the page (or in a part of it)
window.hydrateIcons = (root = document) => {
  for (const s of root.querySelectorAll('svg[data-ico]:not(.ico)')) {
    if (!(s instanceof SVGElement)) continue;
    s.setAttribute('viewBox', '0 0 256 256');
    s.setAttribute('aria-hidden', 'true');
    s.classList.add('ico');
    s.innerHTML = inside(s.dataset.ico ?? '');
  }
};
window.iconKnown = name => !!ICONS[name];
// for the picker: every name with the words people might search for
window.iconList = () =>
  Object.entries(ICONS)
    .filter(([, e]) => e.p)
    .sort((a, b) => (a[1].p ?? 0) - (b[1].p ?? 0))
    .map(([name, e]) => ({ name, kw: (e.kw || name).toLowerCase() }));
window.hydrateIcons();
