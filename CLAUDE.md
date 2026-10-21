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

## Shopify is being replaced

This platform replaces Shopify; it does not run beside it (owner, 2026-10-21).
Design and build for this platform alone:

- **No new work depends on Shopify.** Nothing new integrates with it, syncs to
  it, reads from it live, falls back on it, or keeps compatibility with it.
  How Shopify or its apps do something is not a requirement here.
- **The only Shopify work is leaving it:** the one-time customer import and the
  cutover (ADR 0029). The **Shopify order mirror** stays the read-only Analytics
  input it already is (`CONTEXT.md`) and gains no features.
- **Shopify-era facts become this platform's data.** Settle them once, during
  the migration. Do not build a feature around Shopify to carry them.

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

This repo has a committed knowledge graph at `graphify-out/` — 9.5k nodes and
20.8k edges across TypeScript, React, docs, and the `supabase/migrations`
schema. It is a navigation index: use it to orient before searching, not as a
substitute for reading the code you are about to change.

Always invoke through the wrapper, which resolves graphify from PATH or uvx and
no-ops silently when it is unavailable:

```bash
./scripts/graphify query "how does costings set variant price"   # BFS subgraph for a question
./scripts/graphify explain "cart_items"                          # one node + its neighbours
./scripts/graphify path "A" "B"                                  # shortest path between two nodes
```

Practical notes:

- `query` truncates to a ~2000-token budget and tells you how many nodes it cut.
  Raise it with `--budget` or narrow the question rather than trusting a
  truncated answer.
- `path` searches directed edges by default; add `--undirected` when it reports
  no path.
- `explain` is the fastest way to see a DB table's foreign keys, since the
  migrations are indexed (`explain "product_variants"`).
- `graphify-out/GRAPH_REPORT.md` is for broad architecture review only. Prefer
  the three commands above — they return a scoped subgraph instead of a 35KB file.

### Keeping it current

After changing code, refresh the graph:

```bash
./scripts/graphify update .
```

This is AST-only — no API key, no token cost, ~25s for a full rebuild of all
1,600 files (plus a one-time dependency download on a machine that has never
run it). It is deterministic: the same code always produces a byte-identical
graph, so running it with no code changes produces no diff.
The `[sql]` extra is required for `supabase/migrations` to be parsed; the
wrapper requests it automatically.

Community names are written by an LLM pass and are not regenerated by `update`.
After a refactor that adds or removes whole subsystems, re-run:

```bash
./scripts/graphify label . --missing-only
```

`.graphifyignore` excludes `public/` binary assets and scratch files from the index.

CI enforces this. `.github/workflows/graphify-freshness.yml` rebuilds the graph
on every pull request and fails if the committed one does not match the source,
so a refresh belongs in the same commit as the code change. To check locally
before pushing:

```bash
./scripts/graphify-digest.py graphify-out/graph.json   # before
./scripts/graphify update .
./scripts/graphify-digest.py graphify-out/graph.json   # must be unchanged
```

**Delete the local cache first.** `graphify-out/cache/` (gitignored) makes
`update` re-extract only what it thinks changed, and it has been seen to skip
new and moved code entirely while reporting a stable digest — CI rebuilds from
a fresh checkout with no cache and fails the PR. Before the digest check, run:

```bash
rm -rf graphify-out/cache && ./scripts/graphify update .
```

The digest covers nodes and edges only. Community assignment is reseeded by
whatever graph the rebuild started from and is not reproducible, so it is
excluded deliberately — a digest mismatch always means the source really
changed. `scripts/graphify` pins the extractor version for the same reason;
running an unpinned graphify locally can produce a graph CI disagrees with.

A stale graph is worse than none: `GRAPH_REPORT.md` records the commit it was
built from. If that does not match `git rev-parse HEAD`, treat node locations as
hints and confirm against the file before relying on them.
