# Easyship setup

How to switch on live shipping rates and labels (ADR 0020). Nothing changes for shoppers until
step 6: until then every shipping method charges its flat rate, as before.

## 1. Apply the migration

`supabase/migrations/20261002090000_easyship_shipping.sql` adds the method columns,
`shipping_settings`, `shipping_rate_quotes`, `order_shipments` and two customer-safe order columns.
It is additive. Apply it **before or with** the code deploy: checkout keeps working either way, but
the method editor saves the new columns and fails until they exist.

```bash
pnpm db:push
```

## 2. Create the Easyship account and tokens

1. Sign up at easyship.com with a **Singapore** company address (that makes SGD the account
   currency, which is what the store charges in).
2. In **Connect → API Integrations**, create an integration and generate:
   - a **sandbox** token (`sand_…`) — use this first;
   - later, a **production** token (`prod_…`).
3. Add a payment method in Easyship (labels are charged to the Easyship account).

## 3. Set the environment variables (Vercel → Project → Settings → Environment Variables)

| Variable | Value |
| --- | --- |
| `EASYSHIP_API_TOKEN` | the `sand_…` token to start, the `prod_…` token when going live |
| `EASYSHIP_WEBHOOK_SECRET` | from step 4 |

Redeploy after changing them.

## 4. Register the webhook

In Easyship **Connect → API Integrations → Webhooks**, add the URL shown in
**Settings → Shipping → Easyship** (`https://<your site>/api/shipping/easyship/webhook`), subscribed
to `shipment.label.created`, `shipment.label.failed` and `shipment.tracking.status.changed`. Copy its
secret into `EASYSHIP_WEBHOOK_SECRET`.

## 5. Fill in Settings → Shipping → Easyship

1. **Ship-from address** — where couriers collect. Every starred field is required.
2. **Packaging** — measure the real packed box for a pillow, a bolster and an accessory. The page
   shows the volumetric weight couriers will bill; a smaller box is the biggest saving available.
3. **Customs & quotes** — DDU (receiver pays duties) is the default; HS code 940490 covers
   pillows; handling days are added to courier transit times shown to shoppers.
4. Save, then use **Test a quote** with a Singapore and a Malaysian postal code. Note the couriers
   and costs. Copy a courier service id if you want to pin one to a method.

## 6. Turn methods live

1. In **Settings → Shipping → Methods**, edit a method (or add one, e.g. "Express") and set
   **Pricing → Live rate (Easyship)**. Choose the courier strategy, markup and rounding. Keep a
   sensible **Fallback rate** — it is charged if Easyship is unreachable.
2. Back in the **Easyship** tab, switch on **Live rates for shoppers** and save.
3. Check the storefront: the checkout shows a live rate with courier and delivery time once a postal
   code is entered; the cart, the product page and the shipping policy page have a delivery
   checker; a **Delivery Estimator** section can be added to the landing page from the page
   builder (Settings → Page builder → Add section).

## 7. Buy a label (sandbox first)

On a paid order in **Settings → Orders**, use **Ship with Easyship**. The customer's courier is
preselected with today's price. **Buy label** creates the shipment; once tracking exists the order is
marked shipped and the customer emailed. Delivery events from the courier mark it delivered.

Do one full sandbox order end to end — rate at checkout, label, webhook — before swapping in the
production token. Easyship's API field names have moved between versions; the code reads both the
2024-09 and 2023-01 shapes, and `EASYSHIP_API_VERSION` pins one if needed.

## Not covered yet

- Customised builds (Results) still charge the method's flat/fallback rate at the hold — see
  ADR 0020, Consequences.
- `order_margins` does not subtract the courier cost yet; it is recorded in `order_shipments`.
