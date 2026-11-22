// Area colours that differ between light and dark, folded out of `body.dark` rules in style.css: the rule now reads the
// token, and the token is one thing in light and another in dark. Written as expressions of the core tokens, so a theme
// that sets those sets these too. tools/themes-css.ts writes them into web/themes.css with the rest of DERIVED.
export const MODE_DERIVED: Record<string, [light: string, dark: string]> = {
  '--m-au-play-fill': ['var(--ink-inverse)', 'var(--au-bg-3)'],
  '--m-dbs-bub-bg': ['var(--snow)', 'var(--dbs-bg)'],
  '--m-dbs-bub-shadow': [
    '0 8px 24px rgba(var(--sh), calc(.2 * var(--sh-k)))',
    '0 8px 24px rgb(from var(--shade) r g b / .45)',
  ],
  '--m-dbs-knob-bg': ['var(--snow)', 'var(--coll-ink)'],
  '--m-dbs-track-bg': ['var(--dbs-bg-2)', 'rgb(from var(--hilite) r g b / .1)'],
  '--m-dt-a-bg': ['var(--ink)', 'var(--coll-ink)'],
  '--m-dv-dl-ink': ['var(--ink)', 'var(--dv-light-ink)'],
  '--m-home-img': [
    'radial-gradient(var(--dot) 1.2px, transparent 1.2px)',
    'radial-gradient(var(--pn-dark-home-dot) 1.2px, transparent 1.2px)',
  ],
  '--m-lic-item-bg': ['var(--blush)', 'var(--surface-2)'],
  '--m-ly-hover-bg': ['var(--au-bg-2)', 'rgb(from var(--hilite) r g b / .05)'],
  '--m-ly-n-bg': ['var(--snow)', 'var(--pn-dark-ink)'],
  '--m-ly-on-bg': ['var(--blush)', 'rgb(from var(--lf-shadow) r g b / .22)'],
  '--m-ob-primary-ink': ['var(--ink-inverse)', 'var(--au-bg-3)'],
  '--m-sb-pop-bg': ['var(--panel, var(--snow))', 'var(--sb-bg-8)'],
  '--m-sb-pop-shadow': [
    '0 16px 40px rgb(from var(--sb-shadow-2) r g b / .2), 0 0 0 1px rgb(from var(--shade) r g b / .05)',
    '0 16px 40px rgb(from var(--shade) r g b / .5), 0 0 0 1px rgb(from var(--hilite) r g b / .1)',
  ],
  '--m-sb-style-on-bg': ['var(--ink)', 'var(--sb-bg-3)'],
  '--m-sb-tipbub-bg': ['var(--ink)', 'var(--sb-bg-3)'],
  '--m-sb-tipbub-ink': ['color-mix(in oklab, var(--accent-wash) 8%, var(--surface))', 'var(--sb-ink-3)'],
  '--m-selbar-shadow': [
    'inset 0 1px 0 rgb(from var(--hilite) r g b / .95), inset 0 0 0 1px rgb(from var(--hilite) r g b / .6), 0 10px 30px rgb(from var(--sec-shadow) r g b / .16)',
    'inset 0 1px 0 rgb(from var(--hilite) r g b / .16), inset 0 0 0 1px rgb(from var(--hilite) r g b / .08), 0 10px 30px rgb(from var(--shade) r g b / .35)',
  ],
  '--m-set-panel-bg': ['var(--snow)', 'var(--surface)'],
  // a note's label: dark in dark mode, with the theme's white on it. Inside a note --ink is the note's own dark ink, so the label can't read --ink there
  '--m-tag-bg': ['var(--snow)', 'var(--dark-line)'],
  '--m-tag-ink': ['currentcolor', 'var(--hilite)'],
  '--m-ub-yes-bg': ['var(--ink)', 'var(--clean-ink)'],
  '--m-upbar-bg': ['var(--snow)', 'var(--clean-bg-2)'],
  '--m-upbar-ink': ['var(--ink)', 'var(--clean-ink)'],
  '--m-ws-mid-ink': ['var(--ink)', 'var(--ink)'],
};
