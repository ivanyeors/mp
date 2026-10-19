# 05 — Saved Segments, shared by Staff, counted live

**Type:** AFK
**Blocked by:** 04
**User stories:** 6, 16
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:customers`, `area:admin`, `area:db`

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
  (ADR 0027 c).
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
- **Permissions and audit.** Everything sits behind `customers`. Create, update and archive
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

- [ ] A Segment and the same filters typed into the URL return identical Customers.
- [ ] A Segment saved with filters the schema no longer recognises shows *Needs review*, and
      returns no more Customers than before.
- [ ] Two Segments cannot share a live name. An archived name can be reused.
- [ ] `resolveSegment` over a 1,000-Customer fixture yields each id exactly once.
- [ ] `./scripts/graphify update .` is run in the same commit.
