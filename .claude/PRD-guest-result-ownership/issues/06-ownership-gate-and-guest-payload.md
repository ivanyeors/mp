# Slice 06 — Ownership gate on read and update, and a redacted payload for Owners

Type: AFK
Parent: PRD `guest-result-ownership` (`.claude/PRD-guest-result-ownership/guest-result-ownership-prd.md`)
Triage: needs-triage
User stories covered: 18–26

## What to build

The gate. This is the first slice that can refuse a real customer, which is why it is sixth and
not first — slices 04 and 05 must be live in production before this deploys.

**The check.** A new `requireResultAccess()` in `lib/results/access.ts`, sitting on top of the
existing `authorizeResultAccess` rather than replacing or duplicating it. It returns which audience
was recognised — `{ mode: "staff" }` or `{ mode: "owner" }` — or a `NextResponse` refusal, matching
the shape `requireAdmin` already uses so route bodies read the same as their neighbours. Order:
**Staff** first via `requireAnyAdmin(["results","orders"])`, then **Owner** via
`authorizeResultAccess`, then the legacy allowance, then 403. Returning the mode is not decoration
— the payload differs by audience, and deriving it twice is how the two would drift.

**The legacy allowance.** A row with a null `access_token` *and* a null `status` is a **Draft
Result** created before this initiative shipped. Allow it, and do not bind a token (slice 04
explains why). Everything else needs **Staff** or **Owner**. This branch is temporary and should
carry a comment saying so, with a pointer to the backfill follow-up.

**The redaction.** Ownership alone is not enough: `loadMpConfigResponseDetail` returns the
**Staff** view. Add a pure `toOwnerResultPayload()` that builds the guest shape from an explicit
allowlist — `{ ok, response: { id, data, is_final }, suggestion: { recommended, product } }` — and
nothing else. Build it as an allowlist, never as a delete-the-sensitive-keys pass: a column added
to the query later must be excluded by default rather than included by default. The guest clients
were traced exhaustively and read exactly those four things; `suggestion.bom` and
`suggestion.reasons` are read by no guest client and carry our bill of materials and the
rules-engine graph version.

**Where the redaction lives.** In the route, not in `lib/results/admin/response-detail.ts`. The
**Admin Panel** **Result** detail page is a server component that calls that loader *directly*,
not through the route, and needs the full payload including `suggestion.recommended.tier`.
Redacting inside the loader would break it.

**Wiring.** `GET /api/mp-config/responses/[id]`: **Staff** get today's payload byte for byte,
**Owner** gets `toOwnerResultPayload()`, anyone else gets 403. `POST /api/mp-config/responses`:
the update path additionally requires **Staff** or **Owner** — the create path stays open by
necessity, which is what slice 09 rate limits. Refusals are 403, matching the **Result** family;
the 404-for-enumeration-resistance convention used elsewhere buys nothing against random UUIDs.

**What stays.** The read-side write in the loader — persisting `recommendation_record` when it is
null — stays as it is. After this slice only **Staff** and **Owners** reach it.

Demoable outcome: a second browser holding only a **Result** id gets 403 on both the read and the
update; the real session gets its measurements and its recommended size back and nothing else; and
the **Admin Panel** **Result** detail page is unchanged.

## Acceptance criteria

- [ ] `requireResultAccess()` exists in `lib/results/access.ts`, delegates to the existing
      `authorizeResultAccess`, and returns `{ mode: "staff" | "owner" }` or a `NextResponse`.
- [ ] No second ownership checker is introduced anywhere.
- [ ] `GET /api/mp-config/responses/[id]` returns the current payload unchanged for **Staff**.
- [ ] The same route returns `toOwnerResultPayload()` for an **Owner** holding a valid token.
- [ ] The same route returns 403 for a caller with neither.
- [ ] The Owner payload contains no `customer_email`, `customer_phone`, `authorized_amount`,
      `final_amount`, `payment_intent_id`, `topup_payment_intent_id`, `order_id`, order data,
      `suggestion.bom` or `suggestion.reasons`.
- [ ] `toOwnerResultPayload()` is a pure allowlist: a unit test adds an unexpected field to the
      input and asserts it does not appear in the output.
- [ ] The update path of `POST /api/mp-config/responses` requires **Staff** or **Owner**; the
      create path remains open.
- [ ] A row with null `access_token` and null `status` is still accessible without a token, and no
      token is bound to it.
- [ ] The **Admin Panel** **Result** detail server-component page renders unchanged, including the
      assign preparation that reads `suggestion.recommended.tier`.
- [ ] The configurator's suggestion display and `/mp-maker` measurement load still work.
- [ ] Unit tests cover **Staff**, **Owner**, legacy-draft and stranger, using the stub harness from
      `lib/auth/__tests__/admin-guard.test.ts`.
- [ ] Route tests import the handlers directly and assert the guard short-circuits before any I/O,
      in the style of `app/api/appointments/book/__tests__/route.test.ts`.
- [ ] `pnpm ci` passes.
- [ ] `./scripts/graphify update .` run and the refreshed graph committed alongside the code.

## Blocked by

- Slice 03 (the status guard this gate composes with; landing them together would make a
  regression hard to attribute)
- Slice 05 (**must be live in production first** — deployed clients have to be sending a token
  before anything refuses a request for lacking one)
