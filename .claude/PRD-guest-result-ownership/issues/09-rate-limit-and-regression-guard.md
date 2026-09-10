# Slice 09 — Rate limit the open create path; structural guard against regressions

Type: AFK
Parent: PRD `guest-result-ownership` (`.claude/PRD-guest-result-ownership/guest-result-ownership-prd.md`)
Triage: needs-triage
User stories covered: 29–33

## What to build

Two pieces of hardening around the one door that has to stay open, and one test that stops this
class of mistake coming back.

**Why a door stays open.** Creating a **Draft Result** cannot require a credential: there is no row
to own yet, and the configurator must save from the first keystroke. Once slices 03 and 06 land,
this is the only unauthenticated write left in the family, so it is worth narrowing.

**The limiter.** Lift the in-memory per-IP limiter from `app/api/support/contact/route.ts` — the
only rate limiter in the repository — into `lib/rate-limit.ts` as a small reusable function, and
apply it to `POST /api/mp-config/responses` **on the create path only**. Updates are already gated
by slice 06 and must not be throttled: the configurator autosaves on a debounce and a legitimate
session would trip a limit tuned for creates. Keep the house 429 shape. Key on the same header
chain the contact route uses.

**Name the ceiling honestly.** The store is per-instance, so on a platform that runs several it
dampens rather than stops a determined flood. Say so in a `ponytail:` comment with the upgrade path
— shared storage — so the next reader does not mistake it for a guarantee. Refactoring the contact
route to use the extracted function is welcome; changing its limits is not.

**The structural test.** A test in the shape of `lib/auth/__tests__/settings-routes-guarded.test.ts`
— which walks route files and asserts guards are present — but **per HTTP verb rather than per
file**. That distinction is not academic: the leak in slice 08 was missed by a per-file scan
precisely because the file contained a guard on its other two handlers. Walk `app/api/mp-config/**`,
split each route module into its exported handlers, and fail on any handler with no recognised gate
(`requireAdmin`, `requireAnyAdmin`, `requireResultAccess`, `authorizeResultAccess`, or the
deliberate create-path exemption). The create path is the one allowed exception and must be listed
explicitly by name, so that exempting a second one is a visible diff rather than a silent drift.

**Considered and rejected.** Extending the walk to all of `app/api` — it would fail immediately on
routes that are legitimately public (catalogue reads, cart addressed by an httpOnly cookie) or
gated inside a helper the scan cannot see (the cron secret check, webhook signature verification).
Scoping it to this folder keeps it true and therefore keeps it enforced.

Demoable outcome: rapid repeated draft creations from one IP start returning 429; the configurator's
normal autosave never does; and adding an ungated handler under `app/api/mp-config/` fails the test
suite.

## Acceptance criteria

- [ ] `lib/rate-limit.ts` exists, lifted from `app/api/support/contact/route.ts`, and carries a
      `ponytail:` comment naming the per-instance ceiling and the upgrade path.
- [ ] The limiter applies to the create path of `POST /api/mp-config/responses` and **not** to the
      update path.
- [ ] Exceeding the limit returns 429 in the house error shape.
- [ ] A normal configurator session — first keystroke through save-without-purchasing — never trips
      the limit.
- [ ] The contact route keeps its existing behaviour and limits, whether or not it is refactored
      onto the shared function.
- [ ] A structural test walks `app/api/mp-config/**` per exported handler and fails on any handler
      with no recognised gate.
- [ ] The create-path exemption is listed by name in that test, not inferred.
- [ ] The test is proved to work: temporarily removing a guard makes it fail.
- [ ] Unit tests cover the limiter's window boundary (allowed at the limit, refused past it,
      allowed again after the window).
- [ ] `pnpm ci` passes.
- [ ] `./scripts/graphify update .` run and the refreshed graph committed alongside the code.

## Blocked by

- Slice 06 (the structural test asserts the gates that slice introduces)
- Slice 07 (same, for the photo route)
