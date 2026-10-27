# Changing Myra

Myra is two layers that talk through one small channel. Most changes only touch one of them.

```
web/            the canvas: everything you see and do (plain HTML/CSS/JS, no build step)
  index.html      the page: panels, settings, dialogs
  app.js          the canvas itself: cards, tools, Myra's chat, settings, updates bar, tour
  style.css       all the styling (light and dark)
  bridge.js       window.Myra: the canvas's only way to reach the host (or a pretend host in a browser)
  icons.js        the Icon() facade; icons/pack.js is built by `npm run icons`
  vendor/         prebuilt TipTap editor and .docx writer (source in tools/editor/)
  licenses.js     generated third-party notices for About → Licenses (npm run notices)
linux/          the host: an Electron main process
  main.js         window, keys, permissions, myramedia://, and the table of bridge operations (OPS)
  preload.js      provides window.myraHost (and myraWindow, for the window buttons) to the page
  storage.js      boards, folders and videos on disk
  claude.js       finding and running Claude Code, usage tally, connections
  prompts.js      everything Myra is told: her voice at the top (PERSONA, BEHAVIOUR, SCOPE, EXAMPLES, TONES), her abilities below
  output.js       PNG / PDF export, .docx save, paged doc PDFs
  speech.js       voice memo transcription (whisper.cpp)
  update.js       updates for git installs and the AppImage
  paths.js        where things are kept (XDG folders)
  theme.js        reads and watches Caelestia's colour scheme (Follow Caelestia)
assets/art/      make_art.py draws Myra, her stickers, the stamps and the icon; make_mark.py makes the ✦ cloudberry font
tests/smoke.js  opens the real app and checks every bridge operation
tests/zoom.js   Ctrl + wheel steps, touchpad pinch, reset to 100%
tests/theme.js  Follow Caelestia: offered only with Caelestia, live restyle, back to your colors
tests/docs.js   the docs editor: every kind of formatting, shortcuts, the floating bar, Word download
tests/vault.js  Obsidian vaults: parsing, folder and #private rules, search (no app needed)
tests/voice.js  Myra's voice check against the real Myra (manual: npm run voice)
install.sh  uninstall.sh  make-release.sh  packaging/
```

## How the canvas talks to the host

`web/bridge.js` sends `{id, op, args}` through `window.myraHost.post`. In the app, `linux/preload.js` passes it to `linux/main.js`, which looks the op up in `OPS`. The answer goes back over IPC (`myra-reply`), and preload.js hands it to the page's `__myraReply(id, ok, value)`. Nothing is turned into script, so big boards and pictures pass through quickly. News the page didn't ask for (Caelestia's colours changed) arrives the same way as `__myraEvent(name, data)`. In a plain browser, bridge.js uses localStorage and a pretend Myra instead.

**To add a new ability that needs the computer** (a file, a program, the network):
1. Add the op to `OPS` in `linux/main.js` (put real work in a module next to it).
2. Add a matching method to the `native` side of `window.Myra` in `web/bridge.js`, and a browser fallback.
3. Call `Myra.yourThing()` from `web/app.js`.
4. Add a check for it in `tests/smoke.js`.

**To change only the canvas** (a card type, a tool, a setting, the look): edit `web/`, then reload the window (F12 → Ctrl+R in DevTools), or work on it in a browser with `python3 -m http.server` in `web/`.

**To change what Myra does:** her instructions are in `linux/prompts.js`. The JSON she answers with is applied by `applyMyra()` in `web/app.js`.
- **Her character** is the voice block at the top: `PERSONA` (who she is, shared with the docs editor), `BEHAVIOUR`, `LANGUAGE`, `SCOPE` and `EXAMPLES` (sample replies per tone setting; she only sees the ones for the person's setting).
- **The tone settings' words** (Settings → Myra → How chatty she is, emojis, your name) are in `TONES`. The app sends only the choice; the host puts the words in the prompt as YOUR TONE.
- **Her abilities** (cards, templates, wireframes, tags, vaults) are in the prompts below the voice block.
- After changing any of it, run `npm run voice` and read her replies. It asks the real Myra a set of tricky questions (frustrated person, out of scope, quiet versus chatty), needs Claude Code signed in and costs a few requests, so it's never part of `npm test` or CI.

## Running and testing

```bash
npm install            # Electron, electron-builder, Playwright (for tests)
npm start              # run from the code
xvfb-run -a node tests/smoke.js     # or just `node tests/smoke.js` in a desktop session
./install.sh           # install your changed copy (Settings → Update now pulls from the git remote)
./make-release.sh --dry             # build the AppImage into build/release/
```

The smoke test uses a throwaway data folder and stand-in `claude` and `whisper-cli` programs, so it never touches your boards or spends Claude usage.

## Releasing

Versions: nothing has been released yet, so Myra stays at 1.0.0 until the first release. After that, bump the patch number (1.0.1) for fixes and small changes, the minor number (1.1.0) for new features, and add a matching entry to `NEWS` in `web/app.js` for anything people should hear about.

1. Bump `version` in `package.json` and add a section at the top of `WHATSNEW.md` (lines starting with `- ` become the notes people see in the app).
2. Commit and push.
3. `./make-release.sh` builds the AppImage and publishes a GitHub Release (needs `gh auth login`). AppImage users get it through their update bar; git installs see the new commits.

## Myra's art

Everything Myra looks like is drawn in code, so it's easy to change and stays consistent:

- `web/goo.js`: Myra herself, live on the page (her pixels, colors, breathing, blinking, hopping).
- `assets/art/make_art.py`: her stickers and animations, the pixel stamps and the app icon. Run `python3 assets/art/make_art.py` (needs Pillow). To add a stamp, write a `st_…` function, add it to `STAMP_SET`, and map its emoji in `PX` in `web/app.js`.
- `assets/art/make_mark.py`: the little cloudberry that ✦ turns into (a one-glyph colour font). Needs fontTools and brotli.

Myra's name, character and art are reserved (see [TRADEMARKS.md](TRADEMARKS.md)); the code is MIT.

## Where it came from

Myra's code grew from [Mochiboard](https://github.com/jessawolfe-ux/mochiboard) by Jessa Wolfe (MIT). Mochiboard's name, Mochi and its art and music are hers and aren't part of Myra. Myra doesn't track Mochiboard; ideas from it are ported by hand.


## Third-party notices

`THIRD-PARTY-NOTICES.md` and `web/licenses.js` are generated. After rebuilding the editor bundles in `tools/editor/` (or adding anything someone else made), run `npm run notices` and commit both files. The script asks esbuild what actually goes into `web/vendor/`, so the list matches what ships.

## Icons

The app never names an icon pack directly. It asks for a Myra icon name through `Icon('note')` (`web/icons.js`), or marks a placeholder in the HTML with `<svg data-ico="note"></svg>`. `tools/icons/set.js` says which icon of the current pack (Phosphor) draws each name and which names the wireframe picker offers; `tools/icons/custom.js` holds Myra's own icons (the cloudberry mark, the Myra tool, chat). Run `npm run icons` after changing either: it builds `web/icons/pack.js` (both the Regular and the Duotone drawing of every icon) and `linux/icon-names.json` (the names Myra may use in wireframes).

To use another icon pack, add it as a dependency and change `pack` and the second column of `set.js`; nothing else in the app changes. A name with no icon shows a dashed placeholder, so old boards never break. Only the bottom bar (toolbar, selection bar, pen bar, shape picker) and Myra's chat header show Duotone; panels, wireframe pieces and icon cards always draw as plain outlines.
