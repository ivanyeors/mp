# 08 — Check-up reminder: the yearly "time for a re-adjustment" for Premium Mpillow, which says it is paid

**Issue:** [#285](https://github.com/ivanyeors/mp/issues/285) (parent #277)
**Type:** AFK
**Status:** built in `8ba8de7` on `claude/shopify-migration-plan-izv7fo`
**Blocked by:** 07, 13; migration slice 07 (Marketing consent)
**User stories:** 24
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:storefront`, `area:email`, `area:admin`

## Decided

The owner decided on 2026-10-20:

- **A service message.** It is built here, as an **Aftercare message** under the same rules as
  slice 07's review request. It does not move to `PRD-email-marketing`.
- **Yearly.** 12 months after delivery.
- **It says plainly that the visit is paid.**
- **Both channels:** email and WhatsApp (slice 13), each honouring its own switch.
- **Premium Mpillow only.** Basic Mpillow and Mbolster owners get no check-up.

What keeps it an Aftercare message, and must stay true:

- it is about a product the customer owns;
- it carries no discount and no other product;
- it honours the `aftercare_email` and `aftercare_whatsapp` switches;
- it goes at most once per milestone per Order.

If the copy ever needs an offer, it belongs to email marketing.

## Consent: what the research changed (2026-10-20)

Research on Singapore law and Meta's rules says a reminder that offers a **paid** visit is
marketing, whatever we call it:

- **PDPA.** Offering a paid service is direct marketing. The PDPC says direct marketing needs
  **express consent**: deemed consent by notification and the legitimate-interests exception
  cannot be used for it. The "ongoing relationship" exclusion does not cover a one-off purchase.
- **Do Not Call.** The WhatsApp check-up is a "specified message". It needs clear, evidenced
  consent that names it, or a check against the Do Not Call register.
- **Meta** decides the WhatsApp template's category. It is submitted as Utility (owner,
  2026-10-20) and may come back as Marketing (slice 13). That changes the price per message, not
  who may receive it: consent is the PDPA question above.

So the check-up is still built here as the owner decided, but it goes **only to customers who
agreed**:

- **Email:** `aftercare_email` is on **and** **Marketing consent** is `subscribed` (migration
  slice 07). That consent comes from the Shopify export's "accepts marketing" or the Profile's
  *"Email me news and offers"*.
- **WhatsApp:** `aftercare_whatsapp` is on. Its opt-in wording already names the paid check-up
  (slice 13).

This is the one Aftercare rule that reads `marketing_email` (README, second hazard).

**The owner's call, with counsel.** If counsel advises that a customer who bought a Premium
Mpillow may be reminded by email without marketing consent, drop the `marketing_email`
condition. It is one line in the candidate query and its test. Until then the safe rule stands.

## Goal

A year after delivery, a Premium Mpillow owner hears that a re-adjustment keeps the pillow
fitting them, **and that it is a paid visit, at a stated price**. There are no surprises at
booking.

## The price, stated, from one source

The fee is read at send time from Costings, which is the single source of sell price:
`loadServicePrices(admin).readjustment.msrp` (`lib/pricing/service-prices.ts:58`; seeded at
S$30, `20261013100000_service_prices.sql:29`). It is never a constant in the template.

- **Email:** *"A re-adjustment is a paid visit: S${fee}, paid when you book."*
- **WhatsApp:** the fee is the fourth body parameter of `aftercare_checkup` (slice 13), formatted
  as `S$30`, never written into the template.
- **If the fee cannot be read, nothing is sent that day.** A check-up that does not say what it
  costs is not sent.

The email uses slice 07's footer, including *"…or reply to this email and we'll do it for
you"*. Because it goes only to customers who agreed, it is not unsolicited, so the Spam
Control Act's `<ADV>` subject label does not apply.

The email links to the Services page and to booking at
`/appointments?type=readjustment&item=<order_item_id>`. That page sends a signed-out visitor
through Sign in and back (`app/[lang]/appointments/page.tsx:49-56`), and charges the same fee
through the paid re-adjustment flow.

## Who gets it

This reuses slice 07's machinery: the same daily job, chained onto `results-sla`, and slice
13's channel decision.

- **Ledgers:**
  - email in `customer_emails` (slice 07), template `aftercare.checkup_<months>m`,
    `entity_id = order_id`, so each milestone sends once per Order. A failed send is retried up
    to 3 attempts. `order_emails` is not used: its failed rows are final, and
    `dispatchOrderEmail` takes only the eight order templates (`lib/email/types.ts:10-18`);
  - WhatsApp in `customer_whatsapp`, with the same template key and `entity_id = order_id`.
- **When:** the first run on or after `delivered_at + checkup_months` (12).
- **Skip:** a Customer with a **Re-adjustment booking** booked or attended within the previous
  `checkup_months`. Skipped Customers are counted, not sent.
- **Coverage: Premium Mpillow only** (owner, 2026-10-20). A line is covered when
  `classifyOrderLine` (`lib/readjustment/purchases.ts:80-122`) gives `productType = 'pillow'`
  and `tier = 'premium'`. It is read from `customer_purchase_lines` (slice 04), which has a parity
  check against that function; if slice 04 has not landed, call the function directly.
  - A pillow whose tier is unknown is not covered.
  - An Order with a Premium Mpillow and other lines gets one check-up for the Order. A
    **Paired build** is exactly that case: one Order with a Custom Mpillow and a Custom
    Mbolster, each line classified from its own Result snapshot (ADR 0026).

## Settings

These are `site_settings` keys, edited on slice 07's Aftercare card:

- `checkup_reminders_enabled` (default **false**);
- `checkup_months` (12).

Coverage is not a setting. It is Premium Mpillow, in code, with its test.

## Acceptance criteria

- [x] vitest covers the timing and skip rules as a pure function: on time, already re-adjusted
      within the period, opted out per channel, and not delivered.
- [x] A Basic Mpillow, an Mbolster, and a pillow of unknown tier get no check-up. A Premium
      Mpillow bought alongside them does.
- [x] A Customer whose Marketing consent is not `subscribed` gets no check-up email. If they
      opted in to WhatsApp, they still get the WhatsApp one. The candidate query's test pins
      both.
- [x] Each Order gets at most one check-up per milestone per channel, through the two ledgers.
- [x] The rendered email and the WhatsApp parameters state the fee as read from Costings.
      Changing the price in Costings changes the next message. A failed price read sends
      nothing.
- [x] No other price, offer or product appears.
- [x] The Aftercare card shows check-ups sent by channel, skipped by reason, and bookings that
      followed.
- [x] `./scripts/graphify update .` is run in the same commit.

## Build notes

Built on `claude/shopify-migration-plan-izv7fo` @ `fa224ce` (CRM 03, 04, 06, 07, 10, 11, 13, 14
and migration slices 05, 06, 07, 12 merged).

**What was built**

- **Migration** `supabase/migrations/20261020133000_checkup_reminders.sql`: seeds the two
  `site_settings` keys, `checkup_reminders_enabled = 'false'` and `checkup_months = '12'`. No
  table: the sends go in `customer_emails` and `customer_whatsapp` under template
  `aftercare.checkup_<n>m` with `entity_id` = the Order, and each ledger's unique key is the
  once-per-milestone-per-Order guard. The overview views are not redefined.
- **The pure rules**, `lib/aftercare/checkup.ts`:
  - settings, the ledger key (`checkupTemplate`), and the fee as stated (`formatCheckupFee`:
    `S$30`, `S$32.50`; none for $0);
  - the timing rule (`checkupTiming`, SGT calendar days, month ends clamped) and the database
    pre-filter (`deliveredBefore`);
  - coverage (`isCheckupCovered`, `coveredLineByOrder`): a `customer_purchase_lines` row with
    `product_type = 'pillow'`, `tier = 'premium'` and a unit still owned;
  - who is due and who is skipped (`selectCheckupCandidates`), the email decision with the
    consent line (`decideCheckupEmail`), the channel plan and the run's report.
- **The consent line.** `decideCheckupEmail` in `lib/aftercare/checkup.ts`, marked `CONSENT`.
  It is the one Aftercare rule that reads `marketing_email`. To drop it after counsel, delete
  that line; `checkup.test.ts` and `checkup-job.test.ts` mark the assertions that change with
  it.
- **The job**, `lib/aftercare/checkup-server.ts` (`planCheckups`, `runCheckups`):
  - reads the fee first, every run, with `loadServicePrices(admin).readjustment.msrp`; no fee
    (a failed read, or $0) blocks every send that day;
  - reads counted, delivered Orders (paged), their covered lines from `customer_purchase_lines`
    plus `order_items` quantities, both ledgers' check-up rows, and Re-adjustment bookings
    booked or attended within the period;
  - retries earlier runs' failed emails first, then sends each due Order on its planned
    channels: email through `dispatchCustomerEmail` (Reply-To the support inbox), WhatsApp
    through `notifyAftercareWhatsApp` with `checkupTemplateParams` (the fee is the fourth
    parameter, the button the order item id). At most 100 a run.
- **The daily chain**: `checkups` added to `AFTERCARE_RUNNERS` in `lib/aftercare/job.ts`. The
  cron route only gained a comment.
- **The email**, `renderCheckupEmail` in `lib/email/aftercare.ts`, registered as
  `aftercare.checkup` (group `aftercare`) with the fixture `sampleCheckup`. The fee line is word
  for word: *"A re-adjustment is a paid visit: S$30, paid when you book."* One button, *Book a
  re-adjustment*, to `/en-US/appointments?type=readjustment&item=<order item>`, then the
  staffed WhatsApp line and slice 07's footer.
- **The Aftercare card**: a *Check-up reminder* section under the Review request, with the
  switch, the period, the fee it states today, the WhatsApp template state, the last 90 days
  (check-ups sent, by channel, and how many were followed by a Re-adjustment booking), and
  today's plan with every skip by reason (re-adjusted this period, reminded about another
  Order, no channel, never marked delivered; and per channel, including *No marketing
  consent*). Data: `lib/aftercare/card-server.ts` and `lib/aftercare/checkup-counts.ts`. The
  settings route already wrote on `customers-edit`; the patch schema gained the two keys.
- **On the Customer timeline (slice 03)**: the pure `checkupTimelineEntries`
  (`lib/aftercare/checkup-timeline.ts`) and `checkupsAdapter`
  (`lib/crm/timeline/sources/checkups.ts`), under the *Aftercare* chip with `customers`. Kind
  `checkup.sent`: *Check-up reminder sent (email, WhatsApp)*, one per Order and milestone,
  linking to the Order.
- **Small changes to shared code**: CRM 07's private WhatsApp decision is exported as
  `decideAftercareWhatsAppFor(admin, customer, template)`, and the review email's footer
  markup is a shared helper. The test fakes gained `like` (`fake-admin.ts`), and `lte`, `like`
  and `range` (`review-request-fake-db.ts`).

**Database check** (`mp_c08`, Postgres 16 with the Supabase stubs): all 178 migrations apply,
and the two settings are seeded. In psql, inside a rolled-back transaction:

- the job's coverage query on `customer_purchase_lines` returns only the Premium Mpillow line
  of an Order that also holds a Basic Mpillow and an Mbolster, and the Custom Mpillow of a
  Paired build; never a Basic, an Mbolster or a pillow of unknown tier;
- `claim_customer_email` wins once per `(customer, aftercare.checkup_12m, order)`, a second
  claim wins nothing, `aftercare.checkup_24m` is its own key, and a failed row is re-claimed
  as attempt 2;
- the WhatsApp ledger's `on conflict do nothing` inserts once;
- `like 'aftercare.checkup_%'` finds only check-ups;
- `authenticated` cannot read `customer_purchase_lines`; `service_role` can.

CRM 04's `lib/crm/purchase-lines.check.ts` also passes against this database.

**Tests added**

- `lib/aftercare/__tests__/checkup.test.ts`: settings and the key; the fee; timing (on time,
  the day before, across midnight SGT, not delivered, the next year's milestone, month ends);
  coverage (Premium, Basic, Mbolster, unknown tier, accessory, returned, a mixed Order and a
  Paired build); the skips (re-adjusted within the period or still to come, a milestone
  already in a ledger, retries, reminded about another Order, an Order's own last milestone
  not counting); each channel's switch; and the consent rule, both cases.
- `lib/aftercare/__tests__/checkup-job.test.ts`, against the in-memory database: who gets one
  and how; coverage; consent both ways through the candidate query; each channel's switch; at
  most once per milestone per Order per channel across concurrent runs and re-runs; the next
  milestone a year later; retries and the 3-attempt limit; the fee in both channels, a price
  change, a failed read and a $0 fee sending nothing; switched off; the allowlist; the daily
  chain.
- `lib/aftercare/__tests__/checkup-copy.test.ts`: the fee line, the fee as the only price in
  the email and the WhatsApp text, no offer and no other product, the booking link, the
  footer, and the registry entry.
- `lib/aftercare/__tests__/checkup-timeline.test.ts` and
  `lib/aftercare/__tests__/checkup-counts.test.ts`.
- Updated: `job.test.ts` (two runners), `review-request.test.ts` (the settings shape),
  `aftercare-settings-card-render.test.tsx` (the check-up section, read-only without
  `customers-edit`), and `aftercare-route.test.ts` (the check-up keys on `customers-edit`,
  their bounds). The guard test `customers-write-guard.test.ts` passes unchanged.

**Deviations**

- **"Yearly" recurs.** A milestone falls every `checkup_months` after delivery (12, 24, …),
  and only the latest one reached is due. One missed while sending was off is never sent late
  beside the next. The slice's ledger key `aftercare.checkup_<months>m` and its "within the
  previous `checkup_months`" skip read that way.
- **At most one check-up per Customer per period.** A Customer reminded about another Order
  within the previous `checkup_months` is skipped and counted (`reminded_recently`); with
  several Orders due at once, the most overdue goes. This is not in the slice. Without it, a
  Customer with two Premium Mpillows bought months apart would hear twice a year, and turning
  the reminder on could send two messages a month apart. It mirrors the slice's Customer-level
  re-adjustment skip. An Order's own earlier milestones do not count.
- **A fee of $0 sends nothing.** ADR 0024 makes every visit free at $0, and *"a paid visit:
  S$0"* would not be true. The card says why.
- **A returned Premium Mpillow is not covered.** The view has no quantities, so the job reads
  `order_items.quantity − returned_quantity` for the covered lines: the reminder must be about
  a product the customer owns.
- **There is no Services page.** The storefront has none (`app/[lang]/` has no services route),
  so the email links to booking and to the staffed WhatsApp line only.
- **The card's window is 90 days, not 30.** A booking follows a check-up by weeks. *Bookings
  that followed* counts check-ups whose Customer made a Re-adjustment booking (booked,
  attended, no-show or needing a reschedule) on or after the check-up's first send.
- **"Skipped, by reason" is today's dry run**, as on slice 07's side of the card.
- **The registry id is `aftercare.checkup`.** The ledger key is the milestone
  (`aftercare.checkup_12m`), as the slice gives it, so unlike the review request the two
  differ.
- **Skip precedence on email:** the switch, an address and the allowlist come before consent.
  Outside production, a customer without consent is reported as *not on the test allowlist*.
- **The email's subject and opening are new copy**: *"Your Premium Mpillow is due for its
  yearly re-adjustment"*, following the approved WhatsApp wording. The fee line and the footer
  are word for word.
- **"Yearly" is in both messages.** With `checkup_months` other than 12 the copy would be
  wrong, so the card says to keep 12 unless the copy changes too.
- **Noticed, not changed:** the PRD's risk row *"The check-up template's price goes stale"*
  says WhatsApp goes only while the fee matches a price recorded for the template. Slice 13
  made the fee a template variable, so that guard is moot and nothing implements it.

**Left for ops or the owner**

1. Apply the migration.
2. With counsel, read the email (dev preview: `aftercare.checkup`) and the WhatsApp message,
   then switch the check-up on in the Aftercare card. It stays off until then.
3. If counsel advises the email may go without Marketing consent, delete the `CONSENT` line in
   `decideCheckupEmail` and update the marked assertions.
4. WhatsApp needs slice 13's steps: Meta's approval of `aftercare_checkup`, then
   `WHATSAPP_TEMPLATE_AFTERCARE_CHECKUP`. Until then check-ups go by email only, and the card
   says so.
5. Slice 13's open question still applies: the approved button points at
   `https://mpillow.com/appointments`. The email uses this app's public origin.
