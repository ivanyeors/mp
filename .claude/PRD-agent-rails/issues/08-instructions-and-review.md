# 08 — Instructions, reviewer prompts and the pull request template

**Type:** AFK
**Blocked by:** 01–07

## Goal

What the code now enforces is said once, briefly, where an agent reads it; and
the one rule that needs judgment is written down. Read first:
`../agent-rails-prd.md` (decision 11), `CLAUDE.md` (its first line: it holds
only what the code can't tell you), `.claude/agents/reviewer.md`,
`.github/workflows/claude-review.yml`, `.github/pull_request_template.md`.

The brief carries what slices 01–07 built: rule names, commands, the switch.
Use those facts; do not restate what a lint message already says.

## Requirements

1. **`CLAUDE.md`**, kept as short as it is now:
   - "How code is written here": product code has no comments but a
     `ponytail:` one, and no effects outside `hooks/`; lint has no warnings
     and no inline disables; the exceptions that exist are counted in
     `eslint-suppressions.json`, which only goes down and which Claude cannot
     add to.
   - **A correction becomes a check**: when the owner or a reviewer corrects
     an agent, the fix lands as a lint rule, test, check or hook in the same
     pull request; a new line in this file is the last resort.
   - "Done means checked": a cloud session installs its own dependencies;
     `preview map` finds a page by name.
   - "Pull requests and review": the `AUTO_MERGE_CODE` switch, and what always
     waits for the owner.
2. **`reviewer.md` and the `claude-review.yml` prompt** also report: a lint
   baseline that grew; a cast or a `ponytail:` comment that stands in for
   doing the thing; a new hook in `hooks/` that only wraps one caller's
   effect; a correction fixed in prose where a check was possible.
3. **Pull request template**: one line under "Checks that prove it" for the
   lint baseline's change (`node scripts/lint-baseline.mjs --against
   origin/main`).

## Done when

- `CLAUDE.md` is no longer than it was plus about fifteen lines.
- Every command and name the changed files mention exists and runs: show each
  one run.
