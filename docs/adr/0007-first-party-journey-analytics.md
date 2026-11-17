# First-party journey analytics: DB source of truth, Prospect-default transition graph

Staff on Admin Panel → Analytics can see channel P&L (ADR 0006) but not why **Prospects** leave before a paid **Order**. Production only loads GTM/gtag; configurator draft ids are not analytics identity; **Discovery source** is self-reported and missing for most browsers that never reach hold. We need a first-party journey store and a Prospect-first viz that does not replace ADR 0006 charts.

## Decision

1. **DB is source of truth.** Journey tables in our database back Admin Analytics. GA4 BigQuery export syncs into staging tables; Admin graph reads the DB only — never live GA UI or APIs.
2. **Always-on collection with notice.** Storefront collection runs for every non–Admin Panel path. A non-blocking analytics notice discloses that using the site means we collect visit data to improve the experience; no Reject / opt-out gate; dismiss persists.
3. **Visitor identity.** Long-lived first-party UUID; persist GA `client_id` / `user_pseudo_id` on the **Visitor** so GA staging rows stitch. Merge to a person only via email or **Customer** — never IP, user-agent, or fingerprint alone.
4. **Unique-node transition graph, not Sankey.** Pages (expandable to sections) are unique nodes; renavigation loops back to the same node. Sankey rejected because cycles force duplicate columns and bury return behavior.
5. **Prospect-default Admin viz.** Graph defaults to **Prospects** (no paid **Order**); **Drop-off** is the primary sink; muted **Converted** sink behind an Include-converted toggle; last-touch **Entry source** for converters.
6. **Coexistence with ADR 0006.** Journey section is additive above Product Configuration; channel P&L charts and Shopify mirror rules stay.

## Considered options

- **Sankey / funnel columns** — rejected: loops (Home→Shop→Home) duplicate nodes; unique-node directed graph keeps one node per page/section with back-edges.
- **Probabilistic cross-device merge** (IP / UA / fingerprint) — rejected: false merges (shared networks, family devices) corrupt Prospect paths; wait for deterministic email/**Customer**.
- **Live GA for Admin journey charts** — rejected: latency, UI limits, and drift from our SoT; stage GA extract in DB and stitch via `ga_client_id`.
- **Consent wall / Reject mode** — rejected for v1 product choice: disclose via notice, collect full stack, keep users anonymous until Sign-in/email.
- **Replace ADR 0006 Analytics** — rejected: journey and channel P&L answer different questions; ship both.

## Consequences

- Glossary: **Visitor**, **Visit**, **Prospect**, **Entry source**, **Drop-off** in `CONTEXT.md`; keep **Discovery source** distinct.
- Schema and ingest land in follow-on slices; this ADR locks identity, SoT, viz shape, and Prospect-default before tables exist.
- Hobby cron budget: prefer chaining GA sync onto an existing job when a dedicated cron would blow the free-tier limit (same constraint class as ADR 0006).

## Amendment (2026-10-27): Drop-off reasons, asked

A **Drop-off** stays what it was: where a Visit ended, never why. Why is now asked, as a separate
fact, the **Drop-off reason** (PRD-crm-retention-loop slice 10, `drop_off_reasons`):

- one closed question on the configurators and at checkout, as a visitor who has started moves
  to leave, at most once per browser per 30 days; and on a Result's decline step;
- self-reported and holding no contact details, tied to the Visit and Visitor ids or to the
  Result for a decline. Decision 3 still governs any merge to a person, and a merged Visitor's
  answers are theirs, so the card says it asks for no name or email, not that it is anonymous;
- never written into `analytics_visits`, never inferred from a path, and shown to Staff on
  Analytics beside the Drop-off graph as *Why people leave*.



## Amendment (2026-11-13): the Visitor is tied to the Customer, and an Entry source names a platform

Decision 3's merge existed but nothing called it, so no **Visit** reached a **Customer** or a paid
**Order** (PRD-prospect-journey-analytics slice 16). Now:

- **The merge has callers, and they are the places a shopper types their own email**: the
  configurator's first question (ADR 0049), the hold, and shop checkout. Still deterministic only.
  A signed-in Staff member or Partner is serving someone else on a shared device, so their
  sessions merge nothing.
- **A paid Order names the Visit that paid**, found through the Order's Customer or email, because
  Stripe and Staff confirm payment with no Visitor cookie in reach. Shop checkouts and online
  **Results** only: a Staff order, a readjustment fee, and an in-store or Assisted Result were
  sold by a person, not by a Visit.
- **First touch is derived, never stored**: the earliest Visit of every Visitor that shares the
  Customer or the email. Decision 5's last touch stays the default; first touch is a second way
  to count the same Orders.
- **An Entry source records more, frozen with the rest**: landing path, `utm_content`, `utm_term`,
  an ad click id, and the app whose built-in browser the Visit began in. The channel and the
  **platform** (Google, Instagram, TikTok, …) are still decided at read time.
- **The User-Agent is read once, for the app's name only.** Instagram, Facebook and TikTok open
  links in their own browser and send no referrer; the name of that browser is the only sign of
  where the Visit came from. It classifies a Visit. It is not kept, and it is never identity:
  decision 3 stands.
- **`fbclid` is not proof of an ad.** Meta adds it to organic links too, so it names the platform
  and the Visit counts as Paid only with a paid `utm_medium`. Google, TikTok and Microsoft click
  ids are added only by ads and do mean Paid.
- **The Visitor cookie is sent back by the server** on ingest, since a cookie written by script
  lasts 7 days in Safari.

Rejected: storing first touch on the Customer (a later merge would leave it stale); a `visitor_id`
column on Orders (the Customer or email already finds the Visitor, for Results as well as shop
orders); reading ad platforms' APIs for spend (a separate, larger piece, not needed to map entry
points).
