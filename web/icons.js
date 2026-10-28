// The icon facade. The app asks for a Myra icon name (Icon('note')); the pack in web/icons/pack.js (built by tools/icons.js from
// tools/icons/set.js) says what it looks like, so the icon pack can be swapped without touching the app.
// Every icon carries both weights; the Icon style setting (Regular or Duotone) switches a class on <body>, and only the bottom bar and the chat header show Duotone.
(() => {
  const PACK = window.FENMYR_ICON_PACK || { icons: {} }, ICONS = PACK.icons;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // a name nobody has drawn shows a neutral placeholder, with the name as its tooltip, so nothing is ever blank
  const entry = name => ICONS[name] || ICONS.missing;
  const inside = (name, title) => { const e = entry(name); return (!ICONS[name] || title ? `<title>${esc(title || name)}</title>` : '') + `<g class="ico-r">${e ? e.r : ''}</g><g class="ico-d">${e ? (e.d ?? e.t + e.r) : ''}</g>`; };
  // Icon('note', { cls: 'ic', size: 18, title: 'Note' }) → an <svg> string
  window.Icon = (name, o = {}) => `<svg class="ico${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 256 256" aria-hidden="true" data-ico="${esc(name)}"${o.size ? ` width="${o.size}" height="${o.size}"` : ''}>${inside(name, o.title)}</svg>`;
  // fills the empty <svg data-ico="note"> placeholders in the page (or in a part of it)
  window.hydrateIcons = (root = document) => root.querySelectorAll('svg[data-ico]:not(.ico)').forEach(s => {
    s.setAttribute('viewBox', '0 0 256 256'); s.setAttribute('aria-hidden', 'true'); s.classList.add('ico'); s.innerHTML = inside(s.dataset.ico);
  });
  window.iconKnown = name => !!ICONS[name];
  // for the picker: every name with the words people might search for
  window.iconList = () => Object.entries(ICONS).filter(([, e]) => e.p).sort((a, b) => a[1].p - b[1].p).map(([name, e]) => ({ name, kw: (e.kw || name).toLowerCase() }));
  window.hydrateIcons();
})();
