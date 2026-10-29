# mp — agent guide

## Project context

Read these before making design decisions:

- **`CONTEXT.md`** — the domain glossary. Non-negotiable: this codebase has precise
  meanings for Item, Sellable item, Composed sellable, Tier, Storefront product,
  Variant, Costings, MSRP, Result, Customisation session. Using the wrong term
  produces the wrong schema. Costings is the single source of sell price;
  storefront products are a projection of inventory.
- **`.claude/PRD-*/`** — one folder per initiative, each with a PRD and numbered
  `issues/`. Check for an existing PRD before designing new work.
- **`LLM.md`** — applies only to "sections-only" tasks (`agent/sections.md`).
- **`docs/adr/`** — architecture decision records.
- **`docs/data-flows/`** — how stock is recorded, added and sold through each
  purchase channel, and which Admin Panel pages change which tables. Read it
  before changing inventory, pricing or order code.

## Shopify is being replaced

This platform replaces Shopify; it does not run beside it (owner, 2026-10-21).
Design and build for this platform alone:

- **No new work depends on Shopify.** Nothing new integrates with it, syncs to
  it, reads from it live, falls back on it, or keeps compatibility with it.
  How Shopify or its apps do something is not a requirement here.
- **The only Shopify work is leaving it:** the one-time customer import and the
  cutover (ADR 0029). Analytics does not read the **Shopify order mirror**: it
  tracks this site's sales only, dated by Stripe (2026-10-29, ADR 0036). The
  mirror gains no features.
- **Shopify-era facts become this platform's data.** Settle them once, during
  the migration. Do not build a feature around Shopify to carry them.

## Show what you changed

After any change a person can see (a page, component, layout, style, chart,
copy or empty state), use the **preview** skill before you say the work is
done. It runs the real app on made-up sample data, signs in as an Owner, and
screenshots each page at desktop and phone width:

```bash
.claude/skills/preview/preview shoot /settings/orders /settings/inventory
```

Read every screenshot, fix what looks wrong, and send them to the user with
`SendUserFile`, saying the figures are sample data. A Stop hook sends you back
once if files that render pages changed since the last screenshots. Options,
how to add sample data, and what is real in the preview:
`.claude/skills/preview/SKILL.md`.

## Commit author

Every commit in this repository is authored as
`ivanyeors <ivanyeoart@gmail.com>`. Not a style preference — Vercel will not
build anything else.

**A login address is not a git identity.** `sg@mpillow.com` is a platform
login. It is not a committer, not a deploy identity, and never goes in
`user.email` — nor does any other address used to sign in to something. The two
are entirely separate and must not be mixed.

Vercel only builds a deployment whose **git commit author** is a member of the
team that owns `mp-inv`, and that team has one member: `ivanyeors`. A commit by
anyone else is not built and not failed. The deployment is created in state
`BLOCKED` with `buildingAt == ready == createdAt` and no build events, the pull
request shows no preview, and nothing in the repo, in CI, or on the Checks tab
says why. #198 lost its preview exactly this way — two agent sessions committed
under a login address, which GitHub resolved to a different account. Production
kept deploying throughout, because GitHub rewrites the author to `ivanyeors` on
squash-merge, which is why it took six days to notice.

Three things keep this true, and none of them is you remembering:

- **`scripts/git-identity`** pins the clone's `user.name` / `user.email`. The
  `SessionStart` hook in `.claude/settings.json` runs it, so an agent session is
  already correct before it can commit. Run it by hand once in a new clone, or
  on a machine where another tool writes its own identity:

  ```bash
  ./scripts/git-identity
  ```

- **`.githooks/pre-push`** refuses to push a commit Vercel would block, naming
  the commits and the fix. It is installed by the script above, via
  `core.hooksPath`. `--no-verify` bypasses it and costs you the preview.
- **`ALLOWED` in `.githooks/pre-push`** holds two addresses, both belonging to
  the one GitHub account `ivanyeors` — not two users. `ivanyeoart@gmail.com` is
  what we author as; GitHub's `47745593+ivanyeors@users.noreply.github.com` is
  there only because GitHub stamps it on every squash-merge to main, so merging
  main into a branch and pushing carries commits nobody here authored. Widen the
  list only when a new person actually joins the Vercel team — never to silence
  the hook, and never with a login address.

Authorship is not attribution: the `Co-Authored-By` trailer is what credits an
agent on a commit, and it is unaffected. The author field is what Vercel reads.

If a commit has already been made under the wrong identity, re-author it rather
than pushing and hoping:

```bash
./scripts/git-identity
git rebase --exec 'git commit --amend --no-edit --reset-author' origin/main
```

There is no second identity to fall back on, and adding a login address to the
Vercel team is not the workaround — keeping those accounts separate is the
point. The author is load-bearing.

## graphify knowledge graph

`graphify-out/` holds a committed graph of the code's **data and logic** (no
UI): the TypeScript in `app/`, `lib/` and `scripts/`, the docs, the
`supabase/migrations` schema, and a data layer recording which function writes
or reads which table, plus one node per page and endpoint URL. Use it to find
things fast; read the code before you change it.

```bash
./scripts/graphify explain "inventory_transactions"   # every writer and reader, with file:line
./scripts/graphify explain "/settings/costings"        # a page's actions, endpoints and tables
./scripts/graphify explain "deductInventoryForOrder"   # a function's callers, callees and tables
./scripts/graphify path "/shop/checkout" "inventory_transactions"
```

- Use `explain` and `path`: they return exact edges. `query "<prose>"` picks
  start nodes by matching words in the question and pulls in unrelated code.
  Use it only with a specific name, and never as the first step.
- When you grep for a table or a page URL, a hook adds its entry from
  `graphify-out/DATA_LAYER.md`. Its **"Written by"** list is every code path
  that changes the table. Check each one before changing a table's schema or
  the meaning of a column.
- `docs/data-flows/` explains the stock, purchase and pricing flows. Read it
  before changing inventory, order or Costings code.

**After changing code**, run `./scripts/graphify update .` (~50s, no tokens)
and commit `graphify-out/` in the same commit. CI fails the pull request when
the committed graph does not match the source. Never run a bare `graphify
update`. How it is built, the digest check and community labels are covered in
`docs/graphify.md`.
