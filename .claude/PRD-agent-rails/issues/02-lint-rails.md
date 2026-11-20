# 02 — Lint rails: no warnings, no inline disables, a baseline that only goes down

**Type:** AFK
**Status:** **built** (2026-11-20), reviewed by the `reviewer` subagent
**Blocked by:** none

## Goal

`pnpm lint` passes on today's code and fails on any new violation, with every
existing violation counted in `eslint-suppressions.json`. Read first:
`../agent-rails-prd.md` (decisions 2–5), `eslint.config.mjs`, `CLAUDE.md`
("Shopify is being replaced", "How code is written here").

ESLint is 9.39.2, which has bulk suppressions built in (`--suppress-all`,
`--prune-suppressions`, `--pass-on-unpruned-suppressions`). No new dependency.

Do not touch `.claude/hooks/**` or `.claude/settings.json`: slices 01 and 03
own them.

## Requirements

1. **A local plugin `mp`** in `eslint-rules/`, registered in
   `eslint.config.mjs`. Each rule's message tells the reader what to do
   instead; it is the only instruction the next agent gets.
   - **`mp/no-effect`** reports every call of `useEffect`, `useLayoutEffect`
     and `useInsertionEffect`, bare or as `React.useEffect`. On in `app/**`,
     `components/**`, `lib/**` and `proxy.ts`; off in `hooks/**` and
     `components/ui/**`. The message names the alternatives: derive the value
     while rendering; do the work in the event handler; load data in a Server
     Component, loader or server action; subscribe with
     `useSyncExternalStore`; reset state with a `key`; attach to a DOM node
     with a ref callback (React 19 runs its cleanup); and if none fits, use or
     add a hook in `hooks/`, the only place effects live.
   - **`mp/no-comment`** reports comments in `app/**`, `components/**`,
     `lib/**`, `hooks/**` and `proxy.ts`, tests and checks included; off in
     `components/ui/**`. A run of line comments on consecutive lines is one
     report. Allowed: a comment (or run) that starts with `ponytail:`; and
     directives a tool acts on. Find which directive comments the codebase
     really has (TypeScript's `@ts-expect-error`, triple-slash references,
     bundler magic comments, `@vitest-environment` and the like) and allow
     those patterns and no others. JSDoc is a comment. ESLint's own directives
     are not allowed (requirement 3). A file a tool regenerates and overwrites
     is exempt by path; list any you find. The message says where the reason
     goes instead: a clearer name, a type, a test or a `*.check.ts`; and that
     a deliberate shortcut may carry one `ponytail:` comment naming its ceiling
     and the upgrade path.
2. **Shopify.** `no-restricted-imports` (core) on `@shopify/*` and on
   `lib/shopify` by alias or relative path, everywhere except Shopify's own
   folders: `lib/shopify/**`, `app/api/shopify/**`,
   `app/api/cron/shopify-*/**`, and `scripts/**`. The message cites
   `CLAUDE.md`: nothing new integrates with Shopify; the only Shopify work is
   the one-time import and the cutover (ADR 0029). Importers outside those
   folders today go in the baseline.
3. **No inline config.** `linterOptions.noInlineConfig: true`, and delete
   every ESLint directive comment in linted files, since they stop working.
   What they silenced goes in the baseline.
4. **No warnings.** Find every rule the resolved config sets to `warn`
   (`eslint --print-config` for a `.tsx`, a `.ts` and a script) and make each
   `error`. That includes the six React Compiler rules this config downgraded.
   The `lint` script becomes `eslint --max-warnings 0`.
5. **The baseline.** With all of the above in place, write
   `eslint-suppressions.json` with `--suppress-all` and commit it.
6. **`scripts/lint-baseline.mjs`** prints the baseline's total per rule, and
   with `--against <ref>` (default `origin/main`) the change per rule against
   that ref's copy; a ref with no file counts as zero. It reports and exits 0.
   It exports the function that totals a parsed baseline.

## Done when

- `pnpm lint` exits 0. `pnpm checks` and `pnpm test` still pass (some checks
  read source text; deleting directive comments must not break one).
- Tests under vitest: both rules with ESLint's `RuleTester` (a `ponytail:`
  run, a directive, a JSX comment, `React.useEffect`, a plain call), and the
  real config through the `ESLint` class with `lintText`: a `useEffect` is
  reported in `components/x.tsx` and not in `hooks/x.ts`; a Shopify import is
  reported in `lib/x.ts` and not in `lib/shopify/x.ts`; a comment in
  `lib/x.ts` is reported and an `eslint-disable-next-line` above it changes
  nothing. Plus a test of the totals function.
- Shown with real output, each on a scratch edit you then revert: a new
  `useEffect` in a file with none fails; one more `useEffect` in a file that
  already has some fails; a new `// note` fails; a new Shopify import in
  `lib/` fails.
- **Answers slice 03 needs**, each from a real run, with the command and
  output: what `pnpm lint` does after a comment is deleted from a file in the
  baseline (exit code, message); whether `eslint --prune-suppressions <one
  file>` leaves every other file's entry alone; whether one `eslint` run can
  both prune and report new violations; what happens to the entry of a file
  that is deleted or renamed; how long a full `pnpm lint` and a one-file run
  take.
- The reply lists the rules promoted from `warn`, the per-rule totals
  (`node scripts/lint-baseline.mjs`), and the exact shape of
  `eslint-suppressions.json`.
