# Slice 03 — Lock writes to Results that are no longer drafts

Type: AFK
Parent: PRD `guest-result-ownership` (`.claude/PRD-guest-result-ownership/guest-result-ownership-prd.md`)
Triage: needs-triage
User stories covered: 8–11

## What to build

The second tracer bullet: the majority of the route-side risk reduction, with no client change, no
token, and no migration. It ships and enforces on its own, before the token mechanism exists.

**The guard.** In `POST /api/mp-config/responses`, before the upsert: load the existing row's
`status`. If the row exists and its status is **not** null, the caller must be **Staff**
(`requireAnyAdmin(["results","orders"])`) or the request is refused with 403. If the row does not
exist, or is a **Draft Result**, the write proceeds as today. The route already loads the existing
row on the `isFinal` path — extend that load rather than adding a second round trip, and hoist it
so it runs for every write, not only finalisation.

**What it kills.** Rewriting the measurements of a **Result** whose pillow was already built and
paid for. Rewriting `location_id` on a live **Result** and corrupting origin attribution. And the
sharpest chain in the PRD: rewriting `customer_email` via `persistContact` on a `held` **Result**
so that the assign email — carrying that **Result**'s **Result access token** — is delivered to
the attacker instead of the customer.

**Why Staff bypass.** The **Admin Panel** writes to this endpoint on rows that are legitimately
`held`: "measured by" and **Location** edits from the Results list, and the send-to-Telegram
finalisation. Those are the job. Note that every admin role includes the `orders` permission, so
`requireAnyAdmin(["results","orders"])` admits **Staff assist mode** on the shared in-store device
as well as the Results and Orders operators.

**Considered and rejected.** Blocking on `is_final` instead of `status` — it is a Telegram fact,
not a lifecycle one, and the in-store finalisation path sets both at once. Blocking only
`captured` — it would leave the `customer_email` redirect on `held` rows wide open, which is the
worst of the three.

**The falsification that mattered.** The in-store review-only path (`shouldCreateInstoreReviewOnly`
→ `buildInstoreReviewOnlyPatch`) *writes* `status: 'held'` rather than requiring it, and is only
reachable from the `isFinal && !wasFinal` branch, which only **Staff** trigger. So it passes the
guard on both counts. The guest "save without purchasing" path sends `persistContact` on a row
whose status is still null, so it also passes. Re-verify both when implementing; they are the two
paths most likely to be broken by a careless read of this guard.

Demoable outcome: a `POST` carrying a `held` **Result**'s id is refused with 403 from a signed-out
browser, and succeeds from an **Admin Panel** session — while a fresh configurator session saves
its measurements exactly as before.

## Acceptance criteria

- [ ] `POST /api/mp-config/responses` loads the existing row's `status` for every write, not only
      on the `isFinal` path, and without adding a second database round trip.
- [ ] A non-**Staff** write to a row whose status is `held`, `assigned`, `captured`, `declined`,
      `expired` or `cancelled` is refused with 403.
- [ ] A non-**Staff** write to a **Draft Result**, or a create of a row that does not yet exist,
      succeeds.
- [ ] A **Staff** write succeeds regardless of the row's status.
- [ ] The guest "save without purchasing" flow (`persistContact`) still succeeds on a **Draft
      Result**.
- [ ] The in-store review-only finalisation still succeeds for **Staff** and still writes
      `status: 'held'`.
- [ ] The **Admin Panel** "measured by", **Location** and send-to-Telegram writes on `held` rows
      still succeed.
- [ ] Unit tests cover status null / `held` / `assigned` / `captured` crossed with **Staff** and
      non-**Staff**, using the stub harness from `lib/auth/__tests__/admin-guard.test.ts`.
- [ ] `pnpm ci` passes.
- [ ] `./scripts/graphify update .` run and the refreshed graph committed alongside the code.

## Blocked by

- Slice 01 (glossary — this guard is the definition of **Draft Result** expressed as code)
