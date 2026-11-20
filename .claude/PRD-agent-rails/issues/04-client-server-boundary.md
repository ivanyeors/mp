# 04 — Client code cannot reach the service-role client

**Type:** AFK
**Blocked by:** none

## Goal

A `"use client"` file that imports, directly or through other modules, the
service-role Supabase client fails a check. Read first:
`../agent-rails-prd.md` (decision 6), `lib/supabase/server.ts`,
`scripts/checks.mjs`, and two or three existing `*.check.ts` files for the
style.

`lib/supabase/server.ts` exports `supabaseAdmin()`, which bypasses RLS. It
does not import `next/headers`, so the build does not refuse a client import
of it, and no module in the repo is marked server-only. The key itself is not
a `NEXT_PUBLIC_` variable, so it does not reach a browser bundle; what reaches
it is server code that then fails at run time, and a habit of mixing the two.

## Requirements

1. **A check** (`lib/supabase/client-boundary.check.ts`, run by `pnpm checks`
   with no live service) builds the import graph from every `"use client"`
   file under `app/`, `components/`, `lib/` and `hooks/`: static imports,
   re-exports and dynamic `import()`, through the `@/` alias and relative
   paths. Type-only imports do not count (they are erased). It fails, naming
   the shortest chain, when a client file reaches a server-only module.
2. **What is server-only.** `lib/supabase/server.ts` for certain. Measure the
   wider rule too: any module that reads a `process.env` name that is neither
   `NEXT_PUBLIC_*` nor `NODE_ENV`. If the wider rule's existing violations are
   few and real, enforce it; if they are many or noisy, enforce the
   service-role client only and report the wider number.
3. **Existing violations** are a list in the check that may only shrink: the
   check also fails when a listed chain no longer exists, so the list cannot
   go stale. The failure message says how to fix a new one: move the call
   behind a server action or route handler, or split the pure helper into its
   own module.

## Done when

- `pnpm checks lib/supabase/client-boundary.check.ts` passes.
- Shown with real output, on scratch edits you revert: a `"use client"` file
  importing `@/lib/supabase/server` fails; a client file importing a module
  that imports it fails and prints the chain; an `import type` from it passes.
- The reply gives the count of client files, how many reach a server-only
  module today under each rule, and how long the check takes.
