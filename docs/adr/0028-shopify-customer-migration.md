# Shopify customers are imported as Customer rows, never as accounts, and claimed by signing in

Status: Accepted (PRD `shopify-customer-migration`, 2026-10-20)

Everyone who bought from Mpillow on Shopify is a stranger to the platform. Staff see no history,
and re-adjustment booking files their pillow as "not listed". This record decides how they
arrive. Each Shopify customer who has an email is imported from the owner's CSV export as a
**Customer** row with no login. The existing **Sign in** adopts that row the first time its owner
uses the same email (the **Claim**), and an account-bound **Welcome-back voucher** is the reason
to do it. No login moves, because there is none to move. No Shopify order moves, because the
owner ruled that out on 2026-10-13.

This narrows the "No Shopify" rule of [ADR 0024](0024-services-priced-in-costings.md); it does
not reverse it. Shopify stays ad hoc and off the roadmap. The import adds no Shopify code, no API
scope and no order link: it reads a file the owner exports by hand.

## Context

- **There is no password to migrate.** **Sign in** is Google OAuth or an emailed code
  (`components/auth/login-form.tsx`), and Shopify does not export passwords.
- **The claim already works.** `linkCustomerToAuthUser` looks up a `customers` row by the
  signed-in user's verified email and adopts it while `auth_user_id` is null (`decideCustomerLink`,
  `lib/auth/customer-identity.ts:39-56`). It runs on every account page. Pre-creating the row is
  the whole account migration.
- **A customer can read every column of their own row** (`0037_customer_auth.sql:15-18`).
  Shopify's `Note` and `Tags` are written for staff, and may hold health remarks.
- **`customers.total_orders` and `total_spent` belong to the platform.** `updateCustomerStats`
  recomputes them from platform **Orders** on every payment. A Shopify figure written there would
  be overwritten, or mixed into a platform one.
- **Every coupon is a bearer code.** Checkout validates it against the typed email, never the
  signed-in Customer. `usage_count` moves only after payment, so nothing reserves a use. No coupon
  reaches a **Result**: the hold prices with `discountAmount: 0`
  (`app/api/results/hold/route.ts:648`, `lib/results/paired-hold.ts:118`).
- **Email has no consent, no unsubscribe and no suppression.** One transport serves the whole app,
  and `.env.example` selects the Gmail mailbox that sends order emails. The privacy policy already
  promises opt-out.

## Decisions

- **(a) The source is the owner's Admin CSV export, imported from the Admin Panel.** Shopify
  Admin → Customers → Export → *All customers* → *Plain CSV file*. There is no Admin API customer
  access, no new scope and no protected-customer-data approval. The browser reads the file and
  sends only the columns the import uses, in chunks, because a server action body is capped at
  1 MB. The file is never uploaded or stored: no Storage bucket, no **Media Asset**, no Drive, and
  nothing in the repo. The import needs its own **Permission**, `customer-import`, because Manager
  and Staff both hold `customers`. There is no second import path: no CLI, and no service-role key
  on a laptop.

  **Header row.** Slice 04 records here the header the first real file carried, and updates the
  parser first if it differs. Until then this is the expected header, which the import page
  checks before it reads a row:

  > Customer ID · First Name · Last Name · Email · Accepts Email Marketing · Default Address
  > Company / Address1 / Address2 / City / Province Code / Country Code / Zip / Phone · Phone ·
  > Accepts SMS Marketing · Total Spent · Total Orders · Note · Tax Exempt · Tags

- **(b) The import creates Customers, never auth users.** Nothing in this initiative calls
  `supabase.auth.admin.*` (`inviteUserByEmail`, `createUser`, `generateLink`). An account exists
  only once its owner proves the email by signing in. Binding happens only in
  `linkCustomerToAuthUser`.
- **(c) Platform data wins.** When a Shopify row matches an existing **Customer**, the import
  fills only the fields that are null. It never changes `email`, `auth_user_id`, `tags`, `notes`
  or `total_*`.
- **(d) Shopify-era facts live in `migrated_customers`, which is service-role only.** The Shopify
  customer id, order count, spend, tags, note and consent snapshot sit beside the Customer, not on
  it, because the customer can read their own `customers` row (`0037_customer_auth.sql:15-18`).
  The table has RLS on and no policy, and `anon` and `authenticated` hold no grant on it.
- **(e) Batches are idempotent and reversible.** Shopify customer id is the import key, with
  email as the fallback, so importing the same file again creates nothing and changes nothing.
  Each chunk is one transaction and the batch records how far it got, so picking the same file
  resumes it. Undo removes what a batch created, but never a row that has been **Claimed** or that
  anything references (an **Order**, a cart or wishlist, a review, a **Return**, a
  **Re-adjustment booking**, a **Result**). For a row the import merged into, undo removes the `migrated_customers` row and the
  address it added, and reverts nothing on `customers`.
- **(f) A Claim happens exactly once.** One SQL function stamps `claimed_at` and inserts the
  **Welcome-back voucher** in the same transaction. A unique index on
  `coupons (customer_id, issued_for)` is the race guard. `linkCustomerToAuthUser` runs on every
  account page, so two concurrent calls for one Customer are the normal case, not an edge case.
- **(g) The voucher is account-bound.** `coupons.customer_id` is checked against the signed-in
  **Customer** at preview and again at checkout, so a forwarded code is worthless. A bound coupon
  is never valid for a guest. Every unbound coupon stays a bearer code, as today.
- **(h) Consent carries provenance.** Shopify's *Accepts Email Marketing = yes* becomes
  `subscribed`, with source `shopify_import` and the export's date. Shopify's "no" stays
  `not_subscribed`, never `unsubscribed`, because it may mean "never asked". An import never
  re-subscribes anyone who is `unsubscribed`: only the customer's own action does.
- **(i) Campaign mail is not transactional mail.** It goes through its own transport and sending
  subdomain, never the Gmail mailbox that sends order emails, so its bounces and complaints cannot
  reach the deliverability of order and **Result** emails. Every campaign email carries one-click
  unsubscribe (RFC 8058) and a footer link. Unsubscribing stops campaign mail only: order and
  **Result** emails are transactional, and continue.
- **(j) Accepted risk: one person can redeem their voucher twice by paying twice at once.** Coupons
  have no reservation today, because `usage_count` moves after payment. For a voucher bound to one
  **Customer**, that race needs the same person to complete two checkouts concurrently. It is not
  worth a reservation table.
- **(k) Facts, not statuses.** Tables store events and timestamps: `account_linked_at`,
  `claimed_at`, sends, clicks and consent events. Statuses such as *Signed up* or *Voucher used*
  are derived in `admin_customer_overview`, the one read model the Admin Panel lists Customers
  from, so they cannot drift from the facts. Each later slice adds columns to that view instead of
  writing its own query. This is the base the CRM builds on (PRD, *Toward a simple CRM*).
- **(l) Staff-only facts never live on `customers`.** The customer can read their own row. Staff
  notes, tags from other systems and campaign history go in service-role-only tables keyed by
  `customer_id`.

## Considered options

- **The Shopify Admin API for customers** — rejected. It needs a new access scope and Shopify's
  protected-customer-data approval, and it is new code on a platform ADR 0024 took off the
  roadmap. The owner's export carries every field this plan uses.
- **Pre-creating auth users, or sending Supabase invites** — rejected. It would send Supabase
  emails nobody asked for, create accounts their owners never chose, and bypass the one binding
  path. A verified email is the proof of ownership, and only a sign-in gives one.
- **A CLI importer** — rejected. It is a second write path, and it puts the export and a
  service-role key on a laptop. The Admin Panel import needs no developer.
- **Storing the export** (a Storage bucket, a **Media Asset**, Drive, an `info/` folder) —
  rejected. The file is PII, and `info/GET-from-shopify.md` is the precedent not to follow. Only
  the imported rows are kept; the file's SHA-256 identifies it.
- **Shopify totals in `customers.total_*`** — rejected. `updateCustomerStats` overwrites them on
  the next payment, and one figure would mix two channels.
- **Shopify `Note` and `Tags` in `customers.notes` / `tags`** — rejected. The customer can read
  their own row.
- **A bearer welcome code per customer** — rejected. Whoever holds a forwarded code spends it.
  Binding the voucher to the signed-in Customer costs one column and one check.
- **A coupon reservation table** — rejected for this voucher; see (j).
- **Linking Shopify orders to Customers, or showing them in `/account`** — rejected (owner,
  2026-10-13). The **Shopify order mirror** stores no customer fields, so it would also need
  Shopify customer API access. Staff see the Shopify-era count and spend from
  `migrated_customers`, and customers see none.
- **Measuring the campaign with journey analytics** — rejected.
  [ADR 0007](0007-first-party-journey-analytics.md) merges a **Visitor** into a **Customer** only
  through a deterministic key, and that merge has no callers yet (`mergeVisitorIdentity` and
  `linkVisitToPaidOrder`, `lib/analytics/journey/identity.ts`). A campaign UTM is captured as an
  **Entry source** but never reaches a **Claim** or a paid **Order**. The funnel (sent, clicked,
  claimed, redeemed, revenue) is counted in the campaign's own ledgers instead.
- **Sending through the app's existing transport** — rejected; see (i). A Workspace mailbox also
  caps daily sends at roughly 2,000.
- **A stored status column** (an account or migration status as text) — rejected; see (k).

## Consequences

- The "No Shopify" rule in ADR 0024 is narrowed, not reversed: Shopify customers are imported
  once, from a file, and their orders stay unlinked. Shopify code, scopes, price sync and order
  linking stay out. ADR 0024 carries a line saying so.
- Glossary: **Migrated customer**, **Claim**, **Claim link**, **Welcome-back voucher**,
  **Marketing consent**, **Import batch** and **Account status** in `CONTEXT.md`. **Customer** now
  names the row, whether or not it has an account.
- A phone-only Shopify customer is not imported. `customers.email` is NOT NULL and unique, and
  they could not sign in anyway. Each one is counted as a skip.
- An incomplete Shopify address is skipped, never padded, because `recipient`, `line1`, `city` and
  `postal_code` are NOT NULL. The importer writes `country` explicitly, and left-pads a five-digit
  Singapore postal code, counting each repair. The `'MY'` default left over from the MYR era moves
  to `'SG'`.
- If a typo'd Shopify email belongs to someone else, that person can claim the row and see the
  address. Shopify's own email-code login has the same exposure. Bounced addresses are suppressed,
  and *Import without addresses* is there for a conservative import.
- The **Welcome-back voucher** applies to the shop cart only. A voucher usable on a **Result**
  touches the **Authorization hold**, Accept, the **Commission** base and refunds, and needs its
  own PRD.
- Someone who signs in before the Claim code ships loses nothing: their next
  `linkCustomerToAuthUser` call claims.
- `customer-import` requires `customers` for now. Once the CRM adds `customers-edit`, it requires
  that instead, because importing is a change.
- Every per-customer event table this initiative adds is append-only and carries `customer_id` and
  a timestamp, so the CRM timeline (ADR 0027) can merge it when it is read, with no backfill.
- No campaign email is sent before one-click unsubscribe is live in production. The wave sender
  refuses to run while the unsubscribe route is absent, and refuses the Gmail transport.
