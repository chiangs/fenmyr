# Changing Fenmyr

Fenmyr has two layers that talk through one small channel, and most changes touch only one of them. [CLAUDE.md](CLAUDE.md) lists the commands, the layout and the rules, each with the check that enforces it. [DESIGN.md](DESIGN.md) holds the visual and copy rules. This file holds the how-to guides.

## How the canvas talks to the host

`src/web/bridge.ts` sends `{id, op, args}` through `window.fenmyrHost.post`. In the app, `src/host/preload.ts` passes it to `src/host/main.ts`, which looks the op up in `OPS`. The answer goes back over IPC (`fenmyr-reply`), and `preload.ts` hands it to the page's `__fenmyrReply(id, ok, value)`. No data is turned into script, so big boards and pictures pass through quickly. News the page didn't ask for (Caelestia's colours changed) arrives the same way as `__fenmyrEvent(name, data)`. In a plain browser, `bridge.ts` uses localStorage and a pretend Myra instead.

The host answers only the app's own page in the window's main frame. `src/host/senderCheck.ts` drops a message from anywhere else, such as a prototype's preview frame, and logs it, and the microphone, clipboard and notifications are given to that frame alone. A new op gets the same check without any work, but a test that calls the bridge from another frame gets no answer.

**To add an ability that needs the computer**, such as a file, a program or the network, follow [Add a bridge operation](CLAUDE.md#add-a-bridge-operation) in CLAUDE.md, then call `Fenmyr.yourThing()` from `src/web/`.

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

CLAUDE.md says how to [add a test](CLAUDE.md#add-a-test) and why each branch is its own worktree (under Rules). Two habits keep tests steady:

- **Wait on the page, never on the clock.** Read a box or a colour after `still(page)`, or take it with `rect(page, selector)`, both from `tests/support/settled.ts`. A fixed sleep counts against the budget, and one that is the point of the test, such as a debounce, needs a `// sleeps on purpose: <why>` comment.
- **Try the lag run.** `node tools/run-tests.ts --lag 50 <test>` starts every transition 50 ms late, so a test that guesses at timing fails on your machine before it flakes in CI.

**A change people can see** runs `npm run visual`, which compares 129 states pixel by pixel with `origin/main`. Each state your change is meant to alter goes in `tools/visual-expected.json` with a reason, which the reviewer reads; anything else that moved is a mistake to fix. Once the change is on `main`, its entries no longer match a difference, and the next run lists them as stale: remove them then, so the file never excuses a change nobody meant.

## The code map

Every source file has a one-line description in `tools/code-map/descriptions.json`, and so does every area (a folder under `src/web/`, `host`, `shared`, `tests`, `tools`). Add one when you add a file, change it when the file's job changes, and remove it when you delete the file. `npm run check:fast` fails until they match.

The descriptions feed the [code map](https://code-map.fenmyr.com/), which is rebuilt on every merge to `main`. To see what a file is for and what depends on it before you change it, run `node tools/code-map/query.ts <file or area>`. `npm run code-map` builds the site into `site/` to look at it locally.

## Releasing

Bump the patch number for fixes and small changes, and the minor number for new features. A beta carries a prerelease part, such as `1.1.0-beta.2`, and goes out as a GitHub prerelease, so `/releases/latest` and every AppImage stay on the last stable release while clones on Beta follow its tag. The steps, for a release or a beta, are in the header of `make-release.sh`: set `version` in `package.json`, add the version's section at the top of `WHATSNEW.md`, merge, then run `./make-release.sh` from `main` once HEAD is on GitHub (`--dry` prints the release command instead).

What's new reaches people three ways, so write for all three:

- **The release notes** are the `- ` lines of the newest `##` section of `WHATSNEW.md`, and nothing else in the file.
- **The update list** in Settings → About shows, for an install from the code, the `- ` lines added to `WHATSNEW.md` between the installed commit and the update. An edited line counts as added, so leave the lines of earlier versions as they were written.
- **The what's-new card**, shown once when a version first opens, takes a few headline items from `NEWS` in `src/web/app/newsItems.ts`. Add a version's items there, each with an icon from the pack, for the changes worth a picture. `tests/updateChannel.ts` checks which versions show which items.

## Prototypes

A prototype is a folder of code in its project's own git repo, at `prototypes/<name>`, made by `src/host/prototypes.ts`. The first one in a repo also writes the files every prototype there shares, only where the repo lacks them (`src/host/protoStarter.ts`): a Vite and Tailwind set-up, and `design.md` and `myra.md`, the repo's design notes and the rules Myra follows. A prototype board can add its own rules and design cards on top (`src/shared/guides.ts`).

A build (`src/host/build.ts`) sends the request, the cards it came from, their pictures, the rules and design, and any errors, fitted to the model's window by `buildFit.ts`. The builder is `codeAgent.ts`, a single shape any code-writing model can fill; today `claudeCode.ts` runs Claude Code in the prototype's folder with file tools only, no shell and no web, and checks afterwards that nothing outside the folder changed. The page bundles the result with esbuild-wasm (`src/web/proto/bundle.ts`) and shows it in a sandboxed frame on its own `fenmyrpreview:` origin.

## The zip format

`src/shared/fenmyrZip.ts` defines one format for a board, a folder or a project: a manifest, the board files and the media, so a zip never needs migrating. `src/shared/fenmyrStrip.ts` is the one table of what a zip leaves out. Some fields never go, because they only mean something on this computer or are private: an unsent draft to Myra, vault access, a prototype's code folder, a project's repo link. Others go only when ticked in the export dialog: chats, the text of vault notes, and videos, which start ticked. A zip is read the same way in the host and in the tests, and every name is checked before anything is written. Change a field's fate in the table, not in the code that reads it.

## Themes and colours

The core colours of each theme are one entry in `THEMES` in `src/web/settings/themes.ts`, and `node tools/themes-css.ts` writes `web/themes.css` from it; `check:fast` fails when the two disagree. [DESIGN.md](DESIGN.md) says how the tokens fit together, and the `fenmyr-colour` skill in `.claude/skills/` has the steps and the proof for adding a theme or changing a colour.

## Myra's art

Everything Myra looks like is drawn in code:

- `src/web/goo.ts`, with `gooPixels.ts`, `gooPoses.ts`, `gooBusy.ts` and `gooShapes.ts`: Myra herself, live on the page (her pixels, colours, breathing, blinking, hopping, her poses and the props she holds while she works).
- `assets/art/make_art.py`: her stickers and animations, the pixel stamps and the app icon. Run `python3 assets/art/make_art.py` (needs Pillow). To add a stamp, write a `st_…` function, add it to `STAMP_SET`, and map its emoji in `PX` in `src/web/tools/stamps.ts`.
- `assets/art/make_mark.py`: the little cloudberry that ✦ turns into (a one-glyph colour font). Needs fontTools and brotli.

Fenmyr's name and Myra's character and art are reserved, as [TRADEMARKS.md](TRADEMARKS.md) explains. The code is under the EUPL-1.2 (see [LICENSE](LICENSE) and [NOTICE](NOTICE)).

## Contributions

Contributions are accepted under the EUPL-1.2, the licence of the code. Sign off each commit with `git commit -s`, which adds a `Signed-off-by` line with your name and email. That line says you agree to the [Developer Certificate of Origin](https://developercertificate.org), whose text is at that link, and that you offer the change under the EUPL-1.2. Unless a file says otherwise, the licence the DCO calls "the open source license indicated in the file" is the EUPL-1.2 in [LICENSE](LICENSE). Nothing checks the sign-off yet: the pull request template asks for it and the reviewer looks for it.

The files [NOTICE](NOTICE) lists as reserved (Myra, the art, the logo and icon, and their own icons) are not under the EUPL, so pull requests that change them can't be accepted. Open an issue instead.

If an AI tool helped write your change, you are still the one signing it off: check that you can offer the result under the EUPL-1.2, as the DCO asks, and say in the pull request that you used one.

## Third-party notices

`THIRD-PARTY-NOTICES.md` and `web/licenses.js` are generated. After rebuilding the editor bundles in `tools/editor/` (or adding anything someone else made), run `npm run notices` and commit both files. The script asks esbuild what actually goes into `web/vendor/`, so the list matches what ships.

## Icons

The app never names an icon pack directly. It asks for a Fenmyr icon name through `Icon('note')` (`src/web/icons.ts`), or marks a placeholder in the HTML with `<svg data-ico="note"></svg>`. `tools/icons/set.ts` says which icon of the current pack (Phosphor) draws each name and which names the wireframe picker offers; `tools/icons/custom.ts` holds Myra's own icons (the cloudberry mark, the Myra tool, chat). Run `npm run icons` after changing either: it builds `web/icons/pack.js` (both the Regular and the Duotone drawing of every icon) and `src/host/icon-names.json` (the names Myra may use in wireframes).

To use another icon pack, add it as a dependency and change `pack` and the second column of `set.ts`; nothing else in the app changes. A name with no icon shows a dashed placeholder, so old boards never break. Duotone shows only in the tools panel, the bottom bar and Myra's chat header, and only when someone picks it in Settings → Appearance; panels, wireframe pieces and icon cards always draw as plain outlines.

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
