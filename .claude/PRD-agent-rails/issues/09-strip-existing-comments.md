# 09 — Remove the comments the ban counted

**Type:** AFK
**Status:** **built** (2026-11-20). Proven by the before/after comparison in requirement 2, run by the worker and again by the orchestrating session on the merged tree; the `reviewer` subagent's second check on the money paths is recorded in the pull request
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

## As built

- 43,583 comment lines removed from 2,280 files. The baseline's
  `mp/no-comment` total went from 43,570 to 4, and the whole baseline from
  44,403 to 837.
- Left, and still counted: two `ponytail:` comments longer than four lines
  (`lib/results/access.ts`, `lib/spatial-fillings/visuals.ts`).
- 45 `ponytail:` notes sat inside a longer comment that began with other
  text, so the rule reported them. Each is kept as its own comment of at
  most four lines, in the note's own words.
- A block that held only a comment is now `{}` (89 blocks). TypeScript prints
  such a block on one line, so 57 files' emitted JavaScript differs in that
  whitespace alone; the other 2,217 stripped files emit byte-identical
  JavaScript, and all have the same syntax tree.
- Six checks passed because a comment held the text they searched for
  (`pdp-mobile`, `xray-dive`, `country`, `slice-03`, `order-mirror-catchup`,
  `color-overrides`). Each now reads the code and fails on a planted wrong
  version. `pdp-mobile.check.ts` asserted a pinch-zoom the gallery dropped
  long ago; it now asserts there is no touch-action there, and strips
  comments before it looks.
- `docs/data-flows/inventory.md` lost one sentence that pointed at a deleted
  file header.
- The codemod and the proof are not in the repository. To get a comment back,
  read the file at the commit before this one on `main`.
