# 03 — Hooks and guard use the baseline

**Type:** AFK
**Status:** **built** (2026-11-20), reviewed four times (three by the `reviewer` subagent, one independent review); the round-5 fixes for the fourth review were checked by the orchestrating session, not reviewed again. Requirement 2's move rule was replaced, see "As built, after review"
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

## As built, after review

Two reviews found that the move rule in requirement 2 lost entries (a second
move, a move back, a prune between a move and the hook, a file that does not
parse) and that the first repair, restoring from the merge base under a
per-rule total, let cleanup in one file pay for new violations in another.
What `verify.mjs` does instead:

- **The rule.** A file on disk with no entry in the working baseline gets
  what HEAD's committed baseline holds for the file git says it was at HEAD:
  the same path, or the path it was renamed from since HEAD
  (`git diff -M -B HEAD` on a scratch copy of the index; the real index is
  never touched). A file that is new since HEAD gets nothing. An entry that
  is there is never touched, except that it leaves the old path with its
  file; whenever an entry changes path, the file gets HEAD's amount for the
  path it came from. A path vacated that way is looked at again, pass after
  pass, until none is left. The same run's prune then lowers a restored
  entry to what the file has, and `task` and `stop` also lint every file in
  HEAD's baseline that has no entry, so they reject what `edit` rejects.
- **So the ratchet is per commit.** A count that was lowered and committed
  with the baseline does not come back. Before the commit, removing a
  violation and adding another is within the count, which ESLint could never
  tell apart anyway.
- **One allowance, one file.** When the hook gives a file the entry of a
  different path it records the claim (`claims.json` in the checkout's git
  directory). While the claim stands, that HEAD path's allowance goes to no
  other file, the file re-created at the old path included. A claim ends
  with its file, with its entry, or when the move is committed with the
  baseline. The claims are written with the baseline, before ESLint runs,
  claims first.
- **A file that does not parse** keeps the entry it had before the run. If
  ESLint does not finish, the whole baseline and the claims are put back as
  they were before the run.
- **`task` and `stop`** lint first and fail at once on a lint failure, record
  a pass or a counted failure only when the tree at the end is the tree that
  was checked, and never exit without saying why.
- **`edit`** lints the file in its own checkout, so a worker in a worktree is
  linted by that worktree's config and baseline.
- **A merge conflict in the baseline.** Claude can neither edit the file nor
  take one side, so `node scripts/lint-baseline.mjs --resolve` merges the
  three index stages as a three-way merge per path and rule (a side that did
  not change an entry yields to the other; both changed, the lower count;
  removed by a side that changed it, removed) and the hook names that
  command.
- **The guard** blocks `--suppress-all` and `--suppress-rule` on any simple
  command that runs ESLint, wherever the program sits (`xargs -n 50 …`,
  `find -exec`, `bash -lc`, a continuation line, `corepack pnpm lint`), and
  `gh variable` writes with options before the action.

Known limits, also in the header of `verify.mjs`:

- A move committed without the baseline's change, in a clone whose working
  baseline is then HEAD's, is not healed. CI is red on that commit.
- If the claims file is deleted by hand, a small or much-edited file
  re-created at a moved file's old path can get the allowance twice. The
  totals check in `scripts/pr-risk.mjs` is what sees it. A hook killed during
  ESLint no longer causes this: the claims are written with the baseline.
- When a move and a new file at the old path both happen before the first
  hook run and the files are under 400 bytes, git cannot tell them apart:
  the old path keeps its entry and the moved file gets none, which fails
  closed. The same holds for a small file moved over another (`git mv -f`).
- A claimed file's move that is stashed, followed by a hook run and a
  `stash pop`, loses its claim.
- `git mv -f q p` where `p` keeps its own smaller working entry (`p` 3,
  `q` 5): `p` fails "allows 3, now has 5" and `q`'s 5 is pruned away. This
  fails closed.
- `task` and `stop` judge the project directory. A worker's shell-made
  changes in its own worktree are linted when its branch is merged, not by
  the worker's own `task` run.
- The guard parses commands; it does not stop a script written to edit the
  baseline. The pull request gate (a grown total waits for the owner) is
  the backstop.

## Changed: `edit` no longer prunes (owner, 2026-11-22)

Requirement 1 had `edit` prune on every write. An edit made in steps can
pass through a state that parses with a suppressed violation gone. That
run lowered the count, and the finished file, which still had the violation,
then failed. Only the owner can raise a count back.

- `edit` lints with `--pass-on-unpruned-suppressions` and no
  `--prune-suppressions`: a count that fell neither fails nor is written.
  A count that rose still fails, with the same "allows N, now has M" line.
- `task` and `stop` keep `--prune-suppressions`, so the baseline still only
  goes down, at task end and at stop. `guard.mjs` is unchanged.
- Until then the working baseline can hold counts above what the files have.
  A commit made before a task or stop run carries them, and `pnpm lint`
  fails on them ("suppressions left that do not occur anymore") until they
  are pruned: by the next task or stop run, or by
  `eslint --prune-suppressions <files>`.
- Checked by `.claude/hooks/verify.test.ts`: "a step with a comment gone
  exits 0 and leaves the baseline byte for byte, so the finished file with it
  back passes", and "task/stop on the state with a comment gone lowers the
  file's count".
