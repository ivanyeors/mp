# Marketing consent: where it is written

Whether a **Customer** may be sent marketing email (`customers.marketing_email`:
`subscribed | not_subscribed | unsubscribed`), what set it
(`marketing_email_source`, a **Consent source**) and when. Every change is one
row of `customer_consent_events`, which nothing edits or deletes (an Import
undo removes only its own events).

One SQL function writes it: **`set_marketing_email(customer, to, source, at,
campaign_send)`** (last restated in
`20261101031444_consent_sign_up.sql`). The last two arguments
are optional; `campaign_send` is kept on the event only when the send is that
Customer's own, so an unsubscribe or a complaint names the campaign behind it.
Restate it with all five arguments: a four-argument copy would sit beside it
as an overload and make every older call ambiguous. It
locks the row, refuses a move the source may not make, writes the state, its
source and one event together, and returns whether anything changed. Nothing
calls `update customers set marketing_email` directly, and a trigger refuses
`unsubscribed → subscribed` from anyone but the customer (`account`).

Every caller is server code with the service role: `customer_consent_events`
is server-only, and the customer's own key cannot call the function.

## Every writer

| Source | Where | Moves | Route or function |
|---|---|---|---|
| `shopify_import` | Customers → Import from Shopify | subscribe, only someone nobody has asked | `apply_shopify_email_consent()`, inside the import's SQL (ADR 0029 h) |
| `import_default` | Customers → Import from Shopify → *Subscribe imported customers* | subscribe, only someone nobody has asked | `subscribe_migrated_customers()` (ADR 0039) |
| `shopify_unsubscribed` | the same card, from Shopify's unsubscribed list | unsubscribe, except someone who chose to subscribe here since | `subscribe_migrated_customers()` |
| `checkout` | the box at shop checkout, ticked by default | subscribe, only someone nobody has asked | `app/api/shop/checkout` → `recordCheckoutConsent()` |
| `customisation` | the box on a customisation's contact step, ticked by default: Mpillow, Basic, Mbolster, a Paired build (once, on the Mpillow), an Assisted customisation | subscribe, only someone nobody has asked | `app/api/results/hold` → `recordBoxConsentByEmail()` |
| `appointment` | the box on booking: a guest's customisation visit, a signed-in re-adjustment (free or paid) | subscribe, only someone nobody has asked | `app/api/appointments/book` → `recordBoxConsentByEmail()`; `app/api/readjustments/book` and `/checkout` → `recordBoxConsent()` |
| `sign_in` | the box on **Sign in**'s Customer tab, ticked by default; recorded once the link, code or Google proves the address, never for a Staff login | subscribe, only someone nobody has asked | `completeSignIn()` (`lib/auth/complete-sign-in.ts`), from `/auth/callback`, `finishSignIn` and `/auth/confirm` (ADR 0041) |
| `newsletter` | *Get our emails* in the site footer: the same sign-in link and code | subscribe, only someone nobody has asked; someone who unsubscribed is offered *Email me again* (`account`) | `completeSignIn()`, as above |
| `account` | the customer, signed in, on their Profile, or *Email me again* after a footer sign-up | either way; the only source that re-subscribes | `app/[lang]/account/actions.ts` → `setMarketingEmail()` |
| `unsubscribe_link` | the link in every campaign email; since slice 08 it names its send | unsubscribe | `app/api/email/unsubscribe` |
| `complaint` | Resend reports a spam complaint on a campaign send, which it names | unsubscribe | `record_campaign_send_event()` (`20261031152709`), from `app/api/email/resend-webhook` |
| `support` | Staff, at the customer's request, on the Customer page | unsubscribe only | `app/api/shop/customers/[id]/marketing-consent` |

## The boxes

The four boxes (checkout, customisation, booking, and **Sign in**'s Customer
tab) share one line, `MARKETING_BOX_LABEL`, and the booking form's Chinese
(`slides.bookAppointment.flow.marketingEmail`). The footer's *Get our emails*
says the same in its own words. The three form boxes are:

- **a boolean in the request**, absent meaning unticked, so a tab opened
  before the box sends nothing new;
- **recorded after the thing it rides on succeeds** (the Order, the hold, the
  booking), and **never fails it**: an error is logged;
- **for the email typed on the form.** Checkout and a re-adjustment already
  have their Customer. A customisation or a guest's booking finds the Customer
  by that email, or creates one (a *Lead* until they buy), and only when the
  box is ticked. On a Staff member's device it is the shopper's email, never
  the Staff login's;
- **quiet about everyone but someone nobody has asked.** Ticked, it subscribes
  a `not_subscribed` Customer; anyone who unsubscribed, or chose already, is
  skipped. Unticked, it changes nothing: a customer who wants no email
  unsubscribes from the email.

**The sign-up is the sign-in** (slice 03, ADR 0041). The Sign in box and the
footer's *Get our emails* differ from the form boxes in one way: nothing is
recorded when the form is sent. The choice rides in the sign-in link's return
address, and `completeSignIn` records it on the person's own Customer only once
the link, the code or Google has proven the address. A Staff sign-in, on the
Staff tab, never makes a Customer or records consent; the Sign in box is not
recorded for a Staff login on the Customer tab either.

Not yet: a signed-in Customer who unsubscribed should see the box unticked, so
ticking it is their own `account` choice (slice 02, still to do).

## Who receives a campaign

Consent is necessary, not sufficient. `marketing_campaign_blocker()` decides
each send (ADR 0040): consent, suppression (a bounce or a spam report), the
**Rest period** (7 days between marketing emails, at most 4 in 30, points-expiry
reminders included; `20261031144935`), and, once slice 12 lands, the sunset
rule. An **Audience** or a
**Segment** only narrows; neither ever reaches someone the claim refuses.

## Tests

- `supabase/tests/customer-migration/assert-07-marketing-consent.sql`,
  `supabase/tests/campaign-audiences/assert-consent-by-default.sql`,
  `assert-02-consent-boxes.sql` and `assert-03-sign-up.sql`: the function
  against Postgres.
- `lib/auth/__tests__/sign-in-intent.test.ts` and `complete-sign-in.test.ts`:
  which sign-in records which consent, and that a Staff sign-in records none.
- `lib/marketing-consent/__tests__/`: the TypeScript callers against a fake
  that applies the same rules (`fake-consent.ts`).
- Each route's `__tests__/`: the box is read as a boolean, recorded once, for
  the right email and source, and only once the request succeeded.
