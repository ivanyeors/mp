# Staff orders and payment links: vertical slices

Tracer-bullet breakdown of `../staff-orders-payment-links-prd.md`. Each slice runs through every
layer it touches: schema, server, screen, copy and tests.

**Triage label:** `needs-triage`
**Tracker:** not yet published to GitHub.

## Slices

| # | Title | Type | Status | Blocked by | User stories |
|---|-------|------|--------|------------|--------------|
| 01 | Glossary (**Staff order**, **Payment link**, **Payment request**) and ADR 0048 | AFK | **done** | none | underpins all |
| 02 | Pricing and creating a Staff order: `quoteStaffOrder`, `createStaffOrder`, `order_payment_links`, `POST /api/staff-orders`, retire `POST /api/shop/orders` | AFK | **done** (migration to apply) | 01 | 1–7, 11, 17 |
| 03 | The Payment link: `/pay/[token]`, `POST /api/pay/[token]/checkout`, one live Checkout per Order, the webhook's `expired` branch, the daily expiry sweep | AFK | **done** | 02 | 12–16 |
| 04 | The Payment request email: editable copy, registry entry, resend route | AFK | **done** | 02 | 8, 10 |
| 05 | Staff screens: Create order on the Customer page (with Copy and QR), the Payment link card on the Order page, the Documentation guide | AFK | **done** | 02–04 | 1–11 |
| 07 | Pillows and bolsters on a Staff order, with a Filling Template chosen and adjusted before the order is made (ADR 0057); larger prices and *Add* on hover in the product list | AFK | **done** | 02, 05 | owner request 2026-11-23 |
| 06 | Sign-off: staging, Stripe test cards and PayNow, both locales, a handset scanning the QR | HITL | **not started** | 01–05 | all |

## Build notes (2026-11-07)

- **Apply the migration before deploying:** `supabase/migrations/20261107120000_order_payment_links.sql`.
  The Create order button, the pay page and the Order page's card read the new table.
- **Nothing to configure in Stripe.** The link opens an ordinary Checkout Session with the
  account's dynamic payment methods (card, Apple Pay, Google Pay, PayNow), and the existing
  webhook endpoint already receives `checkout.session.completed` and `checkout.session.expired`.
- **The email's words** are editable under Email templates → *Payment request*.

## Later, not in these slices

- **A reminder before the link expires** (day 5 of 7), through the daily job, as the Result
  *Payment reminder* does.
- **The complimentary re-adjustment hint**: say on the dialog when the Customer still has a free
  visit, so Staff book it from Appointments instead of charging the fee (ADR 0024's rule).
- **Paying at the counter** on a card reader: PRD `in-store-counter-payments` could settle a
  Staff order the same way it settles a Result.
