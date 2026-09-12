# 02 — A Terminal Location per Location, and a reader list read live from Stripe

**Type:** AFK
**Blocked by:** 01
**User stories:** 12, 13, 14
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`, `area:checkout`

## Goal

Make a **Card reader** reachable from this codebase. Nothing charges yet; this
slice ends with the **Admin Panel** able to say *"Chai Chee: one reader, online"*
against a simulated reader, which is the precondition for every slice after it.

Additive and inert: a nullable column and one settings section. No existing
visitor, **Result** or **Order** changes behaviour.

## Scope

### Migration — one column

```sql
-- supabase/migrations/<ts>_terminal_location.sql
alter table partners
  add column if not exists stripe_terminal_location_id text;

comment on column partners.stripe_terminal_location_id is
  'Stripe terminal.Location id mirroring this Location (ADR 0017). Null = no Card reader registered here.';
```

Additive on `partners`, matching ADR 0012's rule that Location columns are added
to that table rather than split into a new one.

**Deliberately not added:** any reader id column. Decision (d) of ADR 0017 —
readers are enumerated from Stripe on demand. A `stripe_reader_id` column would go
stale the first time a reader is swapped, and nothing would notice until a
customer was standing at the counter.

### `lib/counter-payment/locations.ts`

- `ensureTerminalLocation(locationId)` — idempotent. Reads the **Location**'s
  `address` / `postal_code`, creates the Stripe `terminal.Location` if
  `stripe_terminal_location_id` is null, writes the id back, returns it. If the
  column is set but Stripe 404s the object (deleted in the Dashboard), null the
  column and recreate — the same `resource_missing`-narrowed recovery that
  `lib/stripe/sync.ts` uses for products, and narrowed the same way so an auth or
  rate-limit error cannot silently create a duplicate Location.
- `listReaders(terminalLocationId)` — `GET /v1/terminal/readers?location=…`,
  returning id, label, device type, status (`online` / `offline`) and last-seen.
- `registerReader({ registrationCode, locationId, label })` — pairs a physical
  reader by the code on its screen.
- Address validation before any Stripe call: `address` and `postal_code` must be
  non-empty and the country must be `SG`. A **Terminal Location** whose country
  does not match the account's cannot process payments, and Stripe's error for it
  is obscure enough to be worth pre-empting.

### `app/api/settings/terminal-readers/route.ts`

`GET` lists **Location**s with their **Terminal Location** id and live reader
list. `POST` registers a reader. Both gated `requireAdmin("inventory")` — hardware
provisioning is an owner-level act, and `results` is the wrong scope because it is
held by staff who work the queue but do not buy equipment.

A `POST ?simulated=true` branch creates Stripe's simulated reader, so the rest of
the initiative is buildable with no hardware. It must be visibly labelled as
simulated in the UI, or slice 08 will be signed off against a fake.

### UI — Settings → Locations, new "Card readers" section

Per **Location** card:

- **Not registered** → the address as it will be sent to Stripe, and a
  *Register this location with Stripe* button. If the address is incomplete, the
  button is disabled with *Add an address and postal code first* and a link to the
  fields — never a Stripe error surfaced raw.
- **Registered** → the **Terminal Location** id (monospace, copyable), and the
  reader list: label, device type, an online/offline dot, and last-seen as relative
  time. Empty list reads *No readers yet — pair one with its registration code*,
  not an empty table.
- *Pair a reader* reveals a registration-code input with the hint that the code is
  on the reader's own screen under Settings.
- A *Create a simulated reader* affordance, styled as a development aid and
  labelled **Simulated** wherever the reader appears.

Offline is not an error state here — readers sleep. Show it as a neutral dot with a
tooltip naming the last-seen time, and reserve red for the preflight in slice 05,
where it actually blocks something.

## Acceptance criteria

- [ ] Migration applied with `supabase db push` (never the MCP `apply_migration`
      tool, which stamps its own version and desyncs the ledger).
- [ ] `ensureTerminalLocation` is idempotent: called twice, one Stripe Location.
- [ ] A **Terminal Location** id that 404s at Stripe is recreated, and the
      recovery is narrowed to `resource_missing`.
- [ ] Incomplete or non-SG address refuses before any Stripe call, with a message
      naming the missing field.
- [ ] Reader list renders id, label, device type, status and last-seen for a
      simulated reader.
- [ ] A simulated reader is labelled **Simulated** everywhere it appears.
- [ ] Both endpoints 403 for a `results`-only admin and for `viewer`.
- [ ] `lib/counter-payment/locations.check.ts` asserts the idempotency and the
      address guard.
- [ ] No behaviour change to any existing **Location**, appointment or booking
      path — `partners` is read by the appointments calendar and the bookable
      locations selector, so a regression here is visible to customers.

## Notes

`getLocationRows` is wrapped in `unstable_cache` with tag `location-rows`
(`lib/locations/index.ts:75`). Writing `stripe_terminal_location_id` must
invalidate that tag or the settings screen shows a stale registration state.
