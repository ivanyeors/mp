# Slice 08 — Sign-off runbook: one real link, one real card, one real order

Parent: PRD `staff-assisted-customisation` · checklist of record: `issues/08-signoff.md`
ADR: `docs/adr/0016-deferred-payment-for-assisted-builds.md`
Code under test: merged to `main` as `e3e5148d` (PR #129)

Fill in the result table at the bottom. Six acceptance criteria across slices 02,
06 and 07 are marked `[~]` precisely because only this pass can close them.

---

## 0. Where to run it — decide this first, it is not a free choice

**Run it locally against `next dev`, with `stripe listen`.** Two hard reasons:

1. `/stripe-test` and `/api/stripe/test-checkout` return **404 when
   `NODE_ENV === "production"`** (`app/api/stripe/test-checkout/route.ts:18`). A
   Vercel preview runs as production, so the probe that proves you are on test keys
   is unavailable there.
2. **The closed-tab branch needs the webhook.** Stripe's configured endpoint points
   at the production URL, so on a preview deployment `checkout.session.completed`
   never reaches the code under test and step 9 cannot pass. `stripe listen` is the
   only way to get it locally.

**Do not run this on production.** There is one `STRIPE_SECRET_KEY` and production
holds live keys — every step below would charge a real card.

## 1. Pre-flight (stop if any of these fail)

| # | Check | How |
|---|---|---|
| 1.1 | Test keys | `npm run dev`, open `http://localhost:3000/stripe-test`. Must report `secretMode: test`, `publishableMode: test`, `readyForTestCards: true`. If it 404s you are not in dev. |
| 1.2 | Webhook forwarding | `npm run stripe:listen` in a second terminal. Copy the `whsec_…` it prints into `STRIPE_WEBHOOK_SECRET` in `.env.local`, then **restart `next dev`**. Re-check `/stripe-test` shows `webhookSecretSet: true`. |
| 1.3 | Shipping exists | Admin Panel → Settings → Shipping has at least one **active** method, or the preview renders "No shipping methods available" and you cannot submit. |
| 1.4 | Your role | Your `admin_users` row must hold the `results` permission — `owner`, `admin`, `manager` or `staff`. **`viewer` cannot enter assist mode or mint a link.** |
| 1.5 | Handset reachability | Find your LAN IP (`ipconfig getifaddr en0`). Open `http://<LAN-IP>:3000` on the phone. In dev, `getClientSiteOrigin()` returns `window.location.origin`, so a link copied from a browser on that host carries the LAN host automatically — **do not** set `NEXT_PUBLIC_SITE_URL`. |
| 1.6 | Premium only | Use `/mp-config`. `/mp-basic` re-exports the same page so `?assist=` works there too, but basic is out of scope — do not sign it off. |

## 2. The pass

**Laptop, as Staff.**

1. **Mint and copy the link.** Admin Panel → **Results**. The assist card sits under
   the page header, collapsed. Click **Show my link** (this is the lazy mint — the
   code is generated on first reveal). Confirm a link of the form
   `http://<LAN-IP>:3000/mp-config?assist=<CODE>` plus a QR.

**Phone, as the customer.**

2. **Scan the QR** off the laptop screen. Confirm the configurator opens and that
   there is **no assist chrome**: no tool rail, no x-ray editor, no staff panel.
3. **Complete the flow**: every measurement question, a cover, a case, one **Add-on**,
   contact details, a **Discovery source**, address, shipping method. If a
   basic→premium **Upsell card** appears you must Accept or Decline it — the submit
   refuses while a **Flow route** is unresolved.
4. **Check the preview footer.** Primary CTA reads **"Send to our build team"**. No
   card fields. **"Save without purchasing" must be absent.**
5. **Submit.** You land on `/results/<id>?token=…` reading **"Measurements received"**
   — not "Pending review", and with no mention of an authorization or a hold.
6. **Check the inbox.** Subject *"We've received your Mpillow measurements"*. It must
   contain **no amount panel** and no word about a charge. Its button opens the
   status page.
7. **Create an account** from the "Sign up / sign in" card on that page. After the
   magic link, confirm the **token survives** the round trip and the Result appears
   in the account list.

**Laptop, as Staff.**

8. **Queue.** The Result appears under **Needs assign** — *not* **Stuck** — badged
   **Assisted**. (This is `resultStage()`'s new branch; a wrong answer here means
   `source` was not stamped.)
9. **Build it.** Open the Result → Assignment card → pick size × tier → compose a
   filling mix in the **x-ray editor** → **Save assignment**.
10. **Check the priced email.** Subject *"Your final build is ready — payment due"*,
    showing the full total, with a **Review and pay** button. Press **Request payment**
    on the Result and confirm it copies a link that opens the same page, and that
    pressing it twice sends a second email and changes nothing.

**Phone, as the customer — the two branches most likely to break.**

11. **The cancel branch.** Press **Pay SGD …** → at Stripe Checkout press **back/cancel**.
    You must return to a status page where the build is **still payable** and nothing
    was charged.
12. **Pay.** Press **Pay** again, card `4242 4242 4242 4242`, any future expiry, any
    CVC. Status page must reach **"In production"**.

**A second Result, for the branch the webhook exists for.**

13. Repeat steps 1–10 on a fresh link, then at Stripe Checkout **complete the payment
    and close the tab before the redirect**. Reopen the status page from the email.
    The Result must settle into an **Order** with **exactly one** charge — not two,
    not zero.

**Laptop — the Order.**

14. Run the SQL in §3. Then Admin Panel → Orders → the new order → **Mark as Shipped**
    (a tracking number is required) → then move it to **delivered**. Confirm
    `delivered_at` is stamped at delivery, **not** at payment.

**Refusals.**

15. From a second browser holding **only the Result id** (no token, not signed in):
    the status read, Accept and Decline must all refuse.
16. Confirm a `deferred` submit against a Result that is not assisted is refused:
    ```bash
    curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/results/hold \
      -H 'content-type: application/json' \
      -d '{"deferred":true,"responseId":"<any NON-assisted Result id>","email":"a@b.com","phone":"91234567","discoverySource":"friend","productType":"pillow","suggestedSize":"M","suggestedTier":"premium","preferenceLines":[{"item_id":1,"quantity":1,"category":"cover"}],"addonLines":[],"shippingMethodId":"<id>","shippingAddress":{"line1":"x","city":"x","postal_code":"1","country":"SG"}}'
    ```
    Expect **403**. A 200 is a security failure — stop and report it.

## 3. Verification SQL

```sql
-- The assisted Results you just made.
select id, status, source, assisted_by_admin_id, payment_intent_id,
       authorized_amount, final_amount, order_id
from mp_config_responses
where source = 'staff_assisted'
order by created_at desc limit 5;
-- Expect: status 'captured', payment_intent_id NULL, authorized_amount NULL,
--         final_amount set, order_id set.

-- The Order it became.
select o.id, o.order_number, o.status, o.paid_at, o.delivered_at,
       o.total, o.amount_captured, o.payment_reference, o.needs_attention
from orders o
join mp_config_responses r on r.order_id = o.id
where r.source = 'staff_assisted'
order by o.created_at desc limit 5;
-- Expect: status 'confirmed' and delivered_at NULL immediately after payment
--         (NOT 'delivered' — that would mean inStoreHandover misfired),
--         amount_captured = total, needs_attention false,
--         payment_reference = the balance intent (pi_…).

-- The ledger. THE row that matters.
select type, amount, currency, stripe_object_id
from order_payments where order_id = '<order id>' order by created_at;
-- Expect EXACTLY ONE row: type 'charge', amount = total, stripe_object_id = the
-- balance intent. A second row, or a zero-amount row, breaks the refund ceiling.

-- The build snapshot travelled.
select sku, unit_price, total_cost,
       customization_snapshot->>'filling_template_name' as template,
       jsonb_array_length(customization_snapshot->'filling_placements') as placements
from order_items where order_id = '<order id>';
-- Expect placements > 0 — the mix you composed in the x-ray.

-- Inventory deducted once, not twice, not never.
select item_id, sum(quantity_signed) as net
from inventory_transactions
where metadata->>'result_id' = '<result id>'
group by item_id order by item_id;
```

## 4. Results

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1.1–1.6 | Pre-flight | | |
| 2 | Link holder sees no assist chrome | | |
| 4 | CTA is "Send to our build team"; no card; no "Save without purchasing" | | |
| 5–6 | Waiting page + confirmation email mention no charge | | |
| 7 | Account creation keeps the token; Result appears in the list | | |
| 8 | Needs assign, badged Assisted, not Stuck | | |
| 10 | Priced email with correct total; Request payment idempotent | | |
| 11 | Cancel branch returns still-payable, nothing charged | | |
| 12 | Payment completes; status "In production" | | |
| 13 | Closed-tab branch settles with exactly one charge | | |
| 14 | Order `confirmed`, snapshot present, ledger balances, inventory once | | |
| 14 | Ship + deliver; `delivered_at` at delivery, not payment | | |
| 15 | Second browser refused on read, accept, decline | | |
| 16 | Non-assisted `deferred` submit → 403 | | |

**Also worth a look, because it is a live change to an existing flow:** any Result
reaching assign with a customer email and token now gets the "final build ready"
email, including in-store `manual` ones that previously got none (ADR 0016, intended).
Assign one in-store measurement Result and confirm the email reads sensibly.

**Found during sign-off:**

**Residual:**

---

**Not part of this pass.** `PRD-staff-assist-spatial-fillings` slice 14's catalog
save path (`POST /api/mp-config/assist`, `mode: "overwrite" | "new"`) has still never
run against a real database. It wants a live DB on the same afternoon and is easy to
sweep in — it belongs to that slice's sign-off. Do not record it here.
