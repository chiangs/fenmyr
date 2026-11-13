---
name: fenmyr-fix-round
description: Fix the findings of an independent verifier's report on a Fenmyr branch. Use when given a verifier report, a review with blockers or should-fix items, or asked for a fix round on an existing feat/ or fix- branch. Each fix gets a test that fails without it.
---

# Fix round

Input: a branch, its base, and a report of findings with severity, steps to reproduce, file and line. Output: new
commits on the same branch, each finding fixed and proven. Use `fenmyr-pr-proof` for the proof commands.

## Start

1. Read the report and rerun its probes at the current head. Confirm each finding reproduces before touching code. If
   one does not, say so instead of fixing it.
2. Start from the remote branch head. If the base has moved, rebase with
   `git rebase --onto <new base> <old base SHA>`.
3. Never force-push, and do not open a PR or merge unless asked. Push fast-forward to the existing remote branch.

## For each finding

1. Write a test that reproduces it, through the app where the report did (`tests/support/launch.ts`), not only through
   a unit. A race or a host/renderer disagreement needs the app.
2. Fix it with the smallest change that satisfies the stated requirement. If the report leaves a choice, pick one, say
   why, and keep the rule simple.
3. Revert only the fix. Confirm the test fails and copy the failure line. Restore.
4. One commit per finding where possible. Subject is a plain sentence ending in a full stop.

Fix blockers first, then should-fix. Do nits only if cheap, and say which you skipped.

## Rules that bite in fixes

- Data from disk, IPC and child processes is `unknown` until narrowed where it enters. A fix that adds a field to a
  host event parses it once, at the boundary.
- User-visible refusals are in Myra's words when she is the speaker. Never show a raw host error string to the person.
- Fix stale entries in `tools/visual-expected.json` if the base now contains the change they describe.
- A new test is wired into `package.json`, `.github/workflows/ci.yml` and `tools/code-map/descriptions.json`.

## Finish

Run `npm run check:fast`, `npm test`, and the visual and perf comparisons if a renderer path changed. Then report: the
new head SHA; each finding with its commit, test and revert failure line; each command's outcome line; defaults you
chose; anything left open.
