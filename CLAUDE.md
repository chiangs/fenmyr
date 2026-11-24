# Fenmyr

Fenmyr is an Electron canvas app for Linux. The renderer in `src/web/` draws boards and handles everything people see. The host in `src/host/` owns files, programs and the network. They talk over one bridge, and `src/shared/ops.ts` is its contract.

## Commands

| Command | What it does |
|---|---|
| `npm ci && node node_modules/electron/install.js` | Installs dependencies. npm blocks install scripts, so the second command fetches Electron's binary. |
| `npm start` | Builds, then runs the app from this checkout. |
| `npm run build` | Bundles `src/host` into `dist/` and `src/web` into `web/dist/app.js` with esbuild. |
| `npm run check:fast` | Type check, lint, unused code (knip) and the budget. Run it before every commit. |
| `npm test` | Builds, then runs every file in `tests/` except `perf.ts` and `voice.ts`, each alone, and lists the ones that failed. They run Electron headless, so no display is needed. `npm test -- smoke zoom` runs only those. |
| `node tools/run-tests.ts --lag 50` | Runs the tests with every CSS transition and animation starting 50 ms late (it sets `FENMYR_MOTION_DELAY`), so a test that waits a fixed time for motion instead of for the page to settle fails. `docs`, `smoke`, `theme` and `zoom` start Electron themselves and are not delayed. A change with no transition is delayed too, so a test that measures one at once cancels the delay for those elements, as `CHANGES_AT_ONCE` in `tests/modeBar.ts` does. The Stress workflow runs it nightly in CI's four parts and lists the failing files in its summary; it stays report-only until none fail (#375). |
| `npm run visual` | Screenshots 40 states here and on `origin/main`, or on the ref after `--`. CI uses the PR's base branch. Any changed pixel fails, except in states listed with a reason in `tools/visual-expected.json`, which the PR's reviewer checks. |
| `node tests/perf.ts origin/main` | Times opening, dragging, zooming and editing a 500-card board on both sides, and measures the app's memory across all its processes. Fails when this side is clearly slower or uses clearly more memory. |
| `node tools/flakes.ts [--days n]` | Reads CI through `gh`, for runs created in the last n days (7 by default). Lists each run that needed a rerun with the test or job that failed on its first attempt and its first failing line, whether the same commit then passed, and counts the proven flakes by test. The usual run list hides a failed first attempt, so this is the count to trust. |
| Mac build | Start it from the Actions tab, or run `npm run dist:mac` on a Mac. The result is unsigned. |
| `./make-release.sh` | Builds the AppImage and publishes the version in `package.json` as a GitHub release. A version with a prerelease part (`1.1.0-beta.2`) goes out as a prerelease, so `/releases/latest` stays on the last stable one, and clones on Beta follow its tag. `--dry` prints the release command instead of running it. To cut a beta: set `version` to `1.1.0-beta.N`, add its `WHATSNEW.md` section, merge, then run it from `main`. HEAD must be pushed, because the tag marks the commit that was built. |
| `node tools/budget.ts --write` | Lowers the budget after you pay part of it down. It never raises it. |
| `node tools/colour-convert.ts --map map.json --pairs pairs.json` | Moves raw colours in `web/style.css` onto variables of the same value, from a map of colour to token. `--include`/`--exclude` pick rules by selector, `--dry` changes nothing. Its header says how to write the map. |
| `node tools/colour-compare.ts pairs.json` | Proves a conversion changed nothing: the running app computes the same colour from every old and new value in the pairs file, in light and dark mode. |
| `node tools/dark-survey.ts [--area name] [--status name]` | Counts the `body.dark` selectors in `web/style.css` by area and by what can be done: delete (the declaration never applies or repeats the light rule), clean (fold into a token, no rival), check (rivals named only by a tag or attribute) or blocked (no light twin, or a rival that shares a class or id and would win). `--area` and `--status` list each rule with its light twin and rivals. Its answers are leads: a hover rule and an on rule that fold together show each other as rivals, so prove a slice with `dark-probe.ts`. |
| `node tools/dark-probe.ts snapshot out.json`, then `node tools/dark-probe.ts diff before.json after.json` | Proves folding `body.dark` rules into per-mode tokens changed nothing: it reads the colours the running app computes for the folded elements (plain, hovered, selected) in Default and the four themes, light and dark, and lists any value that moved with its OKLab distance. Take the snapshot before and after, with `npm run build` each time; each fold adds its elements to the steps in the tool. |
| `node tools/dark-sweep.ts snapshot out.json --css base.css [--lines a-b] [--match text] [--scenes words] [--looks words]`, then `diff before.json after.json` | The same proof without writing a step per rule: for every `body.dark` rule in `base.css` (the stylesheet before the fold) it finds the elements in the scenes of `tools/dark-scenes.ts` (the selection bar and its popovers, the doc, Settings, Myra's chat, the library, the phone, the plan preview and more), forces the hover or focus the selector asks for, and records the colours the rule declares, in all six looks. `--scenes` and `--looks` run only those whose name has one of the words, to try a scene. Rules no scene reaches are listed as BLIND: add a scene, or a probe step. |
| `node tools/dark-fold.ts plan` or `apply [--sweep all.json] [--lines a-b] [--skip n]`, then `mutate` and `verify` | Folds `body.dark` rules into per-mode tokens for you: for each rule the survey finds a twin for, the light rule reads a new `--m-` token holding the light and dark value and the dark rule goes. It skips a rule with a raw colour, a variable an element redefines, or an element no sweep scene shows, and says why. `mutate` sets every new token to red so a sweep can show which are live; `node tools/themes-css.ts` undoes it. |
| `node tools/colour-fit.ts --core tools/colour-core.json --apply --pairs pairs.json` | Says which area colours are the core tokens in disguise: each light and dark pair is matched to one core token or a mix of two, within a tolerance. `--prefix` picks the area tokens, `--apply` rewrites the matched uses and drops the body.dark swaps they made redundant, and `colour-compare.ts pairs.json --tolerance 0.02` proves it. |
| `node tools/colour-derive.ts --core tools/colour-core.json --apply --pairs pairs.json` | Turns area colours into mixes of the core tokens, so every use follows the theme: it fits each token in the mode it is used in, writes the expressions to `src/web/settings/derived.ts`, removes the old definitions from `web/style.css`, and lists what doesn't fit. `colour-compare.ts pairs.json --tolerance 0.02` proves it. |
| `node tools/themes-css.ts` | Writes `web/themes.css` from the theme table in `src/web/settings/themes.ts`: the core colours, one block per theme, applied by the class on `<body>`, and the derived area colours from `derived.ts` in a block on `<body>`. Change a colour in the tables, not in the CSS. `--check` fails when the file is out of date, and `check:fast` runs it. |
| `node tools/code-map/query.ts <file or area>` | Says what a file is for, what it imports and what imports it. |

Node runs `.ts` files directly, so tests and tools need no build step. Write imports with the `.ts` extension.

## Layout

| Path | Holds |
|---|---|
| `src/host/` | The Electron main process: window, `OPS` (the bridge operations), storage, vaults, Claude Code, export, speech, updates. |
| `src/shared/` | `ops.ts` (the bridge contract), `cardTypes.ts` (the card-type table), `model.ts` (board and card types), `myraReply.ts` (the check on Myra's replies). |
| `src/web/` | The renderer, one module per area: `canvas/`, `cards/`, `library/`, `myra/`, `docs/`, `selbar/` and others. `main.ts` runs each module's start-up code in a fixed order. `core/state.ts` holds shared state. |
| `web/` | Static files: `index.html`, `style.css`, fonts, stamps, vendor bundles. The renderer builds to `web/dist/app.js`. |
| `tests/` | Headless Electron tests, the perf benchmark, fixtures and the launch helper. |
| `tools/` | The build, the budget, the visual diff, metrics, and generators for icons, notices and the app icon. |
| `tools/editor/` | A separate npm package that builds `web/vendor/editor.js` and `docx.js`. |

## Running from a checkout

`npm start` builds into `dist/` and `web/dist/` (both gitignored) and runs the app from this checkout, so switching branches under a running app has some effects:

- The host code is read once at start, and the window keeps the page it loaded, so a running app doesn't change when you switch branches.
- Files that load later and aren't bundled (fonts, icons, stamps, vendor files) are read from disk when first needed, so they can change mid-session.
- A reload takes `index.html` and `style.css` from the new branch, but `web/dist/app.js` stays the last build, so the page is a mix until you rebuild. `npm run build` on another branch replaces both build folders under a running app.
- From a clone installed with `install.sh`, a branch that differs from upstream makes the update bar offer "Update now", which pulls, builds and reopens (`src/host/update.ts`). Don't use it on a branch you want to keep as it is.

To work on another branch while the app runs, use a worktree (next to the rules below).

## Code map

`node tools/code-map/query.ts <file or area>` says what a file is for, what it imports and what imports it. Use it before changing a shared file, to see what depends on it, and when you need to find where something lives. The same map, rebuilt on every merge to `main`, is at https://code-map.fenmyr.com/ (`code-map.json` and `code-map.md` for tools). It opens on the areas and shows whether the renderer and the host import each other (they must not: they meet only in `src/shared`); `tools/code-map/check.ts`, part of `check:fast`, fails when they do.

## Add a bridge operation

1. Add its arguments and result to `src/shared/ops.ts`.
2. Add the handler to `OPS` in `src/host/main.ts`. Put the real work in a module next to it.
3. Add the method to `window.Fenmyr` in `src/web/bridge.ts`, with a browser fallback.
4. Add a check for it to `tests/smoke.ts`.

## Add a test

Put it in a new file in `tests/` and give it a line in `tools/code-map/descriptions.json`. Nothing else lists the tests: `tools/run-tests.ts` finds them, and CI splits them into parallel parts balanced on the times in `tools/test-times.json`. A new test counts as an average one there until the times are refreshed with `gh run view <run id> --log | node tools/run-tests.ts --write-times`.

## Rules

Each rule names the check that enforces it.

- **Strict TypeScript.** No `any`. No `as` except straight after a parse. Data from disk, the network, child processes and IPC is `unknown` until it is narrowed where it enters. Variants are unions with a `type` or `kind` field, and a `switch` over them ends with a `never` check. Enforced by `tsc` and the budget.
- **Colours come from variables.** CSS uses `var(--token)`, never a new hex, `rgb()`/`rgba()` or `hsl()`/`hsla()` value. A shade or transparency of a token is made from it with `color-mix(in oklab, var(--ink) 40%, transparent)` or `rgb(from var(--ink) r g b / .4)`, so it follows the theme. Mix in `oklab` whenever neither side is a saturated colour (white, black, a warm grey, `transparent`): Chrome drops the hue of a colour with chroma under about 0.02, and an `oklch` mix with no hue on either side paints pink. `tests/greyMixes.ts` fails on one. A colour that's really new becomes a token first. Token values are hex; work out lightness and contrast in OKLCH, not HSL. DESIGN.md lists the tokens. Enforced by the budget's `rawColours` count.
- **Markup templates hold values, not logic.** Compute every value into a named `const` first. Inside `${}` in a template that builds markup, use only a name or a chain of property reads: no ternaries, calls, `.map` or `.join`. Enforced by the budget's `markupLogic` count.
- **One area per module, at most 400 lines.** Before writing a popover, menu, dialog, drag loop or colour helper, look for the shared one. Enforced by the budget's `longFiles` count.
- **Card types live in one table.** Per-type facts go in `src/shared/cardTypes.ts`, not in new lists. Data from outside is parsed once where it enters: `src/shared/myraReply.ts` is the pattern.
- **Find matches every word a card draws.** Per-type words go in `src/web/features/findText.ts`. Enforced by its `switch`, which fails `tsc` on a new card type, and by `tests/findCoverage.ts`, which fails when a card draws a word Find can't match. The test sees only the fields its example fills, so give a new text field a value in `EXAMPLES`. Nothing checks that step.
- **No dead code.** knip and `noUnused*` fail on unused files, exports, dependencies, locals and parameters.
- **Every source file has a one-line description.** Add it to `tools/code-map/descriptions.json` when you add a file, and remove it when you delete one. Enforced by `tools/code-map/check.ts`, part of `check:fast`.
- **Comments say why.** Keep a comment only when it explains something the code can't show. No section banners and no comments that restate the code.
- **Prove behaviour, not compilation.** A renderer change runs `npm run visual` and `node tests/perf.ts origin/main`. A new bridge operation gets a smoke check.
- **User-facing text.** Myra speaks in the first person in her own lines, with ✦ used sparingly. Menus, tooltips, settings and errors are plain and neutral. Use British English.
- **A rule comes with its check.** When a decision becomes a rule, the same change adds what keeps it true: a check in `check:fast` or a test if it can be tested; a tool if doing it by hand is repeated or easy to get wrong; a step or a trap in a skill (`.claude/skills/`) if it's part of proving a change or of a workflow. If none fits, say so where the rule is written. A rule nothing enforces is a request. Not every decision needs one: a check is worth its cost when a mistake was costly or has happened twice, or when the manual work repeats.
- **A new branch is a new worktree.** When asked to create a branch, make it with `git worktree add .claude/worktrees/<name> -b <branch> origin/main` and work there; don't `git switch` or `git checkout -b` in the main checkout, which may be running the app (see Running from a checkout). Give the worktree `node_modules` with a symlink to the main checkout's (`ln -s <main checkout>/node_modules .claude/worktrees/<name>/node_modules`) or `npm ci`. Remove it with `git worktree remove .claude/worktrees/<name>` once the branch is merged. Nothing can check this, so it is an instruction for people and for Claude, kept here so it is written down.
- **Issues are labelled.** Give every issue you open the labels that fit; `gh label list` says what each one means, and `tooling` is for tests, CI and repo tools. The issue templates add `bug` and `enhancement` themselves, so this is for issues opened with `gh issue create` or the blank form. Nothing checks it, because a missed label costs seconds to fix. To find the gaps, filter on the issues' own labels (`gh issue list --state open --limit 500 --json number,title,labels --jq '[.[]|select(.labels|length==0)]'`), not `--search "no:label"`, which lags behind label changes.
- **Commits.** The subject is a plain sentence. GitHub adds the PR number on merge.

The budget in `tools/budget.json` counts untyped files, `any`, casts, long files, logic in markup, raw colours in `web/style.css` and `body.dark` selectors there. All are zero except three casts, each at a boundary (the bridge's reply, `$`, and `session` before a board loads), the `body.dark` selectors, which #251 folds into per-mode tokens in `src/web/settings/derivedModes.ts`, and the fixed sleeps in `tests/` (`waitForTimeout`, the smoke test's `T.wait`, a promise on `setTimeout`, `settle(page, ms)`). `npm run budget` fails when any count rises, so a test waits on the page with `still` and `rect` from `tests/support/settled.ts` instead of sleeping. A sleep that is the point of the test, such as a debounce, takes a `// sleeps on purpose: <why>` comment on the line above it, and the budget fails when the reason is missing.
