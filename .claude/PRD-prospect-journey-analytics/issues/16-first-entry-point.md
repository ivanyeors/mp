# Slice 16 — A customer's first entry point

Type: AFK  
Parent: PRD `prospect-journey-analytics` (`.claude/PRD-prospect-journey-analytics/prospect-journey-analytics-prd.md`)  
User stories covered: 14, 30, 31  
Status: built, not yet live (migration `20261113090000_visit_entry_detail.sql` to apply)

## Why

The owner asked (2026-11-13) whether traffic from Facebook, Instagram, TikTok, Google and direct
visits is recorded well enough to map each customer's first entry point. It was not:

- `mergeVisitorIdentity` and `linkVisitToPaidOrder` had no callers, so no **Visit** was ever tied
  to a **Customer** or a paid **Order**. The channel funnel's Orders and Revenue stayed empty.
- An untagged Google Ads click read as organic search; an untagged link opened in the Instagram
  or TikTok app sent no referrer and read as Direct.
- The **Visitor** cookie was written by script, which Safari keeps for 7 days.
- Nothing reported a person's first **Visit**, and the Customer page showed no source.

## What was built

- **Visitor → Customer.** The browser that gives an email is tied to it (`stitchShopperVisitor`):
  the configurator's first question, the hold, shop checkout. Never on a Staff or Partner session.
- **Visit → paid Order.** Set when Stripe confirms a shop checkout and when Staff accept an online
  **Result**, found through the Order's Customer or email (`recordPaidOrderVisit`). Not for a Staff
  order, a readjustment fee, or an in-store or Assisted Result.
- **More recorded at Visit start**: landing path, `utm_content`, `utm_term`, the ad click id
  (`gclid`, `gbraid`, `wbraid`, `ttclid`, `msclkid`, `fbclid`) and the app whose built-in browser
  the Visit began in (`lib/analytics/journey/in-app.ts`).
- **Platform beside channel** (`classifyVisit`): Google, Instagram, Facebook, TikTok and the rest.
  A Google, TikTok or Microsoft click id means Paid. `fbclid` names Meta but not that it was paid.
- **First touch**, derived at read time (`lib/analytics/journey/first-touch.ts`): the earliest
  Visit of every Visitor sharing the Customer or email.
- **Admin**: Analytics → Traffic & search → Visits by channel gains a *Visit that paid / First
  visit* switch and a *By platform* table. A Customer's page gains *How they found us*: first
  Visit, the Visit behind their first Order, and their own **Discovery source**, shown apart.
- **Cookie**: the ingest response sends the Visitor cookie back from the server, so it keeps its year.

## Acceptance criteria

- [x] A shopper's Visitor is tied to their email or Customer when they give it, and not on a Staff or Partner device
- [x] A paid online Order names the Visit that paid; redelivery links nothing twice
- [x] An untagged Google or TikTok ad click is Paid; an untagged in-app Visit is not Direct
- [x] Staff can read Orders and Revenue by first touch and by platform
- [x] A Customer's page shows their first entry point, apart from their Discovery source
- [x] Ingest still records Visits if the code is deployed before the migration
- [ ] Migration applied to production
- [ ] Checked on a real iPhone that the Visitor cookie outlives 7 days (Safari)

## Known limits

- First touch reaches only as far as we can tie Visits to the person: the same browser, or another
  where they gave the same email. Nothing before 2026-11 is linked; there is no backfill.
- A Meta ad is Paid only when its link carries a paid `utm_medium`. Every ad and bio link we
  control should be tagged (`utm_source`, `utm_medium`, `utm_campaign`).
- No ad spend, impressions or cost per order: nothing is read from the ad platforms.

## Proof

- `pnpm vitest run lib/analytics` (classification, channel mix, first touch, identity)
- `npx tsx lib/analytics/journey/entry-source.check.ts`, `npx tsx lib/analytics/journey/in-app.check.ts`
- Preview: `/settings/analytics?tab=traffic`, `/settings/customers/<id>` (`fixtures/journey.mjs`)
