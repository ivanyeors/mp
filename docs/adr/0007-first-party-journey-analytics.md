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
