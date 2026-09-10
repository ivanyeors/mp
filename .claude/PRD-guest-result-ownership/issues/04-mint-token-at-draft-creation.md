# Slice 04 — Mint the Result access token at draft creation

Type: AFK
Parent: PRD `guest-result-ownership` (`.claude/PRD-guest-result-ownership/guest-result-ownership-prd.md`)
Triage: needs-triage
User stories covered: 12, 17

## What to build

The slice that gives a guest something to prove ownership *with*. Purely additive — it mints and
returns a credential that nothing yet checks, which is exactly why it can ship ahead of the gate.

**The gap it closes.** `access_token` is minted in exactly one place today —
`app/api/results/hold/route.ts` — that is, at the **Authorization hold**, long after the
configurator has already saved and re-read the row several times. That is the structural reason
the **Result** id had to serve as the credential for everything before the hold. Minting at
creation removes that reason.

**The change.** In `POST /api/mp-config/responses`, when the upsert is a create (no existing row),
generate a `randomUUID()` and include `access_token` in the inserted row. Return it to the caller
as `accessToken` in the JSON response. On an update, do not touch the column: the token is minted
once, and the **Authorization hold** is the only thing that rotates it.

**No schema change.** The column, its partial unique index and its one-off backfill all landed in
`0045_result_customer_access.sql`. This slice is code only — nothing to `supabase db push`.

**Legacy drafts, and the trap in them.** Drafts that already exist have no token: the 0045 backfill
covered only rows with a non-null status. Those rows must keep working, and — deliberately — must
**not** have a token bound to them on their next write. Binding one would hand a credential to a
browser tab running pre-deploy JavaScript that cannot store it, and the tab's *next* write would
then be refused by slice 06. So: mint on create, never on update. The exposed population is finite
and shrinks as those drafts age out; a backfill closes it later, outside this PRD.

**What stays.** The hold route is untouched. It keeps generating a fresh token and overwriting the
column, which is the correct behaviour — after a hold the row is `held`, slice 03 already blocks
configurator writes to it, and the customer continues via the freshly emailed status link.
Rotation shortens the life of a leaked draft token. It is also precisely what makes slice 05
mandatory rather than cosmetic, so do not "fix" it here.

Demoable outcome: creating a draft from the configurator returns an `accessToken` in the POST
response and the row carries it; saving that same draft again returns the same token and does not
rotate it; a pre-existing token-less draft still saves and still has no token afterwards.

## Acceptance criteria

- [ ] A create through `POST /api/mp-config/responses` writes a `randomUUID()` into `access_token`
      and returns it as `accessToken` in the response body.
- [ ] An update through the same route leaves `access_token` untouched — including on a row where
      it is null.
- [ ] A pre-existing draft with a null `access_token` still saves successfully and still has a null
      token afterwards.
- [ ] `app/api/results/hold/route.ts` is unchanged and still rotates the token at hold.
- [ ] No migration is added; `0045_result_customer_access.sql` already provides the column, the
      partial unique index and the backfill.
- [ ] Nothing yet rejects a request for lacking a token — this slice enforces nothing.
- [ ] `pnpm ci` passes.
- [ ] `./scripts/graphify update .` run and the refreshed graph committed alongside the code.

## Blocked by

- Slice 01 (glossary — **Result access token** and its rotation rule)
