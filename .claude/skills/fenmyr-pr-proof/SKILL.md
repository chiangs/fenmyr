---
name: fenmyr-pr-proof
description: Prove a Fenmyr change before it is reported done or opened as a PR. Use when finishing a branch, preparing a PR, or when asked to verify, prove or run the gates on a change. Covers the check, test, visual and perf commands, the revert check for each claim, and the traps that break them.
---

# Prove a Fenmyr change

CLAUDE.md says what the rules are. This says how to show a branch obeys them. "It compiles" is not proof; each claim
needs a test that fails without the change.

## Base

Compare against the branch the work stacks on, not always `origin/main`. For the Myra chat epic that is
`origin/feat/myra-chat`. Fetch first, and say which base you used in the report.

## Gates, in this order

1. `npm run check:fast` after every hand edit. Type check, lint, knip, budget, name/CI/code-map checks.
2. `npm test` once at the final head. It builds first.
3. `npm run visual -- <base>` for any renderer change. Look at every changed image yourself. Each changed state must be
   in `tools/visual-expected.json` with an accurate reason, and stale entries for changes already on the base must be
   removed.
4. `node tests/perf.ts <base>` for any renderer path change. Run it through
   `flock ~/.cache/fenmyr-epic/perf.lock node tests/perf.ts <base>` when other agents may be running perf, since runs
   share one machine and disturb each other.
5. Screenshots of what you changed, in light and dark and at phone width, taken through `tests/support/launch.ts`
   (headless Electron, no display needed).

## Revert check

For each claim the change makes:

1. Name the test that covers it.
2. Revert only the fix, keeping the test.
3. Run the test and copy the failing line.
4. Restore the fix and confirm it passes.

A test that passes with the fix reverted proves nothing. Rewrite it.

## Wiring a new test

A new test goes in a new file and must be added to all three of: the `test` script in `package.json`,
`.github/workflows/ci.yml`, and `tools/code-map/descriptions.json`. `tools/check-ci.ts` and `tools/code-map/check.ts`
catch some omissions, not all.

## Traps

- **Update bar.** The app's update checker shows a bar when the branch's upstream has commits HEAD lacks. That breaks
  the phone drag check in `tests/contextBar.ts` and the `settings-about` visual state. Unset the upstream, or make sure
  it is not ahead, before running tests.
- **Worktrees need `node_modules`.** Symlink the main checkout's `node_modules` or run `npm ci`. Without it
  `tools/build.ts` stops at the `esbuild.wasm` copy and tests see a half-built app.
- **Shared scratch.** Logs named `perf.log`, `visual.log` or `test.log` get mixed when agents share a folder. Keep
  logs in a folder named for your branch.
- **Shared files.** `package.json`, `.github/workflows/ci.yml`, `tools/code-map/descriptions.json` and
  `tools/visual-expected.json` are touched by every PR. Add only your own lines so parallel branches merge cleanly.
- **Budget.** `markupLogic` and `longFiles` stay 0; a file is at most 400 lines by the budget's count. `rawColours`
  may only go down.

## Report

Give: the head SHA; each commit and what it proves; each claim with its test and its revert failure line; each
command's outcome line; perf medians if run; screenshot paths; every departure from the brief and why; defaults you
chose, in plain words.
