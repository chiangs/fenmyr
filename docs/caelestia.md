# Follow your Caelestia theme

If you use the [Caelestia](https://github.com/caelestia-dots/shell) Hyprland shell, Fenmyr can take on your desktop's colours and change with them.

<!-- 🎞 S6: a short GIF of Fenmyr following a Caelestia scheme or light/dark switch goes here. -->

This is on by default when Caelestia is installed. The switch is **Follow Caelestia**, in Settings → Appearance → Look, and it only appears with Caelestia. While it's on, the Theme buttons and the Colours below it are dimmed, because Caelestia decides them. The light and dark theme pickers stay usable: the theme you pick is what Caelestia's colours are put on. Switch it off, and your own colours and theme come back.

## What changes

| In Fenmyr | Comes from Caelestia's |
|---|---|
| Board background | `surface` |
| Grid dots | `outlineVariant` |
| Panels (sidebar, tools, menus) | `surfaceContainer` |
| Second surface (inputs, wells, hovered rows) | `surfaceContainerHigh` |
| Text, and quiet text | `onSurface`, `onSurfaceVariant` |
| Accent (buttons, selection, highlights) | `primary`, with `onPrimary` for text on it |
| Focus ring | `secondary` |
| Card colours: Snow, Cloudberry, Lingonberry, Moss, Fjord, Heather, Birch | `surfaceContainerHighest`, `yellow`, `pink` or `red`, `green`, `sky` or `blue`, `mauve` or `lavender`, `peach` or `rosewater` |
| Light or dark | the scheme's mode |

The theme you pick for that mode is what these go on, and it supplies anything Caelestia doesn't. Every colour is held to the contrast that theme promises: one that falls short is moved in lightness until it reads, and if that can't be done the theme's own is used, so Clear and Lantern keep their AAA contrast. If Caelestia's card colours would look alike to someone with colour blindness, all seven cards use the theme's instead, so a board's colours stay consistent. The cursor, switches and Myra keep their own colours.

## What Fenmyr follows

These Caelestia actions restyle Fenmyr within about a second, with no restart:

| Caelestia | Fenmyr |
|---|---|
| **Scheme** | New colours |
| **Variant** | New shades of the same scheme |
| **Light / Dark** | Switches mode too (the easiest way to see it working) |
| **Wallpaper / Random** | New colours only with the **dynamic** scheme, which takes them from the wallpaper. A named scheme like gruvbox keeps its colours. |

Changing between two dark schemes mostly shows in the accent, panels and dots, since most dark backgrounds are close to black. A board with its own background keeps it, and the rest still follows.

Fenmyr reads `~/.local/state/caelestia/scheme.json`, so there's nothing to set up.

## If nothing changes

Check that the switch is on (Settings → Appearance → Follow Caelestia), then switch Caelestia to Light: the board should turn light within a second. If it doesn't, press F12 in Fenmyr and run this in the Console:

```js
Fenmyr.caelestia().then(s => console.log(s && s.name, s && s.mode, '|', document.body.className))
```

You should see your scheme's name and `following-caelestia`. If the name is missing, check that `~/.local/state/caelestia/scheme.json` exists.
