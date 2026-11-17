# graphify: how the knowledge graph is built and kept current

`CLAUDE.md` says how to *use* the graph. This is how it works, for whoever
maintains it or debugs a failing freshness check.

## What is in it

`graphify-out/graph.json` is built in two passes, both deterministic and
token-free:

1. **graphify's AST pass** over TypeScript in `app/`, `lib/` and `scripts/`, the
   Markdown docs, and `supabase/migrations` (tables, views, functions,
   triggers, view dependencies). `.graphifyignore` leaves out `public/`
   binaries, scratch files and **all UI**: `components/`, `hooks/` and every
   `.tsx` file.
2. **The data layer**, `scripts/graphify-dataflow.py`, adds what the AST pass
   cannot see. Supabase calls are strings, so graphify links no code to a table.
   - `writes_to` / `reads_from` / `calls_rpc`: every `.from("t")` / `.rpc("fn")`
     call (including `cond ? "a" : "b"` and a const holding the name),
     attributed to the enclosing function. Test files (`__tests__/`, `.test`,
     `.spec`, `.check`, `.smoke`, `.fakes`, `smoke-*`) are skipped.
   - One node per page (`app/**/page.tsx`), labelled with its URL. It is linked
     to what its component tree touches: `uses_action` (server actions),
     `loads` (imported functions that reach the database), `requests`
     (endpoint URLs in the source), and direct table reads.
   - One node per route handler (`app/**/route.ts`), labelled with its URL and
     `handled_by` its `GET()` / `POST()`.
   - `references`: foreign keys the SQL pass missed.

   Everything it adds carries `_origin: "dataflow"`. It also writes
   `graphify-out/DATA_LAYER.md`, the same edges as a per-table and per-page
   index.

`scripts/graph-hint` is a PreToolUse hook on Bash and Grep. When a search names
a table or a page URL, it adds that entry from `DATA_LAYER.md` to the tool
call, once per name per session. Otherwise it prints nothing.

## Refreshing

```bash
./scripts/graphify update .
```

The wrapper's `update` does four things:

1. Clears `graphify-out/cache/`. An incremental run has skipped new and moved
   files while reporting a stable digest; CI rebuilds without a cache and
   would fail.
2. Strips the data layer, so graphify starts from exactly what it built last
   time.
3. Runs graphify (pinned in `scripts/graphify`, with the `[sql]` extra that
   `supabase/migrations` needs).
4. Re-adds the data layer from the current source and regenerates
   `DATA_LAYER.md`.

A full run takes ~50s. Never run a bare `graphify update` or
`uvx ... graphify update`: it skips steps 1, 2 and 4, so the data layer goes
stale and CI fails.

## The freshness check

`.github/workflows/graphify-freshness.yml` runs the same `./scripts/graphify
update .` when started by hand (Actions -> graphify freshness -> Run workflow).
It fails if the rebuilt graph's digest differs from the committed one. The
graph is refreshed on demand, not with every change. To check locally:

```bash
./scripts/graphify-digest.py graphify-out/graph.json   # before
./scripts/graphify update .
./scripts/graphify-digest.py graphify-out/graph.json   # must be unchanged
```

The digest covers node ids and edges only. Community assignment is reseeded by
whatever graph the rebuild started from and is not reproducible, so it is left
out deliberately. A mismatch always means the source really changed. The
pinned extractor version exists for the same reason: an unpinned graphify can
build a graph CI disagrees with.

## Community names

Names are written by an LLM pass that `update` does not re-run. After a
refactor that adds or removes whole subsystems:

```bash
./scripts/graphify label . --missing-only
```

## Staleness

`GRAPH_REPORT.md` records the commit it was built from. If that is not
`git rev-parse HEAD`, treat node locations as hints and confirm against the
file.
