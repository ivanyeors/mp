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

This repo has a committed knowledge graph at `graphify-out/` — 16.7k nodes and
36.7k edges across TypeScript logic, docs, and the `supabase/migrations`
schema. It is a navigation index: use it to orient before searching, not as a
substitute for reading the code you are about to change.

The graph is for **data and logic, not UI**. `.graphifyignore` leaves out
`components/`, `hooks/` and every `.tsx` file. In their place,
`scripts/graphify-dataflow.py` adds a data layer graphify's AST pass cannot see:

- **code → table**: `writes_to` (insert/update/upsert/delete), `reads_from`
  (select) and `calls_rpc`, from every Supabase `.from("t")` / `.rpc("fn")`
  call, attributed to the enclosing function.
- **one node per page**, labelled with its URL (`/settings/inventory`,
  `/shop/checkout`), linked to the server actions (`uses_action`), data loaders
  (`loads`), endpoints (`requests`) and tables its component tree touches.
- **one node per route handler**, labelled with its URL (`/api/stripe/webhook`),
  `handled_by` its `GET()` / `POST()` functions.
- **foreign keys** (`references`) the SQL pass missed.

Always invoke through the wrapper, which resolves graphify from PATH or uvx and
no-ops silently when it is unavailable:

```bash
./scripts/graphify explain "inventory_transactions"                 # every function that reads/writes it
./scripts/graphify explain "/settings/costings"                     # what a page touches
./scripts/graphify path "/settings/inventory" "inventory_transactions"
./scripts/graphify query "how does costings set variant price"      # BFS subgraph for a question
```

Practical notes:

- For data questions, start from `explain "<table>"` or `explain "<page URL>"`
  and `path`. They return exact edges. `query` picks start nodes by matching
  words in the question, so common words pull in unrelated nodes. Name a table,
  a function or a URL instead of asking in prose.
- `query` truncates to a ~2000-token budget and tells you how many nodes it cut.
  Raise it with `--budget` or narrow the question rather than trusting a
  truncated answer.
- `path` searches directed edges by default; add `--undirected` when it reports
  no path.
- `graphify-out/DATA_LAYER.md` lists, for every table, the code that writes,
  reads and RPCs it and the pages that change it; and for every page, what it
  touches. It is ~170KB, so grep it (`grep -A20 '^### orders$'`) rather than
  reading it whole.
- `docs/data-flows/` explains how stock moves (stock in, purchases out,
  restocks) in prose and diagrams. Read it before changing inventory code.
- `graphify-out/GRAPH_REPORT.md` (~220KB) is for broad architecture review
  only. Prefer the commands above, which return a scoped subgraph.

### Keeping it current

After changing code, refresh the graph:

```bash
./scripts/graphify update .
```

This is AST-only — no API key, no token cost, ~50s for a full rebuild of all
2,200 files (plus a one-time dependency download on a machine that has never
run it). It is deterministic: the same code always produces a byte-identical
graph, so running it with no code changes produces no diff.
The `[sql]` extra is required for `supabase/migrations` to be parsed; the
wrapper requests it automatically.

The wrapper's `update` strips the data layer, runs graphify, then rebuilds the
data layer from the current source and regenerates `DATA_LAYER.md`. Never run
the bare `graphify update` or `uvx ... graphify update`: it leaves the data
layer stale and CI will fail.

Community names are written by an LLM pass and are not regenerated by `update`.
After a refactor that adds or removes whole subsystems, re-run:

```bash
./scripts/graphify label . --missing-only
```

`.graphifyignore` excludes `public/` binary assets, scratch files and UI code
from the index.

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
