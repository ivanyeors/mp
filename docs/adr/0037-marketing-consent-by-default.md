# Imported customers start subscribed, and the checkout box is ticked by default

Status: Accepted (PRD `campaign-audiences`, owner decisions 2026-10-31). Amends ADR 0029 (h) and
the rule in `20261020120000_marketing_consent.sql` that "Staff never subscribe anyone".

## Context

**Marketing consent** came from two places only: the Shopify import, where an explicit *yes*
subscribes, and the customer's own Profile toggle. Shopify's *no* stayed `not_subscribed`,
because it may mean "never asked" (ADR 0029 (h)). So most imported customers, and every customer
who first buys here, could not be emailed, and the invitation to the new website reached only
the minority who had said yes in Shopify.

The plan recommended an unticked box where people give their email, and leaving the import as it
was. The owner decided otherwise on 2026-10-31: "make all imported customers subscribed to
marketing first as it's a new import", and "consent during checkout is auto agree first, they
can unsubscribe when they are seeing marketing emails", with a box ticked by default whose words
say the emails are important updates, event invites and offers, with no spam.

Two facts constrain how:

- **Shopify's export cannot tell "never asked" from "unsubscribed".** Its *Accepts Email
  Marketing* column is yes or no. Someone who clicked unsubscribe in a Shopify email is a *no*.
  Emailing them again ignores an unsubscribe request, which the Spam Control Act requires a
  sender to honour.
- **Singapore's PDPC does not let deemed consent by notification be used for direct marketing
  messages** ([PDPC assessment checklist, Annex B](https://www.pdpc.gov.sg/-/media/Files/PDPC/PDF-Files/Advisory-Guidelines/AG-on-Key-Concepts/Annex-B--Assessment-Checklist-for-Deemed-Consent-by-Notification-1-Feb-2021.pdf)).
  A box nobody touched, and a default nobody chose, are weaker evidence of consent than a tick.
  This is the owner's accepted risk; counsel should read the wording and the first email to the
  people subscribed by default.

## Decision

- **(a) Three consent sources, so every default is visible and countable.** `import_default`
  (subscribed because they were imported, though Shopify did not say yes),
  `shopify_unsubscribed` (on the list of people who unsubscribed in Shopify) and `checkout` (the
  box at checkout). The Customer page and timeline name each: *from the import, by default*,
  *from Shopify's unsubscribed list*, *from the box at checkout*. Nothing is recorded as the
  customer's own choice that was not.
- **(b) A default never overrides a choice.** `import_default` and `checkout` subscribe only a
  Customer nobody has asked (`not_subscribed`), and skip anyone else quietly, as
  `shopify_import` does. Neither ever re-subscribes someone who unsubscribed; only the customer's
  own `account` action does, as before. Unticking the checkout box changes nothing: a customer
  who wants no email unsubscribes from the email.
- **(c) Shopify's unsubscribes come first.** *Subscribe imported customers* on Customers → Import
  from Shopify does nothing until the owner gives Shopify's unsubscribed list (Customers → filter
  *Email subscription status is Unsubscribed* → Export), or ticks that nobody is on it. One SQL
  function, `subscribe_migrated_customers()`, unsubscribes everyone on the list, then subscribes
  every other Migrated customer nobody has asked, in one transaction; its preview is the same
  function writing nothing. Shopify's list does not override a subscription the customer chose
  here since, from their Profile. Run again after each Import batch, with the list exported
  again; it changes only who is new.
- **(d) The import's undo treats its default as its own.** Like `shopify_import`, an
  `import_default` event does not mark a created Customer as referenced, and a merged Customer's
  default subscription is taken back with the batch. A `shopify_unsubscribed` event does keep the
  row: an unsubscribe must survive an undo and a re-import.
- **(e) The checkout never fails on consent.** The box is a boolean in the checkout request,
  absent meaning unticked; the Customer is the server's. It is recorded after the Order is
  created, and a failure is logged, not shown.

## Consequences

- Every imported customer not on Shopify's list, and every buyer who leaves the box ticked, is in
  *Everyone subscribed* and in any Segment Audience, and the invitation campaign
  (*Imported from Shopify, not signed in yet*) reaches them.
- Unsubscribes and spam reports from people subscribed by default will be higher than from
  people who opted in. The pause rule (bounces over 2%, spam reports over 0.1%) still stops a
  campaign; the first Waves to them should be small, buyers first, as Waves already are.
- Who was subscribed by default can always be listed (`marketing_email_source`), so if counsel
  advises asking them again, a re-permission campaign or a reversal needs no new data.
- The customisation contact step and appointment booking get the same ticked box in slice 02,
  under their own sources, `customisation` and `appointment`, which move exactly as `checkout`
  does (`20261031120000`; [where consent is written](../data-flows/marketing-consent.md)). The
  footer sign-up (slice 03) stays double opt-in.
