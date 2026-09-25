# GA4 setup runbook — custom.mpillow.com

Parent: Slice 08 (`issues/08-ga4-crosscheck.md`)
Decision (Sep 2026): there is no confirmed GA4 property for `custom.mpillow.com`, so we create a new one. The legacy Shopify GTM container (`GTM-TPB9LV2`) is audited, then retired.

**Why load GA4 directly (gtag) instead of through GTM:** the code already supports it (`components/seo/google-analytics.tsx`, env `NEXT_PUBLIC_GA_MEASUREMENT_ID`). It also avoids depending on a container nobody here maintains, whose tags come from the Shopify era.

## 1. Create the property (Google Analytics UI, ~10 min)

Owner: someone with admin on the company Google account.

- [ ] analytics.google.com → Admin → **Create → Property**
  - Name: `Mpillow — custom.mpillow.com`
  - Time zone: **Singapore (GMT+8)**; currency: **SGD**
  - Industry: Home & Garden; business size: Small; objectives: "Generate leads" + "Drive online sales"
- [ ] **Data stream → Web**: URL `https://custom.mpillow.com`, name `custom.mpillow.com`
  - Keep **Enhanced measurement** ON. Under its ⚙: **Page views → "Page changes based on browser history events" ON**. This is required because Next.js navigates client-side.
- [ ] Copy the **Measurement ID** (`G-XXXXXXXXXX`)

## 2. Property settings (same session)

- [ ] Admin → Data collection and modification → **Data retention** → Event data: **14 months** (the default is 2, which breaks year-over-year explorations)
- [ ] Data streams → stream → Configure tag settings → **List unwanted referrals**:
  - `checkout.stripe.com`
  - `hooks.stripe.com`
  - any PayNow/bank redirect host seen in `analytics_visits.referrer_host`

  Without these, paid orders get credited to Stripe instead of the channel the buyer really came from.
- [ ] Configure tag settings → **Define internal traffic**: add each store Location's public IP (traffic_type = internal). Then Admin → Data filters → set the Internal Traffic filter to **Active**. Without this, counter and staff sessions inflate the numbers.
- [ ] Admin → Product links → **Search Console links** → link the `custom.mpillow.com` property. This adds GA4's Search Console reports.
- [ ] Admin → Data display → **Channel groups → Create new** from the default, name it `Default + AI`:
  - Add channel **AI assistant**: Source matches regex `.*(chatgpt|openai|perplexity|claude|gemini|copilot|edgeservices|deepseek|grok|meta\.ai).*`
  - Drag it **above Referral**; save

  GA4's built-in AI Assistant channel (May 2026) misses Perplexity and is not retroactive.
- [ ] Admin → Property access management → add the service account from slice 01 as **Viewer** (for the Data API ingest)
- [ ] Note the **Property ID** (numeric, Admin → Property details) → env `GA4_PROPERTY_ID`

## 3. Turn it on in production (Vercel)

- [ ] Vercel → project → Settings → Environment Variables → Production:
  - `NEXT_PUBLIC_GA_MEASUREMENT_ID = G-XXXXXXXXXX`
  - `GA4_PROPERTY_ID = <numeric id>` (server-only; slice 08 ingest)
- [ ] **Audit GTM before redeploying.** In tagmanager.google.com open `GTM-TPB9LV2` → Tags. Pause any GA4 / Universal Analytics / Google tag, or any Shopify-specific tag. If nothing else in the container is needed (e.g. a Meta pixel), **remove `NEXT_PUBLIC_GTM_ID`** from Vercel so the container stops loading. Running both a GA4 tag inside GTM and direct gtag double-counts page views.
- [ ] Redeploy production (env changes only apply to new deployments)

## 4. Verify (~15 min after deploy)

- [ ] GA4 → Reports → **Realtime**: open the site on your phone and see yourself. Navigate between pages and confirm each client-side page change registers as a new page_view.
- [ ] Browser devtools → Network → filter `collect?v=2`: exactly **one** hit per page view (two means GTM is still firing a GA tag)
- [ ] Place a test that triggers each key event (section 5) and confirm it under Admin → **DebugView** (add `?gtm_debug=x` or use the Tag Assistant extension)
- [ ] After 24–48h: Reports → Acquisition → Traffic acquisition, switched to the `Default + AI` channel group

## 5. Key events (needs the code change in slice 08)

The journey tracker pushes `{ event: "mp_page_view" }` / `mp_section_view` objects into `dataLayer`. That format is only read by **GTM**. gtag loaded directly ignores it, so conversions must be sent with `gtag('event', …)`. After the code lands, mark these as **Key events** in Admin → Events:

| GA4 event | Fired when | Params |
|-----------|-----------|--------|
| `generate_lead` | A **Result** is submitted from mp-config / mbolster-config | `product_type`, `value` (quoted price if known), `currency: SGD` |
| `book_appointment` | An appointment booking is confirmed | `location` |
| `begin_checkout` | Checkout starts (storefront cart or Result payment) | `value`, `currency`, `items` |
| `purchase` | An **Order** is paid (fired on the confirmation page, once, deduplicated by `transaction_id`) | `transaction_id` = order id, `value`, `currency`, `items` |

Rules: never send email, phone or name as event params (Google policy + PDPA). Values come from the Order total or the Costings price, never recomputed client-side.

## 6. Retire the old setup (after 2 weeks of clean data)

- [ ] Remove `NEXT_PUBLIC_GTM_ID` from Vercel Production/Preview (if not already)
- [ ] Update `.env.example` and `PRD-seo-aeo-geo/OPS-CHECKLIST.md` (Analytics section) to reference the new property
- [ ] Add an `seo_annotations` row: "GA4 property live", so charts show where GA4 data starts
