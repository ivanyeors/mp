# 03 — Hooks and guard use the baseline

**Type:** AFK
**Blocked by:** 01, 02

## Goal

An agent hears about a new violation the moment it writes one, the baseline
tightens by itself when a violation goes away, and Claude cannot loosen it.
Read first: `../agent-rails-prd.md` (decision 2), `.claude/hooks/verify.mjs`,
`.claude/hooks/guard.mjs` and its test, `eslint.config.mjs`, and the answers
slice 02 recorded about how ESLint's suppressions behave (they are in this
slice's brief).

## Requirements

1. **`verify.mjs edit`** lints the file just written against the baseline. A
   violation beyond the file's count exits 2 with ESLint's output, which
   carries the rule's own instruction. A count that fell is pruned from
   `eslint-suppressions.json` without bothering the agent.
2. **`verify.mjs task` and `stop`** lint every changed code file the same way,
   before the tests and checks, so a change made through the shell is caught
   too. The baseline entry of a file the change deleted or renamed is handled
   so that `pnpm lint` passes afterwards without anyone editing JSON by hand.
3. **Claude cannot add to the baseline.**
   - `guard.mjs` blocks any `eslint` run with `--suppress-all` or
     `--suppress-rule`, however it is invoked (`pnpm lint --suppress-all`,
     `pnpm exec eslint`, `npx eslint`, `node_modules/.bin/eslint`). The reason
     it gives: raising the lint baseline is the owner's call; fix the
     violation, or tell the user which rule and why it cannot be fixed.
     `--prune-suppressions` stays allowed.
   - `.claude/settings.json` denies `Edit` and `Write` on
     `eslint-suppressions.json`. It changes only through ESLint.

## Done when

- `guard.test.ts` covers the block in each invocation form, and that
  `--prune-suppressions` and a plain `pnpm lint` pass.
- A test drives `verify.mjs edit` on a real file in this repository: adding a
  comment to a product file exits 2 and the output contains the rule's
  message; removing one exits 0 and lowers that file's count in the baseline.
  The test restores what it touched. It fails on `verify.mjs` as slice 01
  left it: show that.
- Shown with real output: `git rm` a file that has a baseline entry, run the
  `stop` mode, then `pnpm lint` exits 0.
- `pnpm test .claude/hooks` and `pnpm lint` pass.
