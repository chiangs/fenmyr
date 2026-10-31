# Fenmyr

Fenmyr is an Electron canvas app for Linux. The renderer in `web/` draws boards and handles everything people see. The host in `src/host/` owns files, programs and the network. They talk over one bridge, and `src/shared/ops.ts` is its contract.

## Commands

| Command | What it does |
|---|---|
| `npm ci && node node_modules/electron/install.js` | Installs dependencies. npm blocks install scripts, so the second command fetches Electron's binary. |
| `npm start` | Builds, then runs the app from this checkout. |
| `npm run build` | Bundles `src/host` into `dist/main.cjs` and `dist/preload.cjs` with esbuild. |
| `npm run check:fast` | Type check, lint, unused code (knip) and the budget. Run it before every commit. |
| `npm test` | Builds, then runs the vault, smoke, zoom, theme and docs tests. They run Electron headless, so no display is needed. |
| `npm run visual` | Screenshots 22 states here and on `origin/main`. Any changed pixel fails. |
| `node tests/perf.ts origin/main` | Times opening, dragging, zooming and editing a 500-card board on both sides and fails when this side is clearly slower. |
| `node tools/budget.ts --write` | Lowers the budget after you pay part of it down. It never raises it. |

Node runs `.ts` files directly, so tests and tools need no build step. Write imports with the `.ts` extension.

## Layout

| Path | Holds |
|---|---|
| `src/host/` | The Electron main process: window, `OPS` (the bridge operations), storage, vaults, Claude Code, export, speech, updates. |
| `src/shared/ops.ts` | The bridge contract: every operation's arguments and result, and the events the host sends. |
| `web/` | The renderer: `index.html`, `style.css`, `app.js`, `bridge.js` (`window.Fenmyr`), `goo.js` (Myra's sprite), fonts, stamps, vendor bundles. |
| `tests/` | Headless Electron tests, the perf benchmark, fixtures and the launch helper. |
| `tools/` | The build, the budget, the visual diff, metrics, and generators for icons, notices and the app icon. |
| `tools/editor/` | A separate npm package that builds `web/vendor/editor.js` and `docx.js`. |

## Add a bridge operation

1. Add its arguments and result to `src/shared/ops.ts`.
2. Add the handler to `OPS` in `src/host/main.ts`. Put the real work in a module next to it.
3. Add the method to `window.Fenmyr` in `web/bridge.js`, with a browser fallback.
4. Add a check for it to `tests/smoke.ts`.

## Rules

Each rule names the check that enforces it.

- **Strict TypeScript.** No `any`. No `as` except straight after a parse. Data from disk, the network, child processes and IPC is `unknown` until it is narrowed where it enters. Variants are unions with a `type` or `kind` field, and a `switch` over them ends with a `never` check. Enforced by `tsc` and the budget.
- **Markup templates hold values, not logic.** Compute every value into a named `const` first. Inside `${}` in a template that builds markup, use only a name or a chain of property reads: no ternaries, calls, `.map` or `.join`. Enforced by the budget's `markupLogic` count.
- **One area per module, at most 400 lines.** Before writing a popover, menu, dialog, drag loop or colour helper, look for the shared one. Enforced by the budget's `longFiles` count.
- **No dead code.** knip and `noUnused*` fail on unused files, exports, dependencies, locals and parameters.
- **Comments say why.** Keep a comment only when it explains something the code can't show. No section banners and no comments that restate the code.
- **Prove behaviour, not compilation.** A renderer change runs `npm run visual` and `node tests/perf.ts origin/main`. A new bridge operation gets a smoke check.
- **User-facing text.** Myra speaks in the first person in her own lines, with ✦ used sparingly. Menus, tooltips, settings and errors are plain and neutral. Use British English.
- **Commits.** The subject is a plain sentence. GitHub adds the PR number on merge.

The budget in `tools/budget.json` records what is still being paid down: untyped files, `any`, casts, long files and logic in markup. `npm run budget` fails when any count rises.
