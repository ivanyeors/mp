# 09 — Remove the comments the ban counted

**Type:** AFK
**Status:** building (2026-11-20)
**Blocked by:** 02, 03

## Goal

The comment ban is outright: product code has no comment the rule reports,
and `eslint-suppressions.json` no longer carries them. Read first:
`../agent-rails-prd.md` (decision 4), `eslint-rules/no-comment.mjs`,
`eslint.config.mjs`.

## Why now (owner, 2026-11-20)

Slice 02 froze 43,570 existing comment lines (2,280 files, 10.6% of those
files' lines) in the baseline. Measured before deciding: 73% are doc blocks
above functions and types, about 840 cite an ADR and 785 a PRD or issue; none
is a TODO, commented-out code or a tool directive other than the two the rule
allows. The owner chose to remove them all: a ban that keeps 43,570 comments
no session may add to leaves explanations that drift from the code. The
reasons stay in git history, the ADRs, the PRDs and `CONTEXT.md`.

## Requirements

1. A one-off codemod removes exactly what `mp/no-comment` reports as a
   comment, and nothing else. It is not committed.
   - Stays: `ponytail:` comments (an over-long one is left whole, not cut),
     `// @vitest-environment …`, `/*turbopackIgnore: true*/`, statements that
     are only a string, and every file where the rule is off.
   - A comment goes with its own line, a trailing one with the spaces before
     it, a JSX one with its braces. No doubled blank line is left behind.
2. Proof, over every changed file, that only comments changed: the JavaScript
   TypeScript emits is byte-identical before and after, and the syntax tree is
   the same once positions, comments and empty JSX containers are set aside.
   The proof fails on a planted wrong version.
3. The baseline goes down through `eslint --prune-suppressions` only, and no
   rule's total rises.
4. A test that leaned on a real file's comment entry is re-pointed at
   something that still exists and proves what it proved before.

## Done when

- ESLint without suppressions reports no comment outside the over-long
  `ponytail:` ones, which are listed.
- The proof passes on every changed file and a second codemod run changes
  nothing.
- `pnpm lint`, the typecheck, `pnpm checks` and `pnpm test` pass on the whole
  repository.
