# 07 — Care reminder: "your free re-adjustment is available until {date}"

**Type:** AFK
**Blocked by:** 01; owner decision 1 for the default timing
**User stories:** 11, 12, 13, 14, 15
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:customers`, `area:email`, `area:readjustment`

## Goal

Every Premium Mpillow owner hears once, at the right time, that a free re-adjustment is
waiting. The email takes them straight to booking. Nobody who has already booked, has switched
reminders off, or has not received the pillow yet gets it.

## Who gets it, decided by the existing rule

The daily job runs chained onto `results-sla` (ADR 0027 g).

1. **Candidates.** Counted **Orders** with `paid_at` within the last
   `readjustment_free_window_days` days and `delivered_at` set. The window comes from
   `lib/pricing/service-prices.ts`, never a constant.
2. **Decide with the existing rule.** For each candidate's **Customer**, call
   `loadReadjustmentContext` and `evaluateReadjustment` (`lib/readjustment/purchases.ts`,
   `eligibility.ts:69-97`). Never restate 60 days or "Premium only" (ADR 0027 f).
   - An Order qualifies when at least one of its lines quotes **complimentary**.
   - Booked, attended and no-show seqs already count as used (`purchases.ts:33`), so anyone
     who has booked is excluded automatically.
3. **Timing.** Send on the first run where all of the following hold, in Singapore calendar
   days:
   - `today ≥ freeUntil − care_reminder_days_before` (default 14);
   - `today ≥ delivered_date + care_reminder_settle_days` (default 3);
   - `today < freeUntil`.

   A pillow delivered late in its window still gets its reminder after settling, so long as
   at least one day remains.
4. **Exclusions.** These are counted, never emailed:
   - `care_reminders_email = false`;
   - no email on the Order;
   - `delivered_at` null (*not marked delivered*);
   - the window already passed.

## Schema and settings

```sql
alter table customers
  add column care_reminders_email boolean not null default true;
grant select (care_reminders_email) on public.customers to authenticated;  -- slice 02's grants
```

These are `site_settings` keys, following the re-adjustment policy keys:

- `care_reminders_enabled` (default **false**);
- `care_reminder_days_before` (14);
- `care_reminder_settle_days` (3).

## Sending

- **Ledger.** `order_emails` with template `care.free_readjustment`, claimed before sending. Its
  `unique(order_id, template)` (`0035_order_emails.sql`) means one reminder per Order, ever.
  The claim follows `lib/email/index.ts:159-216`. There is no new ledger.
- **Transport.** The transactional transport (`getDefaultTransport()`), because this is a
  service message (ADR 0027 f). It is never the campaign transport.
- **Template.** `lib/email/care.ts`, registered in `lib/email/registry.ts` as
  `care.free_readjustment` (audience `customer`) and previewable like the rest. Pure render.
  - **Content:** the product (*"your Premium Mpillow, order #…"*), the date the free visit runs
    to, one button, and a line on what a re-adjustment is.
  - **No offer.**
  - **Footer:** *"You're getting this because you bought a Premium Mpillow. Turn off care
    reminders in your Profile."*
- **Link.** `/appointments?type=readjustment&item=<order_item_id>`, plus
  `utm_source=care_reminder`. The page already sends a signed-out visitor through Sign in and
  back (`app/[lang]/appointments/page.tsx:49-56`).
- **Outside production**, send only to allowlisted addresses, following the WhatsApp
  reminder's non-production allowlist (`whatsapp-appointment-confirm-prd.md:58,75`).

## Customer and Admin Panel

- **Profile.** A *Care reminders* toggle on `/account` writes `care_reminders_email` through a
  server action under the customer's own session.
- **The Care reminders card on the Customers page** (behind `customers`):
  - the three settings;
  - sent in the last 30 days;
  - *booked after a reminder*: a booking for the same `order_item_id` created after the
    reminder was sent;
  - skipped, by reason.

  *Skipped: not marked delivered* doubles as an operations signal: orders nobody has closed.
- **The timeline** shows the reminder through slice 03's order-emails adapter, with no new work.

## Acceptance criteria

- [ ] vitest covers the timing rule as a pure function: early, on time, late delivery,
      undelivered, window passed, and across midnight SGT.
- [ ] A Customer with a booked free visit, a Basic Mpillow, an Mbolster, or the toggle off is
      never emailed, on fixtures run end to end.
- [ ] Running the job twice in a day sends once, through the `order_emails` unique key.
- [ ] With `care_reminders_enabled = false`, the job selects candidates and reports them, and
      sends nothing.
- [ ] The Profile toggle round-trips under the customer's own session, which slice 02's column
      grant allows.
- [ ] `./scripts/graphify update .` is run in the same commit.
