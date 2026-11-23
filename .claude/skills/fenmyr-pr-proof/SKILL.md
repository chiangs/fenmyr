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

When the PR needs the work of an earlier PR it is a stack (CLAUDE.md has the rule). Base it on the earlier PR's branch, not
on `main`, and rebase it there if it was made from `main`: a PR retargeted to another PR's branch without the rebase shows
that PR's changes reversed in its diff. Run `gh extension install github/gh-stack` once, then
`gh stack link <bottom PR> <next PR>`, and check with `gh pr view <number> --json baseRefName` that each PR's base is the
branch below it. Prove each PR against its own base, as above. PRs that don't need each other stay on `main`.

## Gates, in this order

1. `npm run check:fast` after every hand edit. Type check, lint, knip, budget, name and code-map checks.
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

A new test goes in a new file in `tests/` with its line in `tools/code-map/descriptions.json`, and nothing else.
`tools/run-tests.ts` finds it for `npm test` and for CI's parallel parts. Run it alone with `npm test -- <name>`.

## Traps

- **Update bar.** The app's update checker shows a bar when the branch's upstream has commits HEAD lacks. That breaks
  the phone drag check in `tests/contextBar.ts` and the `settings-about` visual state. Unset the upstream, or make sure
  it is not ahead, before running tests.
- **A rebased branch looks diverged too.** The update bar appears whenever the branch differs from its upstream, not only
  when it is ahead, so a freshly rebased branch shows a longer update line and `settings-about` differs by about
  137,000 px that no change of yours caused. Push (with `--force-with-lease`), then run `npm run visual`.
- **A single test runs the built bundle.** `npm test` builds first; `node tests/x.ts` does not. After a change under
  `src/web/`, run `npm run build` before running one test alone, or it tests the old code.
- **Measure a "within tolerance" claim.** `visual` only says that pixels changed. For a change that claims "no visible
  difference" (a colour moved onto a token), measure the largest per-pixel OKLab distance in each changed state and quote
  it; 0.02 is the line below which two colours look the same. List each state in `visual-expected.json` with its number.
- **Reading a computed colour in a test.** `getComputedStyle` returns `oklab(...)`, `oklch(...)` or `color(srgb ...)` for
  a `color-mix()` or `rgb(from ...)`, so do not parse numbers out of it. Call `installPaint(page)` from
  `tests/support/paint.ts`, then `window.__paint(css)` inside `page.evaluate`, which returns `[r, g, b, a]`.
- **Measuring after a state change.** Read after `still(page)`, or take the box with `rect(page, selector)`
  (`tests/support/settled.ts`), which wait for animations that have not started yet. A sleep does not: `node
  tools/run-tests.ts --lag 50 <test>` starts every transition 50 ms late and shows it.
- **Worktrees need `node_modules`.** Symlink the main checkout's `node_modules` or run `npm ci`. Without it
  `tools/build.ts` stops at the `esbuild.wasm` copy and tests see a half-built app.
- **Shared scratch.** Logs named `perf.log`, `visual.log` or `test.log` get mixed when agents share a folder. Keep
  logs in a folder named for your branch.
- **Shared files.** `tools/code-map/descriptions.json` and `tools/visual-expected.json` are touched by every PR.
  Add only your own lines so parallel branches merge cleanly.
- **Budget.** `markupLogic` and `longFiles` stay 0; a file is at most 400 lines by the budget's count. `rawColours`
  may only go down.

## In the cloud container

Things that are true of the sandbox a Claude Code session runs in, not of the code:

- **The real `claude` hides the test stand-in.** `findClaude()` in `src/host/claude.ts` falls back to a login shell,
  which here finds the real binary on `~/.local/bin`. Prototype states in `visual`, `tests/buildBlock.ts`, `tests/build.ts`
  and `tests/richIntegration.ts` then fail with "the stand-in never wrote App.tsx". Run them with `SHELL` set to a script
  that execs `bash --noprofile --norc` with `-l` and `-i` dropped, and `PATH` without `~/.local/bin`:
  `SHELL=/path/plainshell PATH=/opt/node22/bin:/usr/local/bin:/usr/bin:/bin node tests/x.ts`.
- **Known failure on a clean `main` here:** `tests/chatSees.ts` (it hides `claude` from `PATH` and the login shell finds it
  anyway). Check against a clean worktree of `origin/main` before calling any other failure yours.
- **Flakes that pass on a rerun alone:** `tests/buildBlock.ts` under load; a 9 px scrollbar strip in `settings-helpers`;
  `PERF WORSE: mainMB` when anything else is running. Run perf and the full suite one after the other, never together.
- **PRs.** `gh pr create` uses GraphQL, which the sandbox blocks. Write the body to a file and use
  `gh api repos/OWNER/REPO/pulls --input pr.json`. Merge only when the user asks.

## Report

Give: the head SHA; each commit and what it proves; each claim with its test and its revert failure line; each
command's outcome line; perf medians if run; screenshot paths; every departure from the brief and why; defaults you
chose, in plain words.
