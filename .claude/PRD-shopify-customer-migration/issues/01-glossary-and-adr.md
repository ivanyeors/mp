# 01 — Glossary and ADR 0028: what moves, what never moves, and what a Claim is

**Issue:** [#265](https://github.com/ivanyeors/mp/issues/265) (parent #264)
**Type:** AFK
**Status:** built in `11ae402` on `claude/shopify-migration-plan-izv7fo`
**Blocked by:** none
**User stories:** underpins all
**Labels:** `documentation`, `enhancement`, `needs-triage`, `P2`, `area:admin`

## Goal

Write down the vocabulary before any table is named. "Migration" invites two wrong designs:
moving logins, which there are none of, and moving orders, which the owner ruled out on
2026-10-13. These terms close both doors.

## CONTEXT.md entries

**Migrated customer** — a **Customer** whose row was created or enriched from the Shopify customer
export. It carries one `migrated_customers` row: Shopify customer id, Shopify-era order count and
spend, Shopify tags and note, the consent snapshot, the import batch and `claimed_at`. Readable
by the service role only.
_Avoid_ — "imported account" or "migrated account". No login moved, and Shopify credentials
never leave Shopify. Until it is **Claimed**, a Migrated customer is a row, not an account.
_Avoid_ — writing Shopify-era figures into `customers.total_orders` / `total_spent`. Those are
platform-derived and recomputed by `updateCustomerStats`.

**Claim** — the first **Sign in**, after import, by the person who owns a **Migrated customer**'s
email. `linkCustomerToAuthUser` binds `auth_user_id` as it would for any customer row. The
Claim stamps `claimed_at` and issues the **Welcome-back voucher**, both in one transaction and
both exactly once.
_Avoid_ — "invite" or "activation". Nothing is created in `auth.users` before the person signs
in, and no Supabase invite is sent.

**Claim link** — the per-customer link in a campaign email, `/account/welcome?c=<token>`. The
token is opaque; only its hash is stored. It prefills the email on the welcome page and
attributes the click.
_Avoid_ — "magic link". A Claim link never signs anyone in. Proof of the email is always the
sign-in itself.

**Welcome-back voucher** — the one `coupons` row issued to a **Migrated customer** at **Claim**
(`issued_for = 'welcome_back'`). It is bound to that Customer: valid only while they are
signed in and checking out with the account email. It is a shop-cart voucher, like every coupon
today.
_Avoid_ — "store credit", "points", "gift card" (none exist). Do not describe it as usable on a
customisation: **Results** price with no discount (`app/api/results/hold/route.ts:648`, `lib/results/paired-hold.ts:118`).

**Marketing consent** — whether a **Customer** agreed to marketing email, stored as
`subscribed | not_subscribed | unsubscribed` with its source and timestamp. Every change is
appended to `customer_consent_events`.
_Avoid_ — inferring consent from having an account, a past **Order**, or a **Claim**. Do not
treat Shopify's "no" as `unsubscribed`: it may mean "never asked".

**Import batch** — one import that wrote to the database, run from **Admin Panel** → Customers →
Import from Shopify. It records the file's name and SHA-256, the counts by outcome, the
**Staff** who ran it, and when. It is the unit of reconciliation, of resume, and of undo.
_Avoid_ — "upload". The file itself is never uploaded or stored; the browser reads it and sends
rows.

**Account status** — whether a **Customer** row is bound to a login: *Signed up* (since
`account_linked_at`) or *No account*. It is derived from `auth_user_id` in the Customer overview,
never stored as text. It applies to every Customer, not only Migrated ones.
_Avoid_ — "registered", "member" (a **Member** is Staff) or "active" for this. For a Migrated
customer, *Signed up* and **Claimed** usually coincide. They differ when the person already had
an account before the import: that Customer is *Signed up* at once, and is **Claimed** at their
next sign-in.

Also amend two existing entries:

- **Customer** (`CONTEXT.md:319-321`) today reads *"A shopper account identity after Sign in"*.
  That was already narrower than the table: checkout creates a `customers` row for a guest, and
  this initiative creates them by import. Rewrite it as *"A shopper's record (`customers` row),
  created at checkout, at Sign in, or by the Shopify import. It **has an account** once a Sign in
  is bound to it (`auth_user_id`)."* Keep the Profile line.
- **Shopify order mirror**'s `_Avoid_` line gains: *Shopify customers are imported once (ADR
  0028); their orders stay unlinked.*

## ADR 0028 — decisions to record

- **(a) The source is the owner's Admin CSV export, imported from the Admin Panel.** No Admin API
  customer access, no new scope, no protected-customer-data approval. Record the header row the
  first real file carried (slice 04). The browser reads the file and sends rows in chunks; the
  file is never stored. The import needs its own permission, `customer-import`, and there is no
  second import path (no CLI).
- **(b) The import creates Customers, never auth users.** No `auth.admin.*` calls in this
  initiative. Binding happens only in `linkCustomerToAuthUser`.
- **(c) Platform data wins.** A matching Customer is only filled where its fields are null. The
  import never changes email, `auth_user_id`, `tags`, `notes` or `total_*`.
- **(d) Shopify-era facts live in `migrated_customers`, which is service-role only.** The reason:
  the customer can read their own `customers` row (`0037_customer_auth.sql:15-18`).
- **(e) Batches are idempotent and reversible.** Shopify customer id is the import key, with email
  as the fallback. Rollback never deletes a row that has been claimed or that anything references.
- **(f) A Claim is exactly once.** The `claimed_at` stamp and the voucher insert share one SQL
  function, and a unique index on `(customer_id, issued_for)` is the race guard.
- **(g) The voucher is account-bound.** `coupons.customer_id` is checked against the signed-in
  Customer at preview and at checkout. A bound coupon is never valid for a guest.
- **(h) Consent carries provenance.** Shopify "yes" becomes `subscribed` (`shopify_import`, export
  date). An import never re-subscribes anyone who is `unsubscribed`.
- **(i) Campaign mail is not transactional mail.** It goes through its own transport and
  subdomain, never the Gmail mailbox that sends order emails. Unsubscribing stops campaign mail
  only.
- **(j) Accepted risk:** a one-person voucher can be redeemed twice by the same person paying
  twice at once, because coupons have no reservation today. This is not worth a reservation
  table.
- **(k) Facts, not statuses.** Tables store events and timestamps (`account_linked_at`,
  `claimed_at`, sends, clicks, consent events). Statuses such as *Signed up* or *Voucher used*
  are derived in `admin_customer_overview`, the one read model the Admin Panel lists Customers
  from. This is the base the CRM builds on (PRD, *Toward a simple CRM*).
- **(l) Staff-only facts never live on `customers`.** The customer can read their own row. Staff
  notes, tags from other systems and campaign history go in service-role-only tables keyed by
  `customer_id`.

## Acceptance criteria

- [x] `CONTEXT.md` carries the seven terms above with `_Avoid_` lines, the rewritten
      **Customer** entry, and the amended **Shopify order mirror** line.
- [x] `docs/adr/0028-shopify-customer-migration.md` records (a)–(l). It links ADR 0024 (the
      "No Shopify" rule it narrows, not reverses) and ADR 0007 (why journey analytics does not
      carry the funnel).
- [x] `./scripts/graphify update .` is run in the same commit.

## Build notes

- **Built.** `CONTEXT.md` gains a section, *Shopify customer migration (ADR 0028)*, right after
  the Language section and next to the **Customer** and **Shopify order mirror** entries it builds
  on. It holds the seven terms in the house format (`**Term**:`, a definition, then one `_Avoid_:`
  line). The **Customer** entry is rewritten as specified, with its Profile line kept. The
  **Shopify order mirror** `_Avoid_` line gains the ADR 0028 sentence.
  `docs/adr/0028-shopify-customer-migration.md` records (a)–(l) under the same letters, so the
  other slices' references ("ADR 0028 d", "k, l") resolve. It also has Context, Considered options
  and Consequences sections, and links ADR 0024 and ADR 0007.
- **ADR 0024** gains one Consequences line, *"Narrowed by ADR 0028: …"*. This follows the
  precedent of ADR 0001's *"Amended by ADR 0024"* line. There is no ADR index in the repo
  (`docs/adr/` has no README, and no other file lists the ADRs), so there was nothing else to
  link from.
- **Migrations, tests:** none (docs only). Typecheck, lint (0 errors) and the full test suite
  pass, unchanged.
- **Deviations.**
  - The slice writes two `_Avoid_` lines for **Migrated customer**. The glossary never has two in
    one entry, so they are joined into one line with semicolons; the wording is unchanged.
  - The **Account status** sentence about *Signed up* and **Claimed** coinciding is explanation,
    not something to avoid, so it moved into the definition. The `_Avoid_` line now says "reading
    *Signed up* as **Claimed**".
  - (a) asks for the header row the first real file carried. No real file exists yet, so the ADR
    records the PRD's *expected* header, clearly labelled, and says slice 04 replaces it (slice 04
    step 3 already asks for this).
- **Left for others.** Slice 04 records the real header in ADR 0028 (a). The ADR's Consequences
  mention ADR 0027 (the CRM, written in parallel) in plain text, with no link, so nothing breaks
  if that number moves. The **Visitor** entry's `_Avoid_` still glosses Customer as "shopper
  Sign-in identity", which the new **Customer** entry makes slightly narrow. It was left alone as
  out of scope.
