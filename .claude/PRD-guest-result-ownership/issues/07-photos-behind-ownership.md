# Slice 07 — Photo writes behind the same ownership rule

Type: AFK
Parent: PRD `guest-result-ownership` (`.claude/PRD-guest-result-ownership/guest-result-ownership-prd.md`)
Triage: done
User stories covered: 4, 27

## What to build

A small slice, because slice 02 already did the heavy lifting. What remains is the route.

**The gap.** `POST /api/mp-config/photos` takes a `responseId`, a view and a data URL, and upserts
a body photo. It never loads the parent **Result** and never checks anything. Anyone with a
**Result** id can overwrite a customer's front or side photograph — including planting an image
that is then pushed to the **Staff** Telegram group when the **Result** is finalised.

**The check.** Load the parent `mp_config_responses` row by `responseId`, selecting the three
fields `authorizeResultAccess` needs plus `status`, and apply `requireResultAccess()` from slice
06. Then apply slice 03's rule as well: a non-**Staff** caller may only write photos to a **Draft
Result**. Both conditions, not either — a photo is part of the submission, and a submission that
is already `held` is as final as its measurements.

**Reuse, do not re-derive.** Both the ownership check and the draft check already exist as
functions by the time this slice runs. If either is being re-implemented here, stop: the point of
the ordering is that this slice is a wiring job.

**The client.** The configurator's photo upload must send the token it stored in slice 05,
alongside the `responseId` it already sends.

**What is already gone.** The `GET` handler was deleted in slice 02 — it had no callers. Do not
resurrect it to "make the API symmetrical".

**What stays untouched.** The Telegram attachment block in `app/api/mp-config/responses/route.ts`
reads the photo rows through the service-role client and never goes near this route, so the build
team keeps receiving what it receives today. The reference-photo upload at `/api/config-uploads`
is a different feature on a different table and is already **Staff**-gated on all three verbs.

Demoable outcome: a stranger holding a **Result** id cannot replace that customer's body photo; the
customer's own session uploads exactly as before; and a photo write against an already-`held`
**Result** is refused even for its own Owner.

## Acceptance criteria

- [x] `POST /api/mp-config/photos` loads the parent **Result** and refuses with 403 when the caller
      is neither **Staff** nor the **Owner**.
- [x] A non-**Staff** caller may only write photos to a **Draft Result**; a write against a `held`,
      `assigned` or `captured` **Result** is refused.
- [x] **Staff** may write regardless of status, so **Staff assist mode** keeps working in store.
- [x] A `responseId` that matches no **Result** is refused rather than silently upserting an orphan
      row.
- [x] The check reuses `requireResultAccess()` and the slice 03 draft rule; neither is
      re-implemented.
- [~] The configurator photo upload sends the stored token and still succeeds end to end.
      (Code path verified by trace and unit test; the runtime pass is slice 10.)
- [~] The Telegram notification still attaches front/side photos.
      (Code path verified by trace and unit test; the runtime pass is slice 10.)
- [x] `GET /api/mp-config/photos` remains deleted.
- [x] `pnpm ci` passes.
- [x] `./scripts/graphify update .` run and the refreshed graph committed alongside the code.

## Blocked by

- Slice 02 (row-level security must be closed first, or this gate is theatre — the table is
  reachable without the route)
- Slice 06 (`requireResultAccess()` is defined there)
