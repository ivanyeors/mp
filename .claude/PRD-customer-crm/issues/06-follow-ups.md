# 06 — Follow-ups assigned to Staff profiles

**Type:** AFK
**Blocked by:** 03; owner decisions 3 and 4
**User stories:** 7, 8
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:customers`, `area:admin`, `area:db`

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
  - *All* follows owner decision 3. By default every Staff member with `customers` sees
    everything.
- **A sidebar badge on Customers.** It counts what is due today or overdue for the current
  profile. It follows the Results badge (`components/settings/settings-sidebar-nav.tsx:259-270`),
  read from `GET /api/settings/customers/followup-counts`. With no working-as profile chosen,
  it shows nothing.
- **Elsewhere in the CRM:**
  - *Timeline* (slice 03) gets a follow-ups adapter: created, done.
  - *Overview* (slice 04) gets `open_followups`, plus a filter *has an open follow-up*.
- **Audit.** Create, done, reassign and delete each write `recordAdminAction`, with ids and no
  title text.

## The morning digest

- **When.** It is chained onto `results-sla`, after its other jobs. There is no third cron
  (ADR 0027 g).
- **What it says.** It posts to the Staff Telegram group through `lib/telegram/notify.ts`:
  > Follow-ups today: Ivan 2 (1 overdue) · Mei 1 — {link to the Follow-ups tab}
- **No customer data.** No customer names, titles or details. The group is a shared chat
  (ADR 0027 e).
- **No double posts.** At most one post per Singapore date, guarded by a compare-and-set on a
  `crm_followup_digest_last_sent_on` site setting, so a manual re-run of the cron does not post
  twice.
- **A switch.** `crm_followup_digest_enabled` (owner decision 4; on by default).

## Acceptance criteria

- [ ] A follow-up assigned to profile A appears in A's *Mine* and badge, and not in B's.
- [ ] *Overdue* means `due_on` is before today in Singapore, tested across midnight SGT.
- [ ] An archived assignee's open follow-ups stay visible and can be reassigned.
- [ ] Running the digest twice on one date posts once. The post contains no customer name or
      title.
- [ ] Follow-ups appear on the timeline.
- [ ] `./scripts/graphify update .` is run in the same commit.
