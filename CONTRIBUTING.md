# Changing Fenmyr

Fenmyr has two layers that talk through one small channel, and most changes touch only one of them. [CLAUDE.md](CLAUDE.md) lists the commands, the layout and the rules, each with the check that enforces it. [DESIGN.md](DESIGN.md) holds the visual and copy rules. This file holds the how-to guides.

## How the canvas talks to the host

`src/web/bridge.ts` sends `{id, op, args}` through `window.fenmyrHost.post`. In the app, `src/host/preload.ts` passes it to `src/host/main.ts`, which looks the op up in `OPS`. The answer goes back over IPC (`fenmyr-reply`), and preload.js hands it to the page's `__fenmyrReply(id, ok, value)`. No data is turned into script, so big boards and pictures pass through quickly. News the page didn't ask for (Caelestia's colours changed) arrives the same way as `__fenmyrEvent(name, data)`. In a plain browser, bridge.js uses localStorage and a pretend Myra instead.

**To add an ability that needs the computer**, such as a file, a program or the network:

1. Add the op's arguments and result to `src/shared/ops.ts`.
2. Add the handler to `OPS` in `src/host/main.ts`, with the real work in a module next to it.
3. Add a matching method to the `native` side of `window.Fenmyr` in `src/web/bridge.ts`, and a browser fallback.
4. Call `Fenmyr.yourThing()` from `src/web/`.
5. Add a check for it in `tests/smoke.ts`.

**To change only the canvas**, such as a card type, a tool, a setting or the look, edit `src/web/` or `web/`, run `npm run build`, then reload the window (F12 → Ctrl+R in DevTools), or work on it in a browser with `python3 -m http.server` in `web/`, where Myra is pretend.

**To change what Myra does:** her instructions are in `src/host/prompts.ts`. The JSON she answers with is applied by `applyMyra()` in `src/web/myra/apply.ts`.
- **Her character** is the voice block at the top: `PERSONA` (who she is, shared with the docs editor), `BEHAVIOUR`, `LANGUAGE`, `SCOPE` and `EXAMPLES` (sample replies per tone setting; she only sees the ones for the person's setting).
- **The tone settings' words** (Settings → Myra → How chatty she is, emojis, your name) are in `TONES`. The app sends only the choice; the host puts the words in the prompt as YOUR TONE.
- **Her abilities** (cards, templates, wireframes, tags, vaults) are in the prompts below the voice block.
- After changing any of it, run `npm run voice` and read her replies. It asks the real Myra a set of tricky questions (frustrated person, out of scope, quiet versus chatty), needs Claude Code signed in and costs a few requests, so it's never part of `npm test` or CI.

## Running and testing

```bash
npm ci && node node_modules/electron/install.js   # dependencies, then Electron's binary
npm start              # run from the code
npm test               # builds, then runs every test headless
./install.sh           # install your changed copy (Settings → Update now pulls from the git remote)
./make-release.sh --dry             # build the AppImage into build/release/
```

The smoke test uses a throwaway data folder and stand-in `claude` and `whisper-cli` programs, so it never touches your boards or spends Claude usage.

## Releasing

Nothing has been released yet, so Fenmyr stays at 1.0.0 until the first release. After that, bump the patch number for fixes and small changes, and the minor number for new features. Add an entry to `NEWS` in `src/web/app/news.ts` for anything people should hear about.

1. Bump `version` in `package.json` and add a section at the top of `WHATSNEW.md` (lines starting with `- ` become the notes people see in the app).
2. Commit and push.
3. `./make-release.sh` builds the AppImage and publishes a GitHub Release (needs `gh auth login`). AppImage users get it through their update bar; git installs see the new commits.

## Myra's art

Everything Myra looks like is drawn in code:

- `src/web/goo.ts`: Myra herself, live on the page (her pixels, colors, breathing, blinking, hopping).
- `assets/art/make_art.py`: her stickers and animations, the pixel stamps and the app icon. Run `python3 assets/art/make_art.py` (needs Pillow). To add a stamp, write a `st_…` function, add it to `STAMP_SET`, and map its emoji in `PX` in `src/web/tools/stamps.ts`.
- `assets/art/make_mark.py`: the little cloudberry that ✦ turns into (a one-glyph colour font). Needs fontTools and brotli.

Fenmyr's name and Myra's character and art are reserved, as [TRADEMARKS.md](TRADEMARKS.md) explains. The code is MIT.

## Third-party notices

`THIRD-PARTY-NOTICES.md` and `web/licenses.js` are generated. After rebuilding the editor bundles in `tools/editor/` (or adding anything someone else made), run `npm run notices` and commit both files. The script asks esbuild what actually goes into `web/vendor/`, so the list matches what ships.

## Icons

The app never names an icon pack directly. It asks for a Fenmyr icon name through `Icon('note')` (`src/web/icons.ts`), or marks a placeholder in the HTML with `<svg data-ico="note"></svg>`. `tools/icons/set.ts` says which icon of the current pack (Phosphor) draws each name and which names the wireframe picker offers; `tools/icons/custom.ts` holds Myra's own icons (the cloudberry mark, the Myra tool, chat). Run `npm run icons` after changing either: it builds `web/icons/pack.js` (both the Regular and the Duotone drawing of every icon) and `src/host/icon-names.tson` (the names Myra may use in wireframes).

To use another icon pack, add it as a dependency and change `pack` and the second column of `set.js`; nothing else in the app changes. A name with no icon shows a dashed placeholder, so old boards never break. Only the bottom bar (toolbar, selection bar, pen bar, shape picker) and Myra's chat header show Duotone; panels, wireframe pieces and icon cards always draw as plain outlines.

## Adding a line to Myra's greeting

Myra's greeting (when the app opens, and on the first focus after midnight) is built from a small list, `GREETERS`, in `src/web/myra/greet.ts`. To add something, register it next to the others:

```js
greeter('myfeature', 20, c => c.firstToday ? { text: 'One thing worth saying today ✦', acts: [{ label: 'Show me', run: () => showIt() }] } : null);
```

- `order` sorts the lines (the hello is 0, due dates 10). At most three lines are shown, in one bubble that also goes into the chat.
- `c` has `why` (`'start'` or `'newday'`), `firstToday`, `now` and `name`. `daily(id)` is true once per calendar day for anything that should only be said once.
- Keep it quick and synchronous: read what is already in memory (never scan boards or wait on the network). Return nothing when there is nothing to say.

## Adding a slash command

Slash commands live in one list, `SLASH`, in `src/web/myra/greet.ts`. Give every command a `cmd`, a plain `desc`, a `run`, and (where it helps) an `ex` example and `opts`. The app sends this list to Myra with every question and `src/host/prompts.ts` puts it in her instructions, so she knows about a new command without anyone editing a prompt. A test fails if a command is missing from what she is told.

If the same thing is something she should be able to do herself (like `timer` or `animate`), also add an action key to the JSON she replies with, in `src/host/prompts.ts`, and handle it in `applyMyra`.
