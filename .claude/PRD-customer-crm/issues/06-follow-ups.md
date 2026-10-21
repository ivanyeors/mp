# 06 — Follow-ups assigned to Staff profiles

**Issue:** [#283](https://github.com/ivanyeors/mp/issues/283) (parent #277)
**Type:** AFK
**Blocked by:** 03, 10
**User stories:** 7, 8
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`

## Goal

*"Call Mrs Tan on Friday about her second pillow"* is written down once, lands on the right
person's list, and does not get forgotten.

## Schema

```sql
create table customer_followups (
  id                     uuid primary key default gen_random_uuid(),
  customer_id            uuid not null references customers(id) on delete cascade,
  title                  text not null check (length(btrim(title)) between 1 and 200),
  due_on                 date not null,           -- a Singapore calendar date
  assigned_to_profile_id uuid not null references mp_staff(id),
  created_by_profile_id  uuid null references mp_staff(id) on delete set null,
  created_at             timestamptz not null default now(),
  done_at                timestamptz null,
  done_by_profile_id     uuid null references mp_staff(id) on delete set null
);
create index on customer_followups (assigned_to_profile_id, due_on) where done_at is null;
create index on customer_followups (customer_id, created_at desc);
```

- RLS is service-role only.
- **Assignment is to a Staff profile, never a Member** (ADR 0027 e). "Working as" decides whose
  *mine* list you see (`lib/staff/working-as.ts`). It is attribution, not authorisation.
- **An archived profile keeps its open follow-ups.** They show under *All* with an *Assignee
  archived* chip and a *Reassign* action. They are never silently dropped.

## Admin Panel

- **On the Customer detail, a Follow-ups card.** Open items come first, with title, due date,
  assignee and *Done*. It has a small form: title, due date (default tomorrow) and assignee
  (default the profile you are working as).
- **On the Customers page, a Follow-ups tab** (`?view=followups`):
  - **Mine**, **All** and **Overdue**, sorted by due date. Each row shows the Customer's name,
    the title, the due date and the assignee.
  - *All* shows everyone's follow-ups to every Staff member with `customers` (owner,
    2026-10-20).
- **Who may change them.** Creating, completing, reassigning and deleting need `customers-edit`
  (slice 10).
  - The assignee picker lists only profiles whose Member holds `customers-edit`, so a
    view-only colleague is never given one they cannot close.
  - Without `customers-edit`, the form and the *Done* buttons are not rendered.
- **A sidebar badge on Customers.** It counts what is due today or overdue for the current
  profile. It follows the Results badge (`components/settings/settings-sidebar-nav.tsx:259-270`),
  read from `GET /api/settings/customers/followup-counts`. With no working-as profile chosen,
  it shows nothing.
- **Elsewhere in the CRM:**
  - *Timeline* (slice 03) gets a follow-ups adapter: created, done.
  - *Overview* (slice 04) gets `open_followups`, plus a filter *has an open follow-up*.
- **Audit.** Create, done, reassign and delete each write `recordAdminAction`, with ids and no
  title text.

## Telegram

Follow-ups post nothing to Telegram of their own (owner, 2026-10-20). The sidebar badge is the
reminder. Slice 14's weekly summary counts follow-ups done and overdue, and this slice adds that
line.

## Acceptance criteria

- [x] A follow-up assigned to profile A appears in A's *Mine* and badge, and not in B's.
- [x] A view-only role sees every follow-up under *All*, cannot create or complete one, and its
      profiles are not in the assignee picker.
- [x] *Overdue* means `due_on` is before today in Singapore, tested across midnight SGT.
- [x] An archived assignee's open follow-ups stay visible and can be reassigned.
- [x] Follow-ups appear on the timeline.
- [ ] `./scripts/graphify update .` is run in the same commit. — _not yet: the integrator
      rebuilds the graph after merging._

## Build notes

**What was built.**

- **Table and rules.** `customer_followups` as specified. `lib/crm/followup-rules.ts` holds what
  the browser and the routes share: the input schemas, *open* / *overdue* / *due* against the
  Singapore day (`sgtToday`), the default due date (tomorrow, SGT), sorting and the badge's
  numbers. `lib/crm/followups.ts` holds the server reads and writes, and
  `listAssignableProfiles()`: live profiles whose Member is active and holds `customers-edit`.
- **Who is at the device.** `actingProfile(memberId)` in `lib/staff/working-as.ts`: the
  "Working as" profile, or the login's only profile. It is CRM 02's notes rule, moved there;
  `noteProfileFor` now calls it. It names who created and completed a follow-up, the form's
  default assignee, and whose *Mine* and badge it is.
- **Routes.**
  - `GET` and `POST /api/shop/customers/[id]/followups` list and create.
  - `PATCH` and `DELETE /api/shop/customers/[id]/followups/[followupId]` mark done (`{ done: true }`),
    reassign (`{ assignedToProfileId }`) and delete.
  - `GET /api/settings/customers/followups?scope=mine|all|overdue` feeds the tab.
  - `GET /api/settings/customers/followup-counts` feeds the badge.
  - Reads are on `customers`; every write is on `customers-edit`, and the guard test lists the
    three new write paths.
  - The server checks every assignee against `listAssignableProfiles()`.
  - Audit entries `customer_followup.create|done|reassign|delete` carry ids and the due date,
    never the title.
- **Admin Panel.**
  - The **Follow-ups card** on the Customer detail (`[id]/customer-followups-card.tsx`).
  - The **Follow-ups tab** at `?view=followups&scope=` (`followups-tab.tsx`, added to `views.ts`
    and `customers-page-tabs.tsx`).
  - Both share `followup-parts.tsx`: the due label, the *Assignee archived* chip, *Done*,
    *Reassign* and delete. These actions render only for `customers-edit`.
  - The **sidebar badge** on Customers (`settings-sidebar-nav.tsx`) is red when anything is
    overdue. It re-reads on each navigation, when "Working as" changes
    (`WORKING_AS_CHANGED_EVENT`, now dispatched by the picker), and after a follow-up changes
    (`FOLLOW_UPS_CHANGED_EVENT`).
  - The Customers list gains the *Has an open follow-up* filter (`?followups=open`) and an
    *N to follow up* marker beside the name.
- **Elsewhere in the CRM.**
  - Timeline: `sources/followups.ts`, group *Follow-ups*, with kinds `follow_up.added` (its
    pill reads *open* or *done*) and `follow_up.done`. The title is the detail.
  - Overview: `open_followups`, used by the filter.
  - Weekly summary: `countFollowUps` in `WEEKLY_SUMMARY_SOURCES` (counts only).
  - Privacy check: `customer_followups` added to `lib/shop/customer-privacy.check.ts`.

**Migrations.**

- `20261020132000_customer_followups.sql`: the table, its two indexes and a check that
  `done_by_profile_id` is set only once the follow-up is done. RLS is on with no policy, and
  all access is revoked from `anon` and `authenticated`.
- The `admin_customer_overview` redefinition with `open_followups` is in a file of its own in
  the shared-views range: a left join on a grouped count of open follow-ups, cast to `int`, so a
  Customer with none reads `0`.
- `supabase/tests/crm/assert-06-followups.sql` checks the constraints, the cascade, that an
  assignee profile cannot be deleted, the overview's count, the grants and that RLS is on. It
  runs with `psql -f` against a migrated database; it is not in CI.

**Tests.**

- `lib/crm/__tests__/followup-rules.test.ts`: the Singapore day, and overdue across midnight
  SGT.
- `app/api/shop/customers/__tests__/followups-routes.test.ts`: permissions, assignee rules,
  created-by and done-by attribution, reassigning an archived assignee, and audit entries with
  no title.
- `app/api/settings/customers/__tests__/followups-list-route.test.ts`: A's and B's *Mine* and
  badge, *All* for a view-only role, and *Overdue* at 23:59:59 and 00:00 SGT, with the clock
  pinned.
- `app/[lang]/settings/customers/__tests__/followups-render.test.tsx`: no controls without
  `customers-edit`.
- Extended:
  - the timeline route test (fixture follow-ups, every role's view);
  - the Telegram job test (the summary line, and no title in any post; its fake now treats a
    `NULL` comparison as SQL does);
  - the filter tests;
  - the guard test's found list.

**Deviations.**

- **The badge with no working-as profile chosen.** A login with exactly one profile counts
  that profile, as notes do. Such a login never sees the picker, so it never has a chosen
  profile. The badge and *Mine* show nothing only on a shared login where nobody has chosen,
  and *Mine* then asks who you are working as.
- **"Overdue" in the weekly summary** is counted as the summarised week closed: open at its end
  and due before that Monday. On the default Monday run that is today. On another summary day it
  still describes the same week, and a re-run reports it the same way.
- **The timeline's kinds** are `follow_up.added` and `follow_up.done`, not *created*, matching the
  other adapters' past-tense names.
- **No *Reopen*.** A follow-up marked done by mistake is added again. The slice names no undo,
  and `done_at` stays a fact.
- **Delete removes the row.** The slice's schema has no `deleted_at`; the audit entry keeps
  the ids.

**For ops or the owner:** nothing. No env vars, no new cron, and nothing posts to Telegram
except the weekly line.
