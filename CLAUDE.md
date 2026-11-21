# mp — agent guide

This file holds only what the code can't tell you. For everything else, read the
code.

## Where decisions are written down

- **`CONTEXT.md`**: the domain glossary, about 200 KB. Read the section for the
  area you're changing rather than the whole file. Look a term up with
  `grep -n '^\*\*Sellable item' CONTEXT.md`. Its sections: Language (the core
  terms), Shopify customer migration, Google Form fittings, Rules Engine,
  Returns / RMA, Reviews, Customer CRM, Loyalty points, Email marketing,
  Customer messages, Shipping, Relationships, Configure, Partner portal,
  Marketing, Learn-more slide-in recipes, Flagged ambiguities.
  Terms are exact: Item, Sellable item, Composed sellable, Tier, Storefront
  product, Variant, Costings, MSRP, Result and Customisation session each mean
  one thing, and using the wrong one produces the wrong schema. Costings is the
  single source of sell price; storefront products are a projection of
  inventory.
- **`.claude/PRD-*/`**: one folder per initiative, each with a PRD and numbered
  `issues/`. Check for an existing PRD before designing new work.
- **`docs/adr/`**: architecture decision records.
- **`docs/data-flows/`**: how stock is recorded, added and sold through each
  purchase channel, and which Admin Panel pages change which tables. Read it
  before changing inventory, pricing or order code.
- **`docs/marketing-page/`**: the customer personas and copy rules
  (`persona.md`), page sections, layout and slide-ins, and the slide-in section
  catalog. Read it before writing storefront copy or marketing sections.
- **`docs/known-issues.md`**: confirmed defects deliberately left unfixed.

## Shopify is being replaced

This platform replaces Shopify; it does not run beside it (owner, 2026-10-21).
Design and build for this platform alone:

- No new work depends on Shopify. Nothing new integrates with it, syncs to it,
  reads from it live, falls back on it, or keeps compatibility with it. How
  Shopify or its apps do something is not a requirement here.
- The only Shopify work is leaving it: the one-time customer import and the
  cutover (ADR 0029). Analytics does not read the Shopify order mirror: it
  tracks this site's sales only, dated by Stripe (2026-10-29, ADR 0036). The
  mirror gains no features.
- Shopify-era facts become this platform's data. Settle them once, during the
  migration, rather than building a feature around Shopify to carry them.

## Brand

The brand is Mpillow, never "Money Pillow". The products are Mpillow Basic,
Mpillow Premium and Mbolster. `mp` is code shorthand only.

## How code is written here

Pick the simplest thing that works: no abstraction, dependency or boilerplate
nobody asked for, and deletion over addition. A deliberate shortcut gets a
`ponytail:` comment naming its ceiling and the upgrade path. That simplicity
never extends to validation at trust boundaries, error handling that prevents
data loss, security or accessibility.

Lint holds these rules, since a rule in prose is one an agent can miss. Product
code has no comments but that `ponytail:` one (a reason goes in a name, a type
or a test), no React effects outside `hooks/` and `components/ui/`, and no
Shopify import outside Shopify's own folders. No rule is a warning and inline
`eslint-disable` does nothing. What already broke a rule is counted in
`eslint-suppressions.json`, which only goes down and which Claude cannot add to.

**A correction becomes a check**: when the owner or a reviewer corrects an
agent, the fix lands as a lint rule, test, check or hook in the same pull
request. A new line in this file is the last resort.

## Done means checked

Before starting, say what done looks like and split the work into tasks that
each have a pass/fail check. Pick a check that fails the plausible wrong
version, not only one that passes the right one. Show the actual output (a test
run, a screenshot) because nobody watched it run.

- Non-trivial logic leaves one runnable check behind: a `*.test.ts` (vitest) or
  a `*.check.ts` (an assert script; `pnpm checks` runs them all, or the ones
  you name).
- Hooks in `.claude/settings.json` run the checks for you: eslint on each file
  you edit, the related tests and checks when you complete a task, and again
  when you stop. A failure sends you back to fix it. A cloud session installs
  its own dependencies at start; a check that cannot run says so, never passes.
- After any change a person can see (a page, component, layout, style, chart,
  copy or empty state), use the **preview** skill. It runs the real app on
  made-up sample data, signs in as an Owner, and screenshots each page at
  desktop and phone width:

  ```bash
  .claude/skills/preview/preview shoot /settings/orders /settings/inventory
  ```

  Read every screenshot, fix what looks wrong, and send them to the user with
  `SendUserFile`, saying the figures are sample data. `preview map <words>`
  finds a page by the name a person uses and prints its route. Details:
  `.claude/skills/preview/SKILL.md`.

## Pull requests and review

Fill in `.github/pull_request_template.md`. Every pull request gets an
automatic Claude review from a fresh session
(`.github/workflows/claude-review.yml`) on top of CI. A cloud session that
opens a pull request watches it, so failing checks and review comments come
back to it to fix. How much the owner reviews depends on risk:

- **Docs and copy only** (Markdown other than `CLAUDE.md`, `docs/`,
  `.claude/PRD-*`, UI copy and translation strings): may auto-merge once
  checks pass.
- **Everything else**: the owner reviews before merge, unless the owner has set
  the repository variable `AUTO_MERGE_CODE` to `on`: then it merges itself once
  checks pass and Claude review is clean for its head. Money, `supabase/`,
  sign-in, the rails and a grown lint baseline still wait for the owner: the
  exact list is `ownerReasons` in `scripts/pr-risk.mjs`.
- **Payments and money** (Stripe, PayNow, checkout, refunds, payment links,
  their webhooks, Costings and prices; the paths in `.claude/rules/money.md`):
  also gets a second, independent check before the owner merges. Run the
  `reviewer` subagent on the diff and record its verdict in the pull request.

## Merging to main does not go live

Vercel builds every merge to `main` as a production deployment but leaves it
**staged**: "Auto-assign Custom Production Domains" is off on the `mp-inv`
project (owner, 2026-11-20). mpillow.com keeps serving the previous build until
the staged one is promoted (Vercel dashboard, Deployments, Promote). The staged
build runs on production environment variables, so it reads the live database
and live Stripe. **stage.mpillow.com** shows the newest staged build
(`.github/workflows/stage-alias.yml` moves it after each build) and, like the
build's own URL, needs a Vercel sign-in. Never add stage.mpillow.com under the
project's Domains: that makes it public. Say "staged", not "live", after a
merge, and promote only when the owner asks.

## Large work: one orchestrator

For a whole PRD, run `/orchestrate .claude/PRD-<name>` in a session on Fable.
It hands each slice to a `worker` subagent (Opus 5.5, its own worktree),
checks what comes back with the `reviewer` subagent and the slice's checks,
and sends back anything not done. Path-specific rules live in `.claude/rules/`
and load only when you touch those files.

## Safety rails

`.claude/settings.json` denies reading secrets (`.env` files, `.secrets/`,
`~/.ssh`), and `.claude/hooks/guard.mjs` blocks what can't be undone:
discarding uncommitted work, force pushes, pushing to `main`, skipping git
hooks, SQL that drops or empties tables, the customer migration send, live
Stripe runs and WhatsApp sends. When something is blocked, tell the user what
you meant to do rather than finding another route to it.

## Commit author

Commits are authored as `ivanyeors <ivanyeoart@gmail.com>`, the only identity
Vercel builds; any other author gets no preview and no error. A login address
such as `sg@mpillow.com` is never a git identity. The SessionStart hook runs
`scripts/git-identity` to set this, and `.githooks/pre-push` refuses a wrong
author (its comments explain the history). In a cloud session the same script
leaves the committer as the session's own signing identity
(`noreply@anthropic.com`), so the commit is Verified on GitHub: author is ours,
committer is the signer, and that is correct. If the push is refused,
re-author:

```bash
./scripts/git-identity
git rebase --exec 'git commit --amend --no-edit --reset-author' origin/main
```

## graphify knowledge graph

`graphify-out/` holds a committed graph of the code's data and logic (no UI):
the TypeScript in `app/`, `lib/` and `scripts/`, the docs, the
`supabase/migrations` schema, and a data layer recording which function writes
or reads which table, plus one node per page and endpoint URL. Use it to find
things fast; read the code before you change it.

```bash
./scripts/graphify explain "inventory_transactions"   # every writer and reader, with file:line
./scripts/graphify explain "/settings/costings"        # a page's actions, endpoints and tables
./scripts/graphify explain "deductInventoryForOrder"   # a function's callers, callees and tables
./scripts/graphify path "/shop/checkout" "inventory_transactions"
```

- `explain` and `path` return exact edges. `query "<prose>"` matches words in
  the question and pulls in unrelated code, so use it only with a specific
  name.
- `graphify-out/DATA_LAYER.md` lists, per table, every code path that writes
  it ("Written by"). Check each one before changing a table's schema or the
  meaning of a column.

The graph is refreshed only when the user asks, so it may lag the code: treat
its file:line as a hint and confirm in the source. Don't run
`./scripts/graphify update .`, a bare `graphify update`, or commit
`graphify-out/` unless asked. How it is built: `docs/graphify.md`.
