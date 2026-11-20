# 07 — Bombadil monthly, and auto-merge for code behind a switch

**Type:** AFK
**Status:** **built** (2026-11-20), reviewed by the `reviewer` subagent
**Blocked by:** none

Read first: `../agent-rails-prd.md` (decisions 9, 10), every file in
`.github/workflows/` (their header comments record why each is built the way
it is), `CLAUDE.md` ("Pull requests and review", "Commit author"),
`.claude/rules/money.md`.

## A. Bombadil monthly

`bombadil.yml` also runs on a schedule: the first of each month, against
`main`, once as `owner` and once as `visitor`, ten minutes each. A scheduled
run has no inputs, so the defaults must hold without them. Running it by hand
keeps working as it does now. Update the header comment, which says "on
request only".

## B. The switch

The repository variable **`AUTO_MERGE_CODE`**. `on` turns it on. Unset or
anything else is off, and off changes nothing about today. A variable, not a
file or a label, because only the owner can change one: no pull request and no
agent can flip it.

**`scripts/pr-risk.mjs`** holds the decision as pure functions, tested.

- `classify(files, moneyPaths)` returns `owner` or `auto`. `owner`, which
  never merges itself, when any file is:
  - on a money path: the `paths:` of `.claude/rules/money.md`, read from the
    base branch, so the list has one home;
  - under `supabase/`;
  - one of the rails: `.github/**`, `.githooks/**`, `.claude/**` except
    `.claude/PRD-*/**`, `CLAUDE.md`, `eslint.config.mjs`, `eslint-rules/**`,
    `scripts/checks.mjs`, `scripts/pr-risk.mjs`, `scripts/git-identity`,
    `vitest.config.ts`, `tsconfig*.json`, `package.json`, `pnpm-lock.yaml`,
    `pnpm-workspace.yaml`, `next.config.ts`, `vercel.json`, `proxy.ts`;
  - sign-in, sessions, roles or permissions code. Find those folders and name
    them in the list.
  Also `owner` when the lint baseline grew: any rule's total in
  `eslint-suppressions.json` is higher at the head than at the base. The file
  maps path → rule → `{ "count": n }` (slice 02 confirms the shape); a side
  with no file counts as zero.
- `decide(...)` returns merge or the reason not to. Merge only when all hold:
  the switch is on; the pull request is open, not a draft, from this
  repository, opened by the repository owner's login; `classify` is `auto`;
  every check run on the head commit finished and none failed; the commit
  status (Vercel's build, the gate for a build that does not compile) is
  success; no review thread is unresolved; the head has not moved since the
  facts were read.

**`.github/workflows/auto-merge.yml`** gathers those facts and acts.

- It runs when `ci` or `claude review` completes (`workflow_run`), when a
  commit status turns to success (`status`), and by hand for one pull request
  number (`workflow_dispatch`). These run from the base branch with a write
  token. It must never check out or execute pull request code: it checks out
  the base branch for the script and `money.md`, and reads everything about
  the pull request through the API.
- On merge: squash, pinned to the head commit it judged
  (`--match-head-commit`). Then read the merge commit back and fail loudly if
  its author is not the repository owner: Vercel builds only that identity and
  says nothing otherwise.
- On no merge: the reason goes in the job summary, in words. No comment on
  the pull request.
- Permissions stated, the minimum that works. Actions pinned by commit, as
  the other workflows do.

## Done when

- `pnpm test scripts/pr-risk` passes. The tests cover: each `owner` path
  family; a docs-only and a plain code change as `auto`; a baseline that grew,
  shrank, and appeared; and every `decide` condition failing alone while the
  rest hold (switch off, draft, a fork, another author, a pending check, a
  failed check, status pending, an unresolved thread, a moved head).
- The workflows cannot run before they are on `main`. Say so in the reply, and
  list, step by step, what you checked by reading instead (each API call's
  fields against GitHub's documentation, each `if:`), and anything you could
  not confirm.
- `actionlint` on both workflow files if it can be installed here; otherwise
  say it was not run.

## As built, after review

`decide` in `scripts/pr-risk.mjs` merges only when every one of these holds.
Any fact it could not read is a reason not to merge, and every reason goes
in the job summary.

- **Switch:** `AUTO_MERGE_CODE` is exactly `on`.
- **Pull request:** open, not a draft, from this repository, opened by the
  repository owner's login, aimed at the default branch, and GitHub's
  `mergeable` is `true` (null after 30 seconds of asking counts as no).
- **Paths (`classify` is `auto`):** nothing is
  - a money path: every line of `.claude/rules/money.md`'s `paths:`, read
    from the default branch. Parsing is strict: a line that is not one
    supported pattern (plain segments, `*` in a segment, `**` as a whole
    segment) makes the list unread, so nothing merges;
  - under `supabase/`;
  - a rail, by rule rather than by name:
    - every file at the repository root, except Markdown other than
      `CLAUDE.md` and `CLAUDE.local.md`, and except `eslint-suppressions.json`
      (judged by its totals, below). The root holds configuration, and the
      tools try other spellings first: ESLint 9.39 tries `eslint.config.js`
      before `.mjs`, and Next 16.4 tries `next.config.js` and `.mjs` before
      `.ts`;
    - every root dot-folder (`.github`, `.githooks`, `.claude` and the rest)
      except `.claude/PRD-*/**`;
    - a `CLAUDE.md`, `CLAUDE.local.md` or `.claude/` folder at any depth,
      inside a PRD folder included;
    - a `package.json`, `tsconfig*.json` or `eslint.config.*` in any folder;
    - `eslint-rules/**`, `scripts/checks.mjs`, `scripts/pr-risk.mjs` and its
      test, and `scripts/git-identity`;
  - sign-in, sessions, roles or permissions: `lib/auth`, `lib/supabase`,
    `lib/staff`, `lib/results/access.ts`, `lib/partner-backup-email.ts`,
    `app/api/partner/backup-email`, `app/auth`, `components/auth`,
    `app/*/account/login`, `app/*/settings/login`, `app/*/settings/users`,
    `app/api/admin`, `app/api/staff`, `app/api/partner/context`;
  - a path with a control character or line terminator in its name.
  
  Matching ignores case. A rename counts its old path too.
- **Lint baseline:** no rule's total in `eslint-suppressions.json` is
  higher at the head than at the merge base (a side with no file counts as
  zero).
- **Main has not moved under it:** no file this pull request changes (old
  names included) has changed on the default branch since the merge base,
  except `eslint-suppressions.json`. A compare list at the API's 300-file
  cap counts as unread. The remedy is to merge the default branch into the
  branch.
- **Checks:** `verify` ran and every run of it concluded `success`. Every
  other check run is completed, with `success`, `neutral` or `skipped`.
- **Vercel:** at least one commit status whose context starts with `Vercel`
  is `success`, and no status is in any other state. When this refuses, the
  summary lists every context it saw.
- **Review:** a comment by one of the verdict logins (`VERDICT_LOGINS`:
  `claude[bot]` or `github-actions[bot]`, to be narrowed to the one the
  first real review used) whose first line is exactly
  `Verdict: clean at <head sha> against <default branch>`, and no `findings`
  verdict for that head against any base. A verdict against another branch,
  or in the older form without `against`, does not count. All comments are
  read, paginated.
  - `claude-review.yml` also runs on `synchronize`, and on `edited` when the
    base changed, both only when the switch is on.
  - Its concurrency is at job level, and only a run that will review joins
    the shared group; every other run gets a group of its own, so a push
    with the switch off, or an unrelated label, cannot cancel a review in
    progress.
  - Its prompt names the head sha and the base branch, gives the verdict
    line, and says to post exactly one summary, last, after every inline
    comment.
  - Without `ANTHROPIC_API_KEY` there is no verdict, so nothing merges.
- **Threads:** no review thread is unresolved (more than 100 threads counts
  as unread).
- **Latch:** the default branch's tip commit is authored by the owner's
  GitHub user. Vercel builds only commits authored by the owner, so if it is
  not, production may be behind the default branch. That also happens after
  the owner merges someone else's pull request by hand (a Dependabot one is
  authored `dependabot[bot]`). Nothing merges itself until a commit authored
  by the owner reaches the default branch, which any merge the owner makes
  by hand does.
- **Head:** the head read last is the head the facts describe, and the merge
  is pinned to it (`--match-head-commit`).
- **Main's tip, again:** the Merge step reads the default branch's tip
  immediately before `gh pr merge`. If it is not the tip the facts were read
  against (what main changed is compared up to that sha), there is no merge,
  and the summary says to run it again (`tipReason`).

After a merge, the workflow reads the merge commit back. If its author is not
the owner, the job fails and the workflow comments on the merged pull
request: production was not built from this commit, and what to do. That is
the one comment it ever posts. The latch above then holds every later merge.
