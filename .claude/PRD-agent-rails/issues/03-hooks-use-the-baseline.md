# 03 — Hooks and guard use the baseline

**Type:** AFK
**Blocked by:** 01, 02

## Goal

An agent hears about a new violation the moment it writes one, the baseline
tightens by itself when a violation goes away, and Claude cannot loosen it.
Read first: `../agent-rails-prd.md` (decision 2), `.claude/hooks/verify.mjs`,
`.claude/hooks/guard.mjs` and its test, `eslint.config.mjs`.

## What slice 02 found out about ESLint's suppressions (each from a run)

- `eslint-suppressions.json` maps a repo-relative path to rule id to
  `{ "count": n }`. Sorted, two-space JSON, about 240 KB, 2,300 files.
- A file whose count for a rule **fell**: `eslint` prints "There are
  suppressions left that do not occur anymore" and exits 2. With
  `--pass-on-unpruned-suppressions` it exits 0. `pnpm lint` (the CI gate) is
  strict, so an unpruned baseline fails CI.
- `eslint --prune-suppressions <files>` lowers the entries of those files
  only, and drops the entry of any file that no longer exists on disk,
  whatever paths it was given.
- One run with `--prune-suppressions` both writes the lower counts and reports
  new violations (exit 1). It never adds a violation to the baseline.
- A file that goes **over** its count: ESLint reports every occurrence of that
  rule in the file, the old ones included. One new comment in a file allowed
  four prints five errors.
- **A rename is not followed.** Entries are keyed by path, so a moved file
  fails with every one of its old violations.
- A stale entry (file deleted) fails nothing, and the next prune removes it.
- Time: one small file 1.4 s, the largest file 8.3 s, the whole repo about two
  minutes.

## Requirements

1. **`verify.mjs edit`** lints the file just written against the baseline, in
   one ESLint run that also prunes.
   - A violation beyond the file's count exits 2 with ESLint's output, which
     carries each rule's own instruction. Because ESLint then lists the old
     occurrences too, the hook adds one line per rule that is over: the
     baseline allows N of it in this file, the file now has M, remove the
     M − N that were added. Without that line an agent reads five errors as
     five things to fix.
   - A count that fell is pruned from `eslint-suppressions.json` without
     bothering the agent.
   - Edits can land in parallel. Two prunes must not lose each other's change
     or leave the file half-written: take the lock the `task` and `stop` modes
     already use.
2. **`verify.mjs task` and `stop`** lint every changed code file the same way,
   before the tests and checks, so a change made through the shell is caught
   too.
   - **A moved file keeps its entry.** For each rename git reports against the
     merge base (`git diff --name-status -M`), when the baseline has the old
     path and not the new one, the hook moves the entry to the new path,
     counts unchanged. This is the one place the file is rewritten other than
     by ESLint, and it cannot raise a total. A move that also adds violations
     still fails for the excess. A file split in two is not a rename: the
     excess is fixed, or the owner raises the baseline.
   - A deleted file's entry is pruned, so `pnpm lint` passes afterwards
     without anyone editing JSON by hand.
3. **Claude cannot add to the baseline.**
   - `guard.mjs` blocks any `eslint` run with `--suppress-all` or
     `--suppress-rule`, however it is invoked (`pnpm lint --suppress-all`,
     `pnpm exec eslint`, `npx eslint`, `node_modules/.bin/eslint`). The reason
     it gives: raising the lint baseline is the owner's call; fix the
     violation, or tell the user which rule and why it cannot be fixed.
     `--prune-suppressions` stays allowed.
   - `.claude/settings.json` denies `Edit` and `Write` on
     `eslint-suppressions.json`.
4. **Claude cannot switch auto-merge on or forge what it waits for** (slice
   07's switch is the repository variable `AUTO_MERGE_CODE`, and its gates
   read commit statuses). `guard.mjs` blocks `gh variable set` and `gh
   variable delete`, any `gh api` call that writes to `actions/variables`, and
   any `gh api` call that posts a commit status (`/statuses/`). The reason it
   gives: the switch and its gates are the owner's; say what you meant to do.

## Done when

- `guard.test.ts` covers each block in each invocation form, and that
  `--prune-suppressions`, a plain `pnpm lint`, `gh variable list` and a read
  of a commit's status pass.
- A test drives `verify.mjs edit` on a real file in this repository: adding a
  comment to a product file exits 2 and the output contains the rule's message
  and the "allows N, now has M" line with the right numbers; removing one
  exits 0 and lowers that file's count in the baseline. The test restores what
  it touched. It fails on `verify.mjs` as slice 01 left it: show that.
- Shown with real output: `git mv` a file that has a baseline entry, run the
  `stop` mode, the entry is under the new path with the same counts and
  `pnpm lint` passes on those two paths; `git rm` a file that has an entry,
  run `stop`, the entry is gone.
- Shown with real output: two `edit` runs started together on two files whose
  counts both fell leave both counts lowered and the JSON valid.
- `pnpm test .claude/hooks` passes, and `pnpm lint` exits 0 on the whole
  repository (about two minutes).
