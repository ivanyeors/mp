# Slice 02 — Revoke public access to the body-photo table; delete the dead read endpoint

Type: AFK
Tracker: live verification split to #121 (parent #120)
Parent: PRD `guest-result-ownership` (`.claude/PRD-guest-result-ownership/guest-result-ownership-prd.md`)
Triage: done — migration applied to production 2026-09-10 via `supabase db push`; live anon-key verification carried into slice 10
User stories covered: 4–7

## What to build

The smallest diff in the initiative, and the one that closes the most. Everything else in this PRD
gates a route; this closes a door that does not go through a route at all.

**The hole.** `supabase/migrations/0024_mp_config_response_photos.sql` creates four row-level
security policies on `mp_config_response_photos` — select, insert, update and delete, each
`using (true)`. The September 2026 hardening pass
(`20260902000000_rls_hardening_and_hot_path_indexes.sql`) dropped exactly this set of policies for
`mp_config_responses`, `mp_maker_configs` and `mp_staff`, and skipped this table. Because
`NEXT_PUBLIC_SUPABASE_ANON_KEY` ships inside the browser bundle
(`lib/supabase/browser.ts`), anybody can list, alter or **delete** every customer's front and side
body photos straight through PostgREST. No route guard can close this, and slice 07 would be
security theatre without it.

**The migration.** New file under `supabase/migrations/`, mirroring the shape of the September
hardening migration rather than inventing one: drop the four named policies, then create a single
`for all to service_role using (true) with check (true)` policy. Leave row-level security enabled.
Nothing else in this repository reads the table from a browser client — every access is through
`supabaseAdmin()` in `app/api/mp-config/photos/route.ts` and the Telegram attachment block in
`app/api/mp-config/responses/route.ts` — so revoking the anon grants breaks nothing. **Confirm
that claim before applying**, because it is the only thing standing between this migration and a
broken photo upload.

**Applying it.** `supabase db push`. Never the MCP `apply_migration` tool: it stamps its own
version and desyncs the ledger from `supabase/migrations/`, and repairing that needs both a
`--status reverted` and a `--status applied` pass.

**The deletion.** `GET /api/mp-config/photos` has no callers anywhere in the repository — the only
fetch of that path is the `POST` in the configurator. Delete the handler rather than gate it. Its
`GetQuerySchema` goes with it. We secure code we keep.

**What stays.** The `POST` handler stays exactly as it is in this slice; slice 07 gates it. Doing
both here would entangle the migration with the ownership mechanism and cost this slice its
ability to ship on its own.

Demoable outcome: with the publishable key from the browser bundle, a `select` against
`mp_config_response_photos` returns no rows before the change and is refused after it — while the
configurator's photo upload keeps working and the Telegram notification keeps attaching photos.

## Acceptance criteria

- [x] A new migration in `supabase/migrations/` drops the four public policies on
      `mp_config_response_photos` and adds a service-role-only policy, mirroring
      `20260902000000_rls_hardening_and_hot_path_indexes.sql`.
- [x] Row-level security remains enabled on the table.
- [x] Verified before applying: no browser-side Supabase client anywhere in the repository reads or
      writes `mp_config_response_photos`.
- [x] Applied with `supabase db push`; the migration ledger and `supabase/migrations/` agree
      afterwards.
- [~] With the publishable key, `select` and `delete` against the table are refused.
      (Migration applied; the anon-key probe itself is a slice 10 step — run it as
      `curl "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/mp_config_response_photos?select=*&limit=1"`
      with `apikey`/`Authorization` set to the publishable key, and expect an empty
      array or a permission error rather than rows.)
- [~] The configurator photo upload still succeeds end to end after the migration.
      (Runtime check — slice 10.)
- [~] The Telegram notification still attaches front/side photos.
      (Runtime check — slice 10.)
- [x] `GET /api/mp-config/photos` and its query schema are deleted; the `POST` handler is unchanged.
- [x] A repository-wide search confirms nothing referenced that `GET`.
- [x] `pnpm ci` passes.
- [x] `./scripts/graphify update .` run and the refreshed graph committed alongside the code.

## Blocked by

- Slice 01 (glossary — the migration comment and the PRD refer to **Customisation session** photos)
