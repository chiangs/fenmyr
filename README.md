<p align="center"><img src="assets/icon.png" width="140" alt="Fenmyr"></p>

<h1 align="center">Fenmyr</h1>
<p align="center"><b>Where ideas thrive.</b><br>
A canvas for ideas, with Myra the cloudberry to help.</p>
<p align="center"><img src="assets/readme-cover.jpg" width="760" alt="A Fenmyr board: notes in cloudberry, lingonberry, fjord, moss and heather, a checklist, two color swatches, and Myra in the corner"></p>

---

Fenmyr is a free, open-source canvas for Linux. Put notes, pictures, links, checklists and colours on an endless board, arrange them your way, and ask Myra to sort, plan, explore and build. Myra is a pixel cloudberry who thinks with Claude Code on your computer. Fenmyr is made for Arch and CachyOS on Wayland, and works on Hyprland, KDE Plasma, GNOME, Sway and niri.

## What's inside

**The canvas**

- An endless board. Pan with two fingers and pinch to zoom. Cards tilt slightly, or sit straight if you prefer.
- Card types for notes, titles, checklists, docs, collections, kanbans, links, images with crop, voice memos, videos, colours, shapes, stamps, drawings, the Pen, and curved connectors.
- **Ctrl+K** drops an idea into Unsorted without losing your place, and **F** focuses on what you're working on.
- Wireframes made of screens, boxes, text and icons, with ready-made elements and full layouts. The panel's search understands words like "dialog" or "FAQ".
- Projects, folders and boards, with a home page for all of them.
- Light and dark mode, or your [Caelestia](#follow-your-caelestia-theme) colours.
- Undo, and export of any card or board as an image or PDF. Docs download as PDF or Word.
- Card colours named Snow, Cloudberry, Lingonberry, Moss, Fjord, Heather and Birch.

**Myra**

- Chat with her about your board. She can add, edit, sort and connect cards, make collections and folders, and suggest what to do next.
- Ask her to explore fonts, and she puts type specimens on the board from your computer or Google Fonts.
- Describe a flow, and she builds wireframe screens. Ask for a landing page, and she builds it in your colours and fonts.
- Select words in a doc, and she rewrites them.

**Optional helpers**, through the connections in your Claude account:

- **Mobbin** finds real app screens for inspiration.
- **Higgsfield** fills image spots with generated pictures. It costs credits, so Myra always shows the price and your balance and waits for your yes. You can't turn that check off.
- Without Higgsfield, Myra can draw simple illustrations for free or leave labelled placeholders.

## Install

### From the code (recommended on Arch / CachyOS)

```bash
git clone https://github.com/chiangs/fenmyr.git
cd fenmyr
./install.sh
```

The installer does the following:

1. Finds Electron. It uses Arch's `electron` package and offers to install it. On other distros, or if you say no, it downloads a private copy.
2. Builds Fenmyr, which needs Node.js and npm. It offers to install them with pacman.
3. Puts Fenmyr in `~/.local/lib/fenmyr`, the `fenmyr` command in `~/.local/bin`, and an entry in your app launcher.
4. Opens Fenmyr. The first time, Myra walks you through setup and a short tour.

Fenmyr then checks for new versions on its own. When one is ready, a dot shows on the ⚙, and Settings lists what's new with an **Update now** button. That button pulls from GitHub, rebuilds, reinstalls and reopens, and it doesn't touch your boards. To update from a terminal, run `./install.sh --update`.

The installer builds Fenmyr, so it also needs Node.js and npm (it offers to `sudo pacman -S nodejs npm` if they're missing).

Installer options: `--update` (pull first), `--yes` (no questions), `--no-open`.

### AppImage

**[⬇ Download the latest AppImage](https://github.com/chiangs/fenmyr/releases/latest)** (`Fenmyr-x86_64.AppImage`)

```bash
chmod +x Fenmyr-x86_64.AppImage
./Fenmyr-x86_64.AppImage
```

AppImages need FUSE 2 (`sudo pacman -S fuse2` on Arch). The AppImage updates itself from GitHub Releases. Say yes once, and new versions install when you quit. To add it to your app launcher, use [Gear Lever](https://flathub.org/apps/it.mijorus.gearlever) or AppImageLauncher, or keep it in `~/Applications`.

### Uninstall

```bash
./uninstall.sh            # removes the app, then asks before touching your boards
./uninstall.sh --purge    # also deletes your boards and settings
```

It removes everything `install.sh` added, and any `~/Applications/Fenmyr*.AppImage`. Electron from pacman stays, since other apps may use it. To remove it, run `sudo pacman -Rs electron`.

## Connect Claude Code

Myra thinks with [Claude Code](https://docs.claude.com/en/docs/claude-code) on your computer. Without it, the canvas still works, but Myra can't do the AI parts.

1. Install it: `curl -fsSL https://claude.ai/install.sh | bash` (or see the [setup guide](https://docs.claude.com/en/docs/claude-code/setup)).
2. Run `claude` once in a terminal and sign in with your Claude account.
3. In Fenmyr, open ⚙ → **Helpers**. Claude Code shows **ready** as soon as Fenmyr finds it, with no restart.

Fenmyr looks for `claude` in `~/.local/bin`, `~/.claude/local`, `/usr/bin`, `/usr/local/bin`, npm / nvm / volta / bun folders, and finally asks your login shell (bash, zsh or fish).

**Hooks.** Myra's requests always run with your Claude Code hooks off, so hooks meant for your own sessions don't fire while she thinks. Skills, plugins, connectors and your login work as usual.

**The web.** This is off by default. Turn on **Settings → Helpers → Let Myra search the web**, and she can look things up and read public pages, including public GitHub repositories. Her searches can include words from your board.

**Mobbin and Higgsfield** are connectors in your Claude account. Add them at [claude.ai/settings/connectors](https://claude.ai/settings/connectors).

## Voice memos written out (optional)

Fenmyr writes out voice memos on your computer with [whisper.cpp](https://github.com/ggml-org/whisper.cpp):

```bash
yay -S whisper.cpp      # or build it yourself; Fenmyr looks for whisper-cli
```

The first memo downloads the speech model, about 140 MB, into `~/.local/share/fenmyr/whisper`. To use a different size, set `FENMYR_WHISPER_SIZE=tiny|base|small|medium`, or point `FENMYR_WHISPER_MODEL` at a model file you already have. Without whisper.cpp, memos still record and play.

## Your stuff

- Each board is one JSON file in `~/.local/share/fenmyr/boards`, with your folders in `folders.json` and your videos in `media/`. You can back them up or copy them like any other files. Fenmyr itself needs no account and uses no cloud.
- App settings (your name, theme, the tour) live in `~/.config/Fenmyr`.
- **Keep a history of your boards.** You can turn the Fenmyr folder into a git repository to keep every version. This works entirely on your computer. Run this once:
  ```
  cd ~/.local/share/fenmyr
  printf 'whisper/\nwindow.json\nusage.json\n*.tmp\n' > .gitignore
  git init && git add -A && git commit -m "My boards"
  ```
  Then commit now and then. For a backup off your computer, add a private remote and push, because boards can hold your notes and pictures.

  Pictures are saved inside each board's file, so boards with many large pictures make a big repository. You may also want to ignore `media/`, which holds videos. To keep boards in step between computers, a synced folder such as Syncthing or Nextcloud suits better than git.
- Myra only thinks when you ask her something. Then the board and your question go to Claude Code on your computer, the same as asking Claude yourself.
- Switch Myra's thinking off in Settings, and the canvas works with no AI and no internet. Chromium's spell check fetches its dictionary from Google once, then works offline.
- Fenmyr can use your camera and microphone without asking each time, because Linux has no per-app prompt. A voice memo or video card turns them on when you add or use it.
- Chats are kept the way you choose: on each board, until you quit, or not at all.

## Shortcuts

| | |
|---|---|
| **Ctrl+K** | Quick capture into Unsorted |
| **Ctrl+F** | Find on the board: opens Myra's chat with `/find` ready (works without AI); the find bar then lets you edit the search and step through matches (Enter, Shift+Enter, Esc) |
| **double-click** | New note |
| **N · C · T · D · G** | Note, checklist, title, doc, collection |
| **V** | Select |
| **L · I · A · Shift+V** | Link, image, voice memo, video |
| **S · E · P · Shift+P** | Shapes, stamps, draw, the Pen |
| **R · X** | Wireframe box, wireframe text |
| **M** | Ask Myra |
| **F** | Focus on the selection |
| **0** | Fit the whole board |
| **Ctrl + scroll** | Zoom in even steps (…90 · 100 · 110 · 125…%). A touchpad pinch zooms smoothly |
| **Ctrl + / Ctrl −** | Zoom in / out, the same steps |
| **Shift+1** | Zoom to fit |
| **Ctrl+0** | Back to 100% |
| **click the zoom %** | Zoom menu: in, out, 100%, fit, 50 / 100 / 200% |
| **Ctrl+] / Ctrl+[** | Bring forward / send backward (add Shift: all the way) |
| **Alt + drag** | Drag a copy |
| **Ctrl+Z / Ctrl+Shift+Z** | Undo / redo |
| **Ctrl+G / Ctrl+Shift+G** | Group / ungroup, so things move together |
| **Ctrl+C / Ctrl+X / Ctrl+V** | Copy, cut and paste cards, even onto another board |
| **Ctrl+\\** | Just the board (hide the panels) |
| **space + drag** | Pan |
| **Ctrl+,** | Settings |
| **Ctrl+Q · F11** | Quit · full screen |

## The window

The board fills the window, with no title bar. Move and resize it the way your compositor does. For close, minimise and maximise buttons, switch on **Settings → General → Window buttons**. Three small dots appear at the top left, with a strip beside them to drag the window by.

## Follow your Caelestia theme

If you use the [Caelestia](https://github.com/caelestia-dots/shell) Hyprland shell, Fenmyr can take on your desktop's colours and change with them.

This is on by default when Caelestia is installed. The switch is **Follow Caelestia**, under *Look* in Settings → General, and it only appears with Caelestia. While it's on, the Theme buttons and Settings → Board → Colours are dimmed, because Caelestia decides them. Switch it off, and your own colours and theme come back.

This is what changes:

| In Fenmyr | Comes from Caelestia's |
|---|---|
| Board background | `surface` |
| Grid dots | `outlineVariant` |
| Panels (sidebar, tray, toolbar, menus) | `surfaceContainer` |
| Accent (buttons, selection, highlights) | `primary` |
| Light or dark | the scheme's mode |

Card colours such as Cloudberry, Moss and Heather are part of your boards and stay as they are. Text greys, the cursor, switches and Myra keep their own colours.

These Caelestia actions restyle it within about a second, with no restart:

| Caelestia | Fenmyr |
|---|---|
| **Scheme** | New colours |
| **Variant** | New shades of the same scheme |
| **Light / Dark** | Switches mode too (the easiest way to see it working) |
| **Wallpaper / Random** | New colours only with the **dynamic** scheme, which takes them from the wallpaper. A named scheme like gruvbox keeps its colours. |

Changing between two dark schemes mostly shows in the accent, panels and dots, since most dark backgrounds are close to black. A board with its own background keeps it, and the rest still follows.

Fenmyr reads `~/.local/state/caelestia/scheme.json`, so there's nothing to set up.

## Troubleshooting

- **Blank or flickering window on NVIDIA.** Put extra Electron flags in `~/.config/fenmyr-flags.conf`, one per line, e.g. `--disable-gpu-compositing` or `--ozone-platform=x11`.
- **Force Wayland or X11.** The launcher passes `--ozone-platform-hint=auto` (Wayland when available). Add `--ozone-platform=wayland` or `--ozone-platform=x11` to the flags file to choose.
- **Camera or microphone not found.** Fenmyr uses the same camera and microphone as your browser (PipeWire). Check `pavucontrol` or your sound settings, and that nothing else holds the camera.
- **Myra says she needs Claude Code** even though it's installed: run `which claude` in a terminal and make sure that folder is one of the places listed above, or symlink it into `~/.local/bin`.
- **Follow Caelestia doesn't change anything.** Check that the switch is on (Settings → General → Follow Caelestia), then switch Caelestia to Light: the board should turn light within a second. If it doesn't, press F12 in Fenmyr and run `Fenmyr.caelestia().then(s => console.log(s && s.name, s && s.mode, '|', document.body.className))` in the Console. You should see your scheme's name and `following-caelestia`; if the name is missing, check that `~/.local/state/caelestia/scheme.json` exists.
- **Developer tools.** Press F12 or Ctrl+Shift+I.

## How it's built

Fenmyr has two layers, written in TypeScript, that talk through one channel:

- `src/web/` and `web/` hold the canvas.
- `src/host/` is the Electron host. It saves boards, fetches link previews, exports images and PDFs, writes out voice memos, and runs `claude -p` so Myra can think.

See [CONTRIBUTING.md](CONTRIBUTING.md) to change or extend it. [DESIGN.md](DESIGN.md) holds the visual and copy rules.

To run the app from the code without installing, run `npm ci && node node_modules/electron/install.js && npm start`.

Icons are [Phosphor Icons](https://phosphoricons.com) (MIT), plus Fenmyr's own cloudberry icons. Fonts are Figtree and Shantell Sans (OFL).

## Where Fenmyr came from

Fenmyr's code grew from [Mochiboard](https://github.com/jessawolfe-ux/mochiboard) by [Jessa Wolfe](https://jessa.art), an open-source planning canvas for the Mac (MIT). Thank you, Jessa. Mochiboard's name, its character Mochi, its stamps, art and music are hers, and Fenmyr doesn't use them.

## License

The code is open source under the [MIT License](LICENSE). The names **Fenmyr** and **Myra**, Myra the cloudberry, her art, their own icons, the stamps, the logo and the app icon are all rights reserved by Stephen Chiang; see [TRADEMARKS.md](TRADEMARKS.md). Fenmyr also includes software made by others, including Mochiboard, Electron, Phosphor Icons, Figtree, Shantell Sans and the libraries inside the docs editor. Each is listed with its license in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md), and in the app under **Settings → About → View licenses**.

---

<p align="center">Made with care by Stephen Chiang. Where ideas thrive.</p>
