# Shop checkout pays on our page, with Apple Pay and Google Pay beside the card form

Status: Accepted (owner request 2026-11-16: "Apple Pay in our website when the user wants to pay").
Amended 2026-11-16 (owner: "keep our layout and add an Apple Pay button beside the pay with stripe
button"): see **Wallet buttons beside the checkout button** below.
Amended again 2026-11-16 (owner: "Apple Pay button shows only for iPhone users / Google pay shows
for android. mac and windows should have 3 options in the future when Google pay is live"):
Google Pay joins it, and a computer shows both.
Amends nothing: the hosted page stays as the fallback, and every other Checkout is unchanged.

## Context

What was true on 2026-11-16, read from the live Stripe account (MELLOW LIFE PTE. LTD.):

- **Apple Pay was already on.** The default payment method configuration reports
  `apple_pay: { available: true, value: "on" }`, beside `card`, `link` and `paynow`. Shop checkout
  creates a hosted Checkout Session with no `payment_method_types`, so an iPhone or Mac shopper
  already saw Apple Pay — but only on `checkout.stripe.com`, after leaving our site with the
  **Pay with Stripe** button.
- **Google Pay was off** (`google_pay: { available: false, value: "off" }`) although the Staff-order
  payment page says it is accepted. That is a Dashboard setting, not code.
- **Only `checkout.stripe.com` was a registered payment method domain.** A wallet button on our own
  page needs our domain registered in Stripe; Stripe does Apple's merchant validation itself, so
  there is no domain-association file to host and no Apple Merchant ID to create.
- Everything after payment — `checkout.session.completed` / `async_payment_succeeded`,
  `checkout.session.expired`, `reconcileOrderTotal`, the money ledger, points, refunds — reads a
  **Checkout Session**.

## Decision

**The shop cart pays on our checkout page, from the same Checkout Session, created with
`ui_mode: "elements"`.**

1. The shopper fills in the form as before and taps **Continue to payment**.
   `POST /api/shop/checkout` prices and makes the Order exactly as before, then opens the Session
   in `elements` mode with `return_url` = the confirmation page (`{CHECKOUT_SESSION_ID}` and all),
   and returns its `client_secret` instead of a URL.
2. The page swaps the form for the payment step (`app/[lang]/shop/checkout/pay-on-page.tsx`): a
   read-only recap of contact, address and delivery; Stripe's **Express Checkout Element** (Apple
   Pay, Google Pay, Link — only what this device can use) above the **Payment Element** (card,
   PayNow); and **Pay {total}**, where the total is Stripe's own for the Session.
3. Either path confirms the same Session, and Stripe sends the shopper to the confirmation page.
   The Session's line items, metadata, coupon, shipping rate, tax and expiry are byte-for-byte what
   hosted mode sends, so the webhook, reconcile and refunds cannot tell the two apart.
4. **Edit** on the recap calls `POST /api/shop/checkout/release`, which expires the open Session,
   cancels the pending Order and gives back its reserved points at once — what
   `checkout.session.expired` would do within the hour. Without it, a shopper who went back and
   resubmitted with points would be refused for points their own abandoned Order still held.
   The Session id is the capability token, as on the confirmation page.

**It falls back to the hosted page, as before, unless all of these hold:**

- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is set for this deploy (it is inlined at build time), and is
  the same mode as `STRIPE_SECRET_KEY` (`pk_live_` with a live key, `pk_test_` with a test key).
  The server checks this too (`lib/stripe/payment-ui.ts`) and downgrades a request it cannot serve.
- Stripe.js has loaded in this browser before the shopper submits. An on-page Session has no
  hosted URL, so the page only asks for one once it knows it can show it. An ad blocker or a
  dropped script means the hosted page.
- The page asked (`payment_ui: "elements"`). A checkout tab from before this change sends nothing
  and gets the hosted page.

**Turning it on in production:** register the storefront's domain (`custom.mpillow.com`, and the
apex/`www` once the storefront moves there at the Shopify cutover) under Stripe Dashboard →
Settings → Payment method domains, then set `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` on Vercel and
redeploy. Unsetting it and redeploying turns it off. Vercel preview URLs change per deployment and
cannot be registered, so Apple Pay on our page shows only on registered domains; card and PayNow
work on any.

## Wallet buttons beside the checkout button

The payment step above stays as it is. The form also gets wallet buttons beside the checkout
button, so a shopper can pay with one tap without first reaching the payment step.

| Device | Beside the checkout button |
|---|---|
| iPhone | Apple Pay, **Card or PayNow** |
| Android phone | Google Pay, **Card or PayNow** |
| Mac or PC | Apple Pay, Google Pay, **Card or PayNow** |

- **Which wallets show.** On phones and tablets each wallet shows only where it is set up
  (Stripe's `paymentMethods: "auto"`): an iPhone with a card in Wallet gets Apple Pay, an Android
  phone with Google Pay gets Google Pay, and neither shows on the other. On a computer (a mouse or
  trackpad is the main pointer, `(hover: hover) and (pointer: fine)`) both show whether set up or
  not (`"always"`): Apple Pay in Safari, and in Chrome, Edge and Firefox by scanning a code with an
  iPhone; Google Pay in Chrome and Edge, and in Safari and Firefox. Stripe makes "always" a
  condition for both of those cross-browser cases. It is still Stripe's call per browser:
  Stripe's notes say the scan-a-code Apple Pay is not offered on Windows yet, so a PC may show
  Google Pay and card only until it is. The payment step uses the same setting.
- **Google Pay is off until the Dashboard turns it on.** On 2026-11-16 the account's payment method
  configuration had `google_pay` off. Until it is on (Stripe Dashboard → Settings → Payment
  methods → Google Pay), Stripe offers no Google Pay button, so a phone shows Apple Pay or nothing
  and a computer shows Apple Pay and the checkout button. Turning it on needs no deploy. The
  registered payment method domain covers Google Pay as well as Apple Pay.
- **Where they sit.** Apple Pay, Google Pay, then the checkout button, at equal widths: three
  columns inline on a wide screen, two in the phone's sticky bar, which holds one wallet (the one
  the phone has). Each wallet is its own button in its own Elements group
  (`app/[lang]/shop/checkout/wallet-button.tsx`), so the page lays them out itself. Until Stripe
  says a wallet can show, its button sits unseen, so nothing moves on a device without it. Beside
  a wallet, the checkout button reads **Card or PayNow**. Link stays on the payment step.
- **Why they cannot use the Session directly.** A wallet's sheet must open on the tap, and a
  Session-backed Express Checkout Element only exists once the Session does. Making the Order
  every time the form is filled in would leave an abandoned Order for every visitor. So these
  buttons run in Stripe's **deferred mode** (`elements({ mode: "payment", amount, currency,
  paymentMethodCreation: "manual" })`). The sheet shows the page's total, and approving it only
  makes a PaymentMethod.
- **Then the usual path.** After approval the page makes the Order through the same
  `POST /api/shop/checkout` (`payment_ui: "elements"`) and pays its Session with
  `checkout.confirm({ paymentMethod })` (`lib/stripe/wallet.ts`). Stripe documents this as
  confirming with "a previously collected PaymentMethod". Apple Pay and Google Pay both hand over
  a `card` PaymentMethod, so the Session pays the same way for either. Fulfilment, expiry,
  reconcile and refunds still read a Checkout Session. There is no second fulfilment path, which
  is what ruled out Payment Intents above.
- **The amount the shopper approved is the amount charged, or nothing is.** The page's total
  leaves out what only the server prices: exclusive tax, Stripe Tax, a partner's own-purchase
  discount, a price that moved. If the Session's total differs from what the sheet showed, it is
  not confirmed. The shopper lands on the payment step, which shows the real total, with the
  wallets on top, and a line saying nothing was charged.
- **Failures leave nothing behind.** If the sheet hands over no PaymentMethod, nothing was made.
  If the Session will not load or the payment is declined, the Order is closed through
  `/api/shop/checkout/release`, as **Edit** does, and the shopper can tap again or use another
  button.
- **The tap checks the form first.** It is checked exactly as the checkout button checks it, and
  the sheet stays shut while it has errors or another payment is under way. Nothing on the tap
  waits on the network, because Stripe allows one second.

## Considered options

- **Leave it on Stripe's page** — rejected as the whole answer, kept as the fallback. Apple Pay
  works there today, but only after a redirect off our site.
- **Payment Intents with a deferred intent** (the Express Checkout Element shows before any
  server object exists, and the Order is made on confirm) — rejected. It moves shop payment off
  Checkout Sessions: a second fulfilment path in the webhook (`payment_intent.succeeded`), its
  own expiry, its own reconcile, for every order, to save one tap. The amendment above keeps the
  deferred button and drops the Payment Intent: the PaymentMethod it makes pays a Checkout
  Session.
- **Apple Pay sheet collects the address** (express checkout before the form) — not now. Our
  shipping is priced live by Easyship and has no fallback (ADR 0020, 0022), so the sheet would
  have to re-quote on every `shippingaddresschange` within Apple's time limit. Possible later on
  this same Session, with `shipping_address_collection` and `runServerUpdate`.
- **Embedded Checkout** (`ui_mode: "embedded_page"`, Stripe's whole page in an iframe) — rejected:
  it asks again for what our form already took, and its Apple Pay needs Safari 17+.
- **An env flag separate from the publishable key** — rejected. The key is required anyway, and a
  second switch is a second thing that can disagree with it.

## Consequences

- New: `lib/stripe/payment-ui.ts` (server gate), `lib/stripe/browser.ts` (one Stripe.js per page),
  `app/[lang]/shop/checkout/pay-on-page.tsx`, `POST /api/shop/checkout/release`.
  `createCheckoutSession` takes `ui` and returns `clientSecret`.
- New dependencies: `@stripe/stripe-js`, `@stripe/react-stripe-js` (the payment step is loaded
  only when the shopper reaches it).
- The checkout button reads **Continue to payment** when the step is on this page, and **Pay with
  Stripe** when it is not. Beside a wallet button it reads **Card or PayNow**.
- Amendments: `app/[lang]/shop/checkout/wallet-button.tsx` and `lib/stripe/wallet.ts`. No
  server change.
- New Order timeline event `checkout_released`.
- Unchanged: Staff-order payment links, Result holds and top-ups, Re-adjustment Checkouts. They
  stay on the hosted page, where Apple Pay already shows.
