# 07 — Bombadil monthly, and auto-merge for code behind a switch

**Type:** AFK
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
