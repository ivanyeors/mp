# 01 — Checks fire in every session, or say they didn't

**Type:** AFK
**Status:** **built** (2026-11-20), reviewed by the `reviewer` subagent
**Blocked by:** none

## Goal

No session ends with its checks unrun and nobody told. Read first:
`../agent-rails-prd.md` (decision 1), `.claude/hooks/verify.mjs`,
`.claude/settings.json`, `.claude/hooks/guard.test.ts` (how a hook is tested
here).

Touch only: `.claude/settings.json` (the SessionStart entry), a new
SessionStart script, `.claude/hooks/verify.mjs`, and a test. Slice 03 changes
verify's lint calls afterwards; leave the `eslint` arguments as they are.

## Requirements

1. **Install at session start, in the cloud.** A SessionStart hook: when
   `CLAUDE_CODE_REMOTE` is `true` and `node_modules/.bin/eslint` is missing,
   run `corepack enable` and `pnpm install --frozen-lockfile`. Load the
   `session-start-hook` skill before writing it and follow it. A local session
   is left alone. A failed install does not stop the session: it prints what
   failed, and requirement 2 takes over.
2. **`verify.mjs` never passes silently for want of dependencies.** Today it
   exits 0 before looking at anything when `eslint` or `vitest` is missing.
   - Work out the changed files first. A session that changed no code file
     still costs nothing and installs nothing.
   - `task` and `stop`, with changed code files and no dependencies: exit 2,
     saying the checks have not run and to run `pnpm install
     --frozen-lockfile`. Reuse the existing three-attempts rule so a machine
     that cannot install does not hold the session forever; when it gives up,
     the user is told through `systemMessage` that the checks did not run.
   - `edit`, on a code file with no dependencies: exit 2 with the same
     instruction, at most once per session state (do not nag on every edit).

## Done when

- A test (`.claude/hooks/verify.test.ts`, run by `pnpm test .claude/hooks`)
  drives `verify.mjs` against a throwaway git repository with no
  `node_modules`: `stop` with a changed `.ts` file exits 2 and names the
  install command; `stop` with no changed code file exits 0; the fourth `stop`
  on the same state exits 0 and prints the `systemMessage`. The test fails on
  today's `verify.mjs`: show that it does.
- Run the SessionStart script by hand in a worktree with no `node_modules`
  and `CLAUDE_CODE_REMOTE=true`: it installs, and a second run does nothing.
  With `CLAUDE_CODE_REMOTE` unset it does nothing. Show the output and timings.
- `pnpm test .claude/hooks` passes.
