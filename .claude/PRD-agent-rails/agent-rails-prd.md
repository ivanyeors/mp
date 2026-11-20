# Agent rails: checks that fire, bans that hold, a merge switch

Owner, 2026-11-20, after an audit of this repo against a talk on running agents
at volume without slop: *"go ahead with 1–4, plus optional ones (Bombadil change
to monthly). Adopt also: banning comments, banning useEffect outright. Can you
make the auto-merge for code a toggle I can easily switch?"*

## Problem

The repo already has hooks, checks, preview screenshots, a fuzzer and a
reviewer. The audit found three of those layers not firing, and several rules
that exist only as prose:

- A cloud session on an environment with no setup script has no
  `node_modules`, and `.claude/hooks/verify.mjs` then exits 0 in every mode.
  The lint-on-edit, task and stop checks pass without running.
- Six React rules are `warn`. The edit hook runs `eslint --quiet` and CI has no
  warning limit, so nothing ever reports them.
- "No new work depends on Shopify" is a paragraph in `CLAUDE.md`; nothing stops
  an import.
- Nothing stops client code from reaching the service-role Supabase client.

## Decisions

1. **Checks run or say they didn't.** A cloud session installs dependencies at
   start. `verify.mjs` never passes silently because it could not run.
2. **Lint has no warnings and no inline disables.** Every rule is `error` or
   off. Every violation that exists today is counted, per file and rule, in
   `eslint-suppressions.json` (ESLint's own bulk suppressions). That baseline
   only goes down. Claude cannot add to it; raising it is the owner's call.
3. **`useEffect` is banned in product code**, with `useLayoutEffect` and
   `useInsertionEffect`. Effects live in `hooks/` (the sanctioned wrappers) and
   `components/ui/` (vendored primitives). The call sites that exist today are
   in the baseline, to be burned down; no new one is accepted.
4. **Comments are banned in product code.** A reason goes where something
   checks it: a name, a type, a test, a `*.check.ts`. What stays: one
   `ponytail:` comment on a deliberate shortcut (`CLAUDE.md`), and directives a
   tool acts on. The comments that existed were counted in the baseline by
   slice 02 and removed by slice 09 (owner, 2026-11-20).
5. **Shopify imports are banned** outside Shopify's own folders.
6. **Client code cannot reach the service-role client**, checked on the import
   graph.
7. **Money lifecycles get property tests** (`fast-check`): the invariants the
   ADRs state, run against the real functions on generated inputs.
8. **`preview map`** names every page the way a person does and gives its
   route and shoot command.
9. **Bombadil runs monthly on `main`**, as well as on request.
10. **Auto-merge for code is a switch**: the repository variable
    `AUTO_MERGE_CODE`. Off (or unset) is today's behaviour. On, a pull request
    that passes its checks merges itself, unless it touches a path that always
    waits for the owner (money, migrations, auth, the rails themselves).
11. **A correction becomes a check.** When the owner or a reviewer corrects an
    agent, the fix lands as a lint rule, test, check or hook in the same pull
    request. A new line in `CLAUDE.md` is the last resort.

## Rules every slice follows

- New code under `app/`, `components/`, `lib/` and `hooks/` (tests and checks
  included) has no comments other than a `ponytail:` one, no
  `useEffect`/`useLayoutEffect` outside `hooks/`, and no ESLint directive
  comments. Slice 02 builds the lint rules; every other slice complies before
  they exist.
- Tooling (`scripts/`, `.claude/`, `.github/`, `eslint-rules/`, config files)
  keeps the house style: comments that say why.
- No new dependency except `fast-check` (slice 05).
- A worktree has no `node_modules`: run `corepack enable && pnpm install
  --frozen-lockfile` first (seconds, the store is warm).

## Slices

| # | Slice | Blocked by |
|---|---|---|
| 01 | Checks fire in every session | — |
| 02 | Lint rails and the baseline | — |
| 03 | Hooks and guard use the baseline | 01, 02 |
| 04 | Client code cannot reach the service-role client | — |
| 05 | Property tests on money lifecycles | — |
| 06 | `preview map` | — |
| 07 | Bombadil monthly, auto-merge switch | — |
| 08 | Instructions, reviewer prompts, pull request template | 01–07 |
| 09 | Remove the comments the ban counted | 02, 03 |
