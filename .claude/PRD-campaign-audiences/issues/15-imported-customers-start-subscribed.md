# 15 — Imported customers start subscribed

**Issue:** not filed
**Type:** AFK, then HITL (the owner runs it)
**Status:** **built** (2026-10-31)
**Blocked by:** none
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:admin`, `area:email`

## Goal

The owner's request of 2026-10-31: "make all imported customers subscribed to marketing first as
it's a new import". The invitation to the new website, and every later campaign, reaches every
imported customer except those who unsubscribed. ADR 0039.

## What was built

- **`20261031144524_consent_by_default.sql`**: the sources `import_default`,
  `shopify_unsubscribed` and `checkout`; `set_marketing_email()` lets each make only its own move
  (a default subscribes only someone nobody has asked); `subscribe_migrated_customers(list,
  apply)` unsubscribes everyone on Shopify's unsubscribed list, then subscribes every other
  Migrated customer nobody has asked, in one transaction; the import's undo treats
  `import_default` as its own.
- **Customers → Import from Shopify → *Subscribe imported customers***: how many are not
  subscribed yet; Shopify's unsubscribed list picked from a file (read in the tab; only the
  emails are sent), or *Nobody has unsubscribed in Shopify* ticked; the preview's counts; then
  *Subscribe N customers*. One audit row, counts only.
- The Customer page and timeline name the source: *from the import, by default*, *from Shopify's
  unsubscribed list*.

## How the owner runs it

1. In Shopify admin: Customers → filter *Email subscription status* is *Unsubscribed* → Export →
   Plain CSV file.
2. Admin Panel → Customers → Import from Shopify → *Subscribe imported customers*: pick that file,
   read the counts, press *Subscribe*.
3. After the cutover's final import (migration slice 10), export the list again and run it again.

## Acceptance criteria

- [x] Nobody on Shopify's list is subscribed; anyone who unsubscribed here stays unsubscribed.
- [x] A subscription the customer chose here, from their Profile, outranks Shopify's list.
- [x] Nothing runs without the list or the owner's word that it is empty.
- [x] A second run changes nothing; undoing an Import batch still removes what it created.
  (`supabase/tests/campaign-audiences/assert-consent-by-default.sql`)
- [ ] The first email to the people subscribed by default says why they are hearing from us and
  how to stop (HITL, with counsel).
