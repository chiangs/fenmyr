# Fenmyr design

This file holds the visual and product rules. For architecture and commands, see [CLAUDE.md](CLAUDE.md). The values below come from `web/style.css` and `src/web/core/base.ts`. If they disagree with this file, the code is correct, so fix this file.

## The feel

Fenmyr looks like a Nordic bog in summer: snow-white paper, a soft birch dot grid, warm amber shadows and cards that tilt slightly. It should feel calm and made by hand, never like enterprise software.

## Colour

Card colours have names people see and keys the code and board files use. Always show the name in the UI, and never show the key.

| Name | Key | Hex |
|---|---|---|
| Snow | `white` | `#ffffff` |
| Cloudberry | `butter` | `#ffe3bd` |
| Lingonberry | `pink` | `#ffdcd8` |
| Moss | `mint` | `#e0edd3` |
| Fjord | `sky` | `#d9e7f3` |
| Heather | `lilac` | `#ebe1f2` |
| Birch | `peach` | `#f1ebe2` |

The interface uses these variables, so use them rather than new hex values:

| Variable | Value | Use |
|---|---|---|
| `--ink`, `--ink-soft`, `--ink-faint` | `#3b342d`, `#8a7f73`, `#bcb1a3` | Text, from strongest to quietest |
| `--pink-deep` | `#e88a24` | The accent. The name is older than the colour |
| `--dot` | `#e4dccf` | The grid dots |
| `--select` | `#0d99ff` | Selection handles, the one cold colour |
| `--sh` | `150, 95, 35` | The shadow colour, warm amber in light mode |

People can change the board, dots, panels and accent per light and dark mode, and Follow Caelestia can replace them. New UI must therefore read its colours from these variables and must work in dark mode (`body.dark`).

## Type

- **Figtree** is the interface and body font.
- **Shantell Sans** is the handwritten touch, for labels and small friendly moments only. Don't use it for anything people need to read at length.
- **Myra Mark** is a one-glyph font that draws ✦ as a small cloudberry. It comes first in both font stacks.

People can set a default font for board text and docs. Menus and panels keep Figtree.

## Shape and space

- Corners are squircles (`corner-shape: squircle`). Cards use 24 px, and buttons, tags and tooltips use `--pill-r` (12 px).
- Cards tilt up to 2° either way. Wireframe pieces, sections, screens and collections stay straight, as `src/shared/cardTypes.ts` records.
- The floating panels on each side are `--side` wide (232 px).
- Text stays sharp at every zoom step. Any new effect on cards must keep it sharp.

## Icons

Icons are Phosphor, plus Fenmyr's own in `tools/icons/custom.ts`. Ask for them by Fenmyr name with `Icon('note')`, never by pack name.

- **Regular** (outline) is the default everywhere.
- **Duotone** appears only in the bottom bar and Myra's chat header, and only if the person chooses it.

## Myra

Myra is a small pixel cloudberry on a 16 by 15 grid, drawn in `src/web/goo.ts`. She breathes, blinks and hops. People can make her calm (still) or calmest (still, with muted colours), and every new animation must respect both settings, as well as reduced motion. Her name, character and art are reserved, as [TRADEMARKS.md](TRADEMARKS.md) explains.

## Words

There are two voices, and each surface uses one of them.

**Myra's voice** is for what she says: chat, greetings, the tour and her bubbles. She speaks in the first person, warm with a dry, tart wit. She is brief, never gushing, and drops the wit when someone is having a hard time.

- Good: "Your memo is written out ✦ Want me to turn it into notes?"
- Too much: "Yay! I just finished writing out your amazing memo for you!"

**The neutral voice** is for everything else: menus, tooltips, settings, buttons and error messages. It is short and plain, and it says what the control does. It doesn't say "I", and it doesn't try to be charming.

- Good: "How big the tools at the bottom are."
- Too much: "Pick how big your cute little tools should be ✦"

Rules for both:

- Use British English: colour, organise, grey.
- Use ✦ at most once in a message, at the end, and only in Myra's voice.
- Write one thought per sentence. Don't use long dashes, and avoid brackets inside sentences.
- Cut "just", "a little", "simply" and "easy" unless the sentence needs them.
- An error says what happened and what to do next.
- Use the tagline "Where ideas thrive." once per surface at most.
- Write keys the way they appear on the person's computer. Source text can say ⌘, and the app shows Ctrl on Linux.
