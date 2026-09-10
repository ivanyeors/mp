# Slice 05 — Configurator carries the token and starts a fresh session when refused

Type: AFK
Parent: PRD `guest-result-ownership` (`.claude/PRD-guest-result-ownership/guest-result-ownership-prd.md`)
Triage: done
User stories covered: 13–16

## What to build

The client half of the credential, and the slice that decides whether this PRD breaks customers.
Still additive — nothing enforces a token yet — but it must be live in production before slice 06
lands.

**Storage.** `app/[lang]/mp-config/mp-config-client.tsx` already mints a **Result** id into
`localStorage` on mount and stores it under a variant-scoped key from `sessionKeyFor`
(`lib/mp-config/flow-variant.ts`), which is why `/mp-config` and `/mp-basic` keep separate
sessions. Store the token the same way, under a key scoped by the same function. An unscoped token
key is a bug that only appears when someone visits both surfaces: the ids stay separate, the token
does not, and one of the two sessions silently stops matching.

**Transmission.** Send the token on every request that addresses an existing **Result**: in the
`POST` body alongside `id`, and as a `?token=` query parameter on the `GET`. Both shapes already
exist in the codebase — the sibling **Result** routes take the token in the body on `accept` and
`decline`, and in the query on the status read — so match them rather than inventing a header.

**The rotation fix, which is the load-bearing part.** The mount effect that asks "is my stored id
already finalised?" currently reads `if (!res.ok) return;` — any failure means *keep the id*. Once
slice 04's token exists and the hold rotates it, a returning guest's stored token is stale, that
read is refused, the id is kept, and after slice 06 every subsequent write is refused too. It
fails silently: the save indicator sticks on "error" and the customer sees no explanation.

Change it so a 401 or 403 rotates to a fresh id — the same rotation the effect already performs
when it finds `is_final` — clearing the stored token with it. That restores the invariant the
code's own comment claims ("start a fresh session id … prevents new measurements from overwriting
a released result") and fixes the concrete journey behind it: a customer who abandons Stripe
checkout returns to `/mp-config?hold_cancelled=1`, `hold-cancel-restore.ts` restores the now-`held`
id, and without this change that customer can never save again.

**The malformed-id bug, fixed while here.** The id fallback for browsers without
`crypto.randomUUID` produces a timestamp-and-random string, which the route's `z.string().uuid()`
rejects — so on those browsers every save has always failed with a 400 and the customer was told
nothing. Use a uuid-shaped fallback so the id is always valid.

**What stays.** Photo upload keeps sending only `responseId` in this slice; slice 07 gates it.

Demoable outcome: a fresh session stores an id and a token and saves with both; visiting
`/mp-basic` and then `/mp-config` leaves each surface's token intact; and a customer who places a
hold, cancels at Stripe and returns gets a new session id and a working autosave instead of a
stuck save indicator.

## Acceptance criteria

- [x] The token is stored in `localStorage` under a key scoped by `sessionKeyFor`, alongside the
      existing id key.
- [x] `POST /api/mp-config/responses` requests include the stored token; `GET` requests include it
      as `?token=`.
- [x] The token returned by a create is stored; a create that returns no token leaves the slot
      empty without erroring.
- [x] The mount check rotates to a fresh id and clears the stored token on a 401 or 403, instead of
      keeping the id.
- [x] The existing `is_final` rotation behaviour is unchanged.
- [~] Hold → cancel at Stripe → return to `/mp-config` produces a new session id and a successful
      autosave.
      (Code path verified by trace and unit test; the runtime pass is slice 10.)
- [~] Visiting `/mp-config` and `/mp-basic` in one browser leaves both sessions independently
      usable, ids and tokens both.
      (Code path verified by trace and unit test; the runtime pass is slice 10.)
- [x] The non-`crypto.randomUUID` fallback produces a uuid the route accepts.
- [x] Nothing yet rejects a request for lacking a token — this slice enforces nothing.
- [x] `pnpm ci` passes.
- [x] `./scripts/graphify update .` run and the refreshed graph committed alongside the code.

## Blocked by

- Slice 04 (the server must mint and return the token before the client can store one)
