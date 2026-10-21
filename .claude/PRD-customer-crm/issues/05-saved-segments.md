# 05 — Saved Segments, shared by Staff, counted live

**Issue:** [#282](https://github.com/ivanyeors/mp/issues/282) (parent #277)
**Type:** AFK
**Status:** built in `a031203` on `claude/shopify-migration-plan-izv7fo`
**Blocked by:** 04
**User stories:** 6, 16
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`

## Goal

A useful filter is saved once under a name, and every colleague sees it with a live count.
The same Segment later becomes an email-marketing audience with no rework (PRD part 5).

## Schema

```sql
create table customer_segments (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null check (length(btrim(name)) between 1 and 80),
  filters               jsonb not null,          -- slice 04's schema, as parsed values
  filters_version       int  not null default 1, -- bumped when the schema changes shape
  created_by_profile_id uuid null references mp_staff(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  archived_at           timestamptz null
);
create unique index customer_segments_live_name
  on customer_segments (lower(name)) where archived_at is null;
```

- RLS is service-role only. This is not `site_settings`, which anyone can read
  (ADR 0028 c).
- **Filters are checked on the way in and on the way out.** Saving parses them with slice
  04's schema and refuses anything it drops. Loading parses them again.
  - When the schema has since changed, so that a filter key no longer exists, the Segment shows
    *Needs review*, with the ignored filter named.
  - It is never silently widened to more Customers than it was saved for.

## Admin Panel

- **The Segments row.** A row of Segment chips sits above the Customers list. Each chip shows
  its name and a live count (`count: "exact", head: true` through `applyCustomerFilters`).
  Choosing one writes its filters into the URL, so a Segment is just a named link.
- **Save as Segment** appears when any filter is active.
- **Changing a Segment.**
  - With a Segment selected and the filters changed, *Update {name}* or *Save as new*.
  - *Rename* and *Archive* sit in the chip's menu.
- **Permissions and audit.** Using a Segment needs `customers`. Saving, updating and
  archiving one need `customers-edit` (slice 10). Create, update and archive
  each write `recordAdminAction` (`customer_segment.*`), with the name and filters but no
  Customer data.

## The hand-off function

`lib/crm/segments.ts` exports `resolveSegment(segmentId, { pageSize })`. It yields pages of
`customer_id`s through `applyCustomerFilters`, ordered by id so a long run is stable.

- **Nothing in the CRM calls it except its own test.** It exists for `PRD-email-marketing`,
  whose audience is `resolveSegment` narrowed by consent and suppression.
- **It is defined here** so the filters have one implementation, whichever initiative uses
  them.

## Acceptance criteria

- [x] A Segment and the same filters typed into the URL return identical Customers.
- [x] A Segment saved with filters the schema no longer recognises shows *Needs review*, and
      returns no more Customers than before.
- [x] Two Segments cannot share a live name. An archived name can be reused.
- [x] `resolveSegment` over a 1,000-Customer fixture yields each id exactly once.
- [x] `./scripts/graphify update .` is run in the same commit.

## Build notes

**What was built.**

- `lib/crm/segment-rules.ts` (shared with the browser): `SegmentNameSchema` (trimmed, 1–80),
  `SEGMENT_FILTERS_VERSION`, `segmentParams` (only `CUSTOMER_FILTER_KEYS`, as
  `customerFilterParams` writes them), `parseSegmentFilters` (the way in: refuses an unknown key,
  the sort or the page, a value the schema drops, a non-string, and a set that chooses every
  Customer, naming each refused `key=value`), `readSegmentFilters` (the way out: parses again,
  names each ignored filter, sets `needsReview`), `chosenSegmentFilters`, `sameSegmentFilters`
  and `segmentKey`.
- `lib/crm/segments.ts` (server): `listSegments` (live, by name, each with
  `count: "exact", head: true` through `applyCustomerFilters`), `createSegment`,
  `updateSegment` (rename or new filters), `archiveSegment`, `countCustomers`, and
  **`resolveSegment(segmentId, { pageSize, now })`**, an async generator of `customer_id`
  pages. It pages by keyset (`id > last`, ordered by id) so each id comes once even if
  Customers are added mid-run, counts *Last order* from one `now`, and stops on an empty page,
  not a short one, so a PostgREST `max_rows` below `pageSize` loses nobody. A Segment that needs
  review, an archived one, or a missing one throws `SegmentUnavailableError` (`reason`) before any
  id is read. Nothing in the CRM calls it except its test.
- `lib/crm/customer-filters.ts`: `applyCustomerFilters(q, f, { order: false })` applies the
  filters without the sort, for the count and for `resolveSegment`'s id order. `gt` accepts a
  string (the id cursor). Nothing else changed; the list's own calls are unchanged.
- Routes (`app/api/settings/customers/segments/`): `GET` (needs `customers`) lists them with
  counts; `POST` saves `{ name, filters }`; `PATCH [segmentId]` takes one change, `{ name }`,
  `{ filters }` (*Update {name}*, which clears *Needs review*) or `{ archived: true }`. Writes
  need `customers-edit`, answer 400 naming refused filters, and 409 for a live name in use.
  Audited as `customer_segment.create`, `.update`, `.rename` and `.archive`, with the name,
  the filters and `filters_version` before and after, never Customer data.
- Customers list: `segments-row.tsx` is the Segments row above the toolbar. Each chip is a link
  to the list with its filters (a plain click applies them in place; a modified click opens the
  link) and shows its live count, or *Needs review* with the ignored filters in its title.
  *Save as Segment* with a filter active; with a Segment chosen and its filters changed,
  *Update {name}* and *Save as new*; *Rename* and *Archive* (with a confirm) in each chip's
  menu. The changes show only for `customers-edit`. A chosen Segment that needs review says
  which filter was ignored and that it counts no Customers. `customers-client.tsx` holds the
  chosen Segment (a Segment's own link opens with it chosen; *Clear all* unchooses it), and
  choosing one puts exactly its filters on the list, keeping the sort. `page.tsx` reads the
  Segments with their counts on the server; on a failure the row fetches them.

**Migrations.**

- `20261020131000_customer_segments.sql`: the table as specified, plus `jsonb_typeof(filters) =
  'object'`, `filters_version >= 1`, the `set_updated_at()` trigger, and the partial unique index
  `customer_segments_live_name` on `lower(name) where archived_at is null`. RLS on with no
  policy; `revoke all` from anon and authenticated.
- No overview redefinition: Segments add no column to `admin_customer_overview`.
- DB check: all 178 migrations apply on Postgres 16 after the catch-up merge
  (`db-check.sh … mp_c05`). By hand in psql: a second live `premium, LAPSED` beside `Premium, lapsed` fails on the index; after archiving
  the first, the name is accepted; unarchiving it while the new one is live fails; a blank name,
  an 81-character name and an array for `filters` fail their checks; `updated_at` moves on
  update; `authenticated` and `anon` get *permission denied*, `service_role` reads it. CRM 04's
  `purchase-lines.check.ts` still passes against the same database after the `order` change.

**Tests.**

- `lib/crm/__tests__/segment-rules.test.ts`: saving keeps only Customer-choosing keys,
  normalised in the list's order; every refused shape is named; reading back equals the link's
  parse; an unknown key, an unknown value, another `filters_version` and a non-object each need
  review and are named; choosing; names; counts.
- `lib/crm/__tests__/segments.test.ts`: over a fake overview of 120 Customers varied on every
  filter, 13 filter sets (the PRD's list, Account/Source, Google, Mobile, voucher and
  follow-ups, Email consent, Bought + spend, Last order, tags and searches) are saved as Segments
  the way the row saves them.
  For each, `resolveSegment` returns exactly the ids that paging `listAdminCustomers` through
  the same URL returns, and the chip's count equals the list's total. A Segment that needs review
  has `count: null` and `resolveSegment` refuses it before reading, until it is updated. Names
  are unique among live Segments in any case, an archived name is reused, and an archived
  Segment is neither listed nor resolved. Over 1,000 Customers stored out of order, page sizes
  1, 7, 128, 500, 1000 and 5000 each yield all 1,000 ids once, in id order; a filtered Segment
  yields exactly its Customers; Customers added mid-run cause no repeat and skip none of the
  first.
- `app/api/settings/customers/__tests__/segments-routes.test.ts`: `customers` sees and counts;
  view-only gets 403 on every write and nothing changes; saving, refusing (named, nothing saved),
  409 on a live name, update, rename and archive, each audited with name and filters only.
- `app/[lang]/settings/customers/__tests__/segments-render.test.tsx`: chips, counts and links;
  *Needs review*; *Save as Segment*; a Segment's link opens chosen; *Update {name}* and *Save as
  new*; the review note; view-only sees no changes.
- `lib/crm/__tests__/customer-filters.test.ts`: `order: false` makes the same filter calls and
  no `order`.
- `lib/auth/__tests__/customers-write-guard.test.ts`: the two new write paths are listed.
- `lib/supabase/__tests__/fake-admin.ts` gained `range` (the exact count is of every match, as
  PostgREST counts), `overlaps`, `contains`, `not(…, "cs", …)`, and number-to-number
  comparison, so the list's real filters run in the fake.

**Deviations.**

- **`filters` holds the list's URL parameters, as strings** (`{"bought":"premium",
  "last_order":"over:12"}`), not the parsed values. This is CRM 04's hand-off: the schema reads
  strings, so a parsed value (`{ when, months }`) could not go back through it, and storing
  what the URL holds is what makes a Segment and its link one parse and one mapping.
- **The sort is not saved** (`CUSTOMER_FILTER_KEYS` only). Choosing a Segment keeps the list's
  sort; a Segment chooses Customers, not an order.
- ***Needs review* is never widened in the Segment's count or its resolve**: the count is
  null and `resolveSegment` throws. Choosing one still puts its recognised filters on the list,
  with a note saying the list shows its other filters, so Staff can review it and *Update* or
  *Archive* it. The list there shows what its URL says, as any link does.
- **Another `filters_version` needs review as a whole**, since no key of another shape can be
  trusted. Whoever bumps the version adds the upgrade to `readSegmentFilters`.
- **A Segment that chooses every Customer is refused.** *Save as Segment* only appears with a
  filter active, and an everyone audience is not something a Segment should become by accident.
- **Rename is audited as `customer_segment.rename`**, filters as `customer_segment.update`,
  so the Audit Log says which changed.

**Left for ops or the owner.** Nothing. The graph refresh is the integrator's.
