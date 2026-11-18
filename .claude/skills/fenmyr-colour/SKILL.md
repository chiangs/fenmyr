---
name: fenmyr-colour
description: Change or add a colour, a token, a theme, or Follow Caelestia in Fenmyr. Use when touching web/style.css colours, src/web/settings/themes.ts, derived.ts or themes.css, the colour tools, or anything that must follow a theme. Covers where each colour lives, the tools and the order to use them, the proof, and the mistakes already made.
---

# Colour work in Fenmyr

CLAUDE.md has the rules and the commands. This is how the parts fit and how to change them without repeating a mistake.

## Where a colour lives

- **Core tokens** (`--ink`, `--surface`, `--pink-deep`, `--card-<key>` and the rest in `tools/colour-core.json`) are set
  per theme in `src/web/settings/themes.ts`. `node tools/themes-css.ts` writes `web/themes.css` from it, one block per
  theme, applied by the class on `<body>` (`theme-<name>`, plus `dark`). Never define a core token in `style.css`;
  `tests/themesCss.ts` fails if you do, and `check:fast` fails if `themes.css` is out of date.
- **Derived colours** are area colours written as `color-mix()` of core tokens, in `src/web/settings/derived.ts`, put on
  `<body>` by `themes.css`. A new area colour is an expression there, not a hex in `style.css`. A colour that fits no mix
  is a constant in that table (a hex, or `[light, darkHex]`).
- **`derive()`** (`derive.ts`) fills in what a theme doesn't choose: variants of the accent, status colours, card links,
  solved against the theme's own panel and board. **Follow Caelestia** (`caelestia.ts`) is another source of the same
  inputs: the scheme's colours, held to the theme's contrast, with the theme's own where they fall short.
- **Runtime colours** (a custom accent, Caelestia) are set inline on `<body>` by `applyColors`, over the theme's.

## Tools, in the order you'd use them

1. `colour-fit.ts` rewrites where a colour is *used* onto a core token or a mix of two. `colour-derive.ts` rewrites what a
   token *is*. Both take `--prefix` to work area by area and `--apply --pairs pairs.json`.
2. `colour-compare.ts pairs.json --tolerance 0.02` proves it in the running app, in light and dark. A pair can name the old
   dark value and the one mode it must hold in.
3. `npm run visual`, then measure each changed state (see the pr-proof skill). `tests/themeAudit.ts` measures text contrast
   in every theme; `tests/greyMixes.ts` finds oklch mixes that would paint pink.

## Mistakes already made, and what now stops them

- **Card fills or the card ink used as a building block.** `--card-*` and `--on-pastel` look like surface colours in
  Default and are not in other themes. `colour-derive.ts --skip-core '^--(card-.*|on-pastel)$'`; `themeAudit` fails on the
  result.
- **A token defined again inside a part of the page** (`--paper-ink` in the doc view) has no one colour. The tools leave
  it alone.
- **Removing a `body.dark` rule** lets a more specific light rule win in dark. The tool keeps a dark declaration when another
  rule styles the same element and property.
- **A token whose name the renderer builds** (`--card-${key}`) looks unused. The tool keeps whole families.
- **A mix with no hue on either side** (white, black, warm greys, `transparent`) in `oklch` paints pink in Chrome. Write it
  in `oklab`. `tests/greyMixes.ts`.
- **Light-only tokens are still on screen in dark** where no dark rule beats them. Making them follow dark changes Default
  dark, so they keep their old dark value in the table until someone has looked.
- **Measuring a colour mid-fade.** Turn transitions off.

## Adding a theme

One entry in `THEMES` (`themes.ts`): the colours §2 of #251 gives, passed through `derive()`. Run `node tools/themes-css.ts`.
`tests/themes.ts` checks its contrast and colour-blind separation, `tests/themesCss.ts` that the page computes it, and
`tests/themeAudit.ts` that no text is left behind. Add its four states to `tools/visual-diff.ts`.
