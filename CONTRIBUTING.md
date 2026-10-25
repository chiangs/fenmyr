# Changing Myra

Myra is two layers that talk through one small channel. Most changes only touch one of them.

```
web/            the canvas: everything you see and do (plain HTML/CSS/JS, no build step)
  index.html      the page: panels, settings, dialogs
  app.js          the canvas itself: cards, tools, Myra's chat, settings, updates bar, tour
  style.css       all the styling (light and dark)
  bridge.js       window.MB: the canvas's only way to reach the host (or a pretend host in a browser)
  vendor/         prebuilt TipTap editor and .docx writer (source in tools/editor/)
  licenses.js     generated third-party notices for About → Licenses (npm run notices)
linux/          the host: an Electron main process
  main.js         window, keys, permissions, mbmedia://, and the table of bridge operations (OPS)
  preload.js      provides window.webkit.messageHandlers.mb to the page
  storage.js      boards, folders and videos on disk
  claude.js       finding and running Claude Code, usage tally, connections
  prompts.js      everything Myra is told (edit her personality and abilities here)
  output.js       PNG / PDF export, .docx save, paged doc PDFs
  speech.js       voice memo transcription (whisper.cpp)
  update.js       updates for git installs and the AppImage
  paths.js        where things are kept (XDG folders)
  migrate.js      moves Mochiboard for Linux's boards and settings into Myra, once
  theme.js        reads and watches Caelestia's colour scheme (Follow Caelestia)
assets/art/      make_art.py draws Myra, her stickers, the stamps and the icon; make_mark.py makes the ✦ cloudberry font
tests/smoke.js  opens the real app and checks every bridge operation
tests/zoom.js   Ctrl + wheel steps, touchpad pinch, reset to 100%
tests/migrate.js  moving over from Mochiboard for Linux
tests/theme.js  Follow Caelestia: offered only with Caelestia, live restyle, back to your colors
install.sh  uninstall.sh  make-release.sh  packaging/
```

## How the canvas talks to the host

`web/bridge.js` sends `{id, op, args}` through `window.webkit.messageHandlers.mb.postMessage`. In the app, `linux/preload.js` passes it to `linux/main.js`, which looks the op up in `OPS`. The answer goes back over IPC (`mb-reply`), and preload.js hands it to the page's `__mbReply(id, ok, value)`. Nothing is turned into script, so big boards and pictures pass through quickly. News the page didn't ask for (Caelestia's colours changed) arrives the same way as `__mbEvent(name, data)`. In a plain browser, bridge.js uses localStorage and a pretend Mochi instead.

**To add a new ability that needs the computer** (a file, a program, the network):
1. Add the op to `OPS` in `linux/main.js` (put real work in a module next to it).
2. Add a matching method to the `native` side of `window.MB` in `web/bridge.js`, and a browser fallback.
3. Call `MB.yourThing()` from `web/app.js`.
4. Add a check for it in `tests/smoke.js`.

**To change only the canvas** (a card type, a tool, a setting, the look): edit `web/`, then reload the window (F12 → Ctrl+R in DevTools), or work on it in a browser with `python3 -m http.server` in `web/`.

**To change what Myra does:** her instructions are in `linux/prompts.js`. The JSON she answers with is applied by `applyMochi()` in `web/app.js`.

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

Myra's code grew from [Mochiboard](https://github.com/jessawolfe-ux/mochiboard) by Jessa Wolfe (MIT), by way of [Mochiboard for Linux](https://github.com/chiangs/linux-mochiboard). Mochiboard's name, Mochi and its art and music are hers and aren't part of Myra. Myra doesn't track Mochiboard; ideas from it are ported by hand.


## Third-party notices

`THIRD-PARTY-NOTICES.md` and `web/licenses.js` are generated. After rebuilding the editor bundles in `tools/editor/` (or adding anything someone else made), run `npm run notices` and commit both files. The script asks esbuild what actually goes into `web/vendor/`, so the list matches what ships.
