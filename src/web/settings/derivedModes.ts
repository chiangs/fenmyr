// Area colours that differ between light and dark, folded out of `body.dark` rules in style.css: the rule now reads the
// token, and the token is one thing in light and another in dark. Written as expressions of the core tokens, so a theme
// that sets those sets these too. tools/themes-css.ts writes them into web/themes.css with the rest of DERIVED.
export const MODE_DERIVED: Record<string, [light: string, dark: string]> = {
  '--m-au-play-fill': ['var(--ink-inverse)', 'var(--au-bg-3)'],
  '--m-dbs-knob-bg': ['var(--snow)', 'var(--coll-ink)'],
  '--m-dt-a-bg': ['var(--ink)', 'var(--coll-ink)'],
  '--m-dv-dl-ink': ['var(--ink)', 'var(--dv-light-ink)'],
  '--m-home-img': [
    'radial-gradient(var(--dot) 1.2px, transparent 1.2px)',
    'radial-gradient(var(--pn-dark-home-dot) 1.2px, transparent 1.2px)',
  ],
  '--m-lic-item-bg': ['var(--blush)', 'var(--surface-2)'],
  '--m-ly-n-bg': ['var(--snow)', 'var(--pn-dark-ink)'],
  '--m-ob-primary-ink': ['var(--ink-inverse)', 'var(--au-bg-3)'],
  '--m-sb-tipbub-bg': ['var(--ink)', 'var(--sb-bg-3)'],
  '--m-sb-tipbub-ink': ['color-mix(in oklab, var(--accent-wash) 8%, var(--surface))', 'var(--sb-ink-3)'],
  '--m-ub-yes-bg': ['var(--ink)', 'var(--clean-ink)'],
  '--m-upbar-bg': ['var(--snow)', 'var(--clean-bg-2)'],
  '--m-upbar-ink': ['var(--ink)', 'var(--clean-ink)'],
  '--m-ws-mid-ink': ['var(--ink)', 'var(--ink)'],
};
