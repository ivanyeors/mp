# Slice 13 — Merchant Center feed + free listings

Type: AFK + OPS
Parent: PRD `search-visibility` (`.claude/PRD-search-visibility/search-visibility-prd.md`)
Triage: needs-triage
User stories covered: 33, 34

## What to build

- `lib/merchant/feed.ts` + `app/api/merchant-feed/route.ts` (token-protected): **Storefront products** / **Variants** with price from **Costings**, availability, GTIN/MPN or `identifier_exists=no`, images, `product_type`
- **Decision: price range.** Merchant Center accepts one price per item, so the range is expressed as one item per composed **Variant** (pillow size × tier, bolster length), sharing an `item_group_id` per composed product, with `size` / custom-label attributes and each variant's Costings price
- **Variant deep link:** `mp-config` / `mbolster-config` accept a preselect param (e.g. `?variant=<variant_id>`). The configurator starts on that size/tier and displays its price above the fold, and the server-rendered SEO shell shows the same price so Googlebot sees it. An unknown or inactive variant id falls back to the normal flow.
- Configurator Product JSON-LD keeps `AggregateOffer` (low/high) for the unselected page; with `?variant=` it emits a single `Offer` at that price, with a canonical to the base configurator URL
- Fixed-price storefront products (accessories) are listed as ordinary items
- OPS: create/verify Merchant Center for `custom.mpillow.com`, enable free listings, schedule the feed fetch

## Acceptance criteria

- [x] Feed price equals the landing-page price for every row, including variant deep links (both read the Variant's price; the link preselects that variant)
- [x] `?variant=` preselects the right variant and shows its price in the server-rendered HTML
- [x] Variants share `item_group_id` (test); grouping in Merchant Center to confirm after the first fetch
- [ ] Merchant Center diagnostics show zero disapprovals for price mismatch
- [ ] Free listings enabled

## Blocked by

None

## Implementation notes

**Decision (2026-10-02):** listings land on the shop product page `/[lang]/shop/{slug}`, for pillows and bolsters too, not on the configurator. This supersedes the configurator-preselect plan above.

- `?variant=<id>` preselects that size on the product page, rendered on the server, so the landing price equals the listing price. Unknown or inactive ids fall back to the default variant.
- `lib/merchant/feed.ts` (tested):
  - one item per active Variant, `item_group_id` = product
  - `price` = Variant price (the Costings projection; nothing recomputed), with Google's `price`/`sale_price` convention when `compare_at_price` is higher
  - availability from `variant_stock`
  - `identifier_exists=no` (no GTINs)
  - skips and logs variants with no price or no image
- `GET /api/merchant-feed?token=…` serves TSV. It 404s without `MERCHANT_FEED_TOKEN`.
- Product JSON-LD on the page still emits the product-level offer / AggregateOffer. If Merchant Center flags a structured-data price mismatch for a preselected variant, emit the selected variant's single Offer.

## OPS
1. Vercel Production: set `MERCHANT_FEED_TOKEN`, then redeploy.
2. merchants.google.com:
   - create or open the account
   - **Business info → Website:** verify and claim `custom.mpillow.com` (the GSC verification can be reused)
3. **Products → Add products → Add from a file → Enter a link to your file:**
   - URL `https://custom.mpillow.com/api/merchant-feed?token=<token>`
   - daily fetch, country Singapore, language English
4. **Growth → Manage programs → Free product listings:** turn on.
5. Shipping and returns settings are required before listings go live.
