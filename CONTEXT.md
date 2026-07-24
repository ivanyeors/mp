# Mpillow (mp)

Inventory-backed catalog and storefront for custom pillows, bolsters, and accessories. Costings is the single source of sell price; storefront products are a projection of inventory.

## Language

**Item**:
An atomic inventory part (cover, filling, case, packaging, accessory, etc.) with optional cost and MSRP in Costings.
_Avoid_: SKU (ambiguous with storefront variant SKU), part (when you mean the sellable finished good)

**Sellable item**:
An **Item** with an MSRP set in Costings (`item_prices.msrp` not null). Eligible to be published as a single-item storefront product.
_Avoid_: accessory (category only — sellability is signalled by MSRP, not category)

**Composed sellable**:
A pillow (`pillow_products`, size × **tier**) or bolster (`bolster_bom_lines`, short/medium/long **length**) built from a BOM of **Items**. Finished-good MSRP lives in `product_prices`. Existing DB columns may still be named `kind` / `pillow_kind`; human-facing language uses **tier**.
_Avoid_: product (when you mean the inventory BOM template, not the storefront listing)

**Tier**:
`basic` | `premium` for pillows. Bolsters use **length** only (short/medium/long), not tier. Protector (and related non-filling defaults) live on the **Composed sellable** and separate tiers — not a **Customer preference**.
_Avoid_: kind

**Storefront product**:
A shop listing (`products` + `product_variants`). A projection of inventory: auto-generated from pillows/bolsters or published from a **Sellable item**. When `is_auto_generated`, price/cost/compare-at are Costings-derived and locked.
_Avoid_: listing, SKU (use **Variant** for the priced unit)

**Variant**:
A priced, stocked unit of a **Storefront product**, linked to inventory via `item_id`, `pillow_product_id`, and/or `price_key`.
_Avoid_: option (UI option values are not the variant itself)

**Costings**:
The single write surface for item and product prices: cost, MSRP, and compare-at (`item_prices`, `product_prices`).
_Avoid_: pricing page, product editor (those only display mirrors)

**MSRP**:
The authoritative sell price set in **Costings**. Mirrored to `product_variants.price` and Stripe.
_Avoid_: price (when you mean the editable source — use MSRP), list price

**Legacy product**:
A **Storefront product** that is not inventory-linked (`is_auto_generated = false` and no costing link on variants). Hand-editable; should be adopted or retired.

**Result**:
A customisation submission with optional **Authorization hold** and operator assignment. After assignment it links to a **Composed sellable** (size×tier or length) and a **Filling Template**. Accepted Results become an **Order** after successful payment capture (when a hold exists).

**Discovery source**:
The visitor’s answer to “How did you hear about us?” captured on configurator preview (mp-config, mp-basic, mbolster-config) and required for authorize / in-store save. Stored on the **Result** as a stable option id (plus free text when Other). Operators edit the bilingual option list under Landing Site → **Forms** — option-list editing only, not a customization-steps CMS.
_Avoid_: referral, referral source, lead source (partner/voucher collision); **Customer preference**; **Add-on**; conflating with **Entry source**

**Visitor**:
A long-lived anonymous browser identity for journey analytics, distinct from **Customer** until a deterministic link (email or **Customer**) merges them.
_Avoid_: Customer (shopper Sign-in identity); session id; device fingerprint as identity; Customer journey (Appointment collision)

**Visit**:
One continuous browsing session for a **Visitor**, bounded by inactivity or tab close, with a frozen **Entry source** and optional **Drop-off**.
_Avoid_: session (generic); conflating with **Appointment**

**Prospect**:
A **Visitor** who has not yet produced a paid **Order**.
_Avoid_: lead; anonymous user (prefer **Visitor**); treating converters as the default Analytics cohort

**Entry source**:
Machine-captured traffic origin at **Visit** start: UTM when present, else referrer host, else Direct.
_Avoid_: **Discovery source** (self-reported on **Result**); referral source; campaign (when you mean the full Entry source)

**Drop-off**:
The end of a **Visit** without conversion: last page, last section when known, and dwell — not a surveyed reason.
_Avoid_: bounce (too narrow); exit intent; “why they left” as captured fact

**Filling Template**:
A named, size-scoped filling recipe in the **Admin Panel** (Configure) catalog for **Mpillow** (and bolster where applicable). One template = all nine **cells** (**Section** × **sub-section**) as a single recipe. The persisted model must record **where** each filling **Item** goes (**Section** + **sub-section** + order within the cell) — not only a flat item list. A flat BOM projection (summed `item_id × count` across cells) is derived for stock/COGS display. A **Composed sellable** may designate one active template as its **Default Filling Template**. **Staff assist mode** may load and mutate a template’s mix for the live session, but must not create a catalog **Filling Template** from the configurator — create and **Promote** happen only in the **Admin Panel**. Every filling line must reference an inventory **Item** (no free-text shapes). Fillings never come from guest customer input or from raw filling lines on the composed sellable BOM. Affects COGS and fulfillment, not sell price.

**Filling configuration**:
The concrete spatial mix used on one customisation (**Result** / assist session): all **cells** with their filling **Item** lines. May start from a **Filling Template** and diverge. When present on a **Result**, it is a full spatial snapshot (fulfillment + analytics truth). Optionally also stores `filling_template_id` when the snapshot still exactly matches a catalog **Filling Template**. Analytics fingerprints are derived from the snapshot. Written at hold create when **Staff assist mode** supplied a mix; otherwise first written when **Staff** assigns in the **Admin Panel**. **Staff** may revise it in the Admin Panel after hold and send the updated build to the shopper. On shopper **Accept** or **Decline**, the **Result** retains that snapshot for records (Decline does not Stripe-capture payment — “capture” here means persist the mix, not charge the card).

**Unpromoted configuration**:
A **Filling configuration** (or equivalent recipe fingerprint) that has been used on one or more **Results** but is not yet a catalog **Filling Template**. Analytics ranks these by usage so **Staff** can **Promote** the highest ones into permanent templates.

**Promote** (fillings):
Staff action in the **Admin Panel** that turns an **Unpromoted configuration** into a named catalog **Filling Template**. Not available on the storefront configurator in v1.

**Placement** (pillow fillings):
One persisted filling piece in a **Filling Template** or **Filling configuration** snapshot: inventory `item_id` + **Section** + **sub-section** + slot (1–5). Source of truth for “where.” The pack list is derived by aggregating **Placements** — never an independently edited filling BOM, and never stored on a **Warehouse template**.

**Section** (pillow fillings):
One of the three vertical compartments of an **Mpillow**: `left` | `center` | `right`. Side-sleep support lives in left/right; back-sleep support in center. **Mbolster** does not use this enum — it has its own spatial schema (single long compartment, no piece cap in v1); only the filling **Items** come from the same inventory.
_Avoid_: “middle section” for the column (use **center**); **Filling section** as a longer synonym — prefer **Section** in this grid; conflating with **sub-section**; reusing the Mpillow section/sub-section enums for **Mbolster**

**sub-section** (pillow fillings):
One of the three bands inside a **Section**: `front` | `middle` | `back`. Together with **Section**, forms a 3×3 grid of **cells**. Canonical ids match the existing LLM model API (`front`, not `top`).
_Avoid_: “top” for this band; using “middle” alone without saying **Section** vs **sub-section**

**cell** (pillow fillings):
The addressable slot at one **Section** × **sub-section** (9 cells on **Mpillow**). Holds an ordered list of filling **Item** pieces chosen from inventory (add/remove in assist or Configure). UI starts with one piece slot; Staff may add more as needed. Cap: **at most 5 filling pieces per cell** (v1); the same **Item** may repeat (e.g. five × 6D Small in one **sub-section**). Empty cells allowed. Each piece is one inventory-linked unit (qty 1 per row); stock/COGS flatten by summing identical `item_id`s across all cells — spatial columns remain the source of truth for placement.

**Default Filling Template**:
The baseline filling mix for one Configure product card (e.g. Basic Size S, Premium Size M, Bolster medium). Stored on that **Composed sellable**, not on a warehouse preset name. Shown as a hint at assignment; the operator must actively confirm or override. Changing assigned size×tier (or length) on a **Result** clears any filling selection and reloads the hint for the new product card.

**Customer preference**:
Shopper-chosen **Item**s on a customisation preview. **Mpillow** (full/basic): cover and case only. **Mbolster**: case only (`bolster_case`) — no cover category in inventory or Configure for bolsters. When exactly one eligible case is available to choose, the preview auto-selects it. Protector (`pillow_protector` / `bolster_protector`) is owned on the **Composed sellable** BOM, not a preference.
_Avoid_: showing a Cover Style picker on mbolster-config; treating bolster protector as a shopper choice

**Add-on**:
An accessory (or optional extra) line at item **MSRP**, chosen during customisation. Preview cards use the **Item**’s primary **Media Asset** image (not **Product Builder** overlays).

**Authorization hold**:
An uncaptured Stripe payment for the ballpark total (composed sellable **MSRP** + preference/add-on **MSRP**s + shipping + tax). Card details are taken; charge happens only on Accept (or via top-up if the final total exceeds the hold).

**Pre-order**:
A customise-preview fulfillment mode when immediate build is not possible from current inventory: a required **Customer preference** line has `stock_available <= 0` (Mpillow: cover or case; Mbolster: case), **or** the recommended **Composed sellable** (size×tier / length) has buildable `<= 0`. Applies to **Mpillow** (full/basic) and **Mbolster**.

- **Live preview CTA:** recomputed from current inventory. When trigger is false, new shoppers see the normal hold CTA (e.g. Proceed) — not Pre-order. When true, CTA + waiting-time section use Pre-order copy (fixed i18n in v1). Waiting body tells the shopper **Staff will reach out shortly via WhatsApp** (not a numeric ETA; not CMS-edited in v1).
- **Persisted Result mode:** at hold create, if the shopper submitted under Pre-order, the **Result** keeps that mode (sticky for that submission).
- **Restock notice:** when inventory recovers enough that the Pre-order trigger would clear, open Pre-order **Results** in status **`held`** or **`assigned`** are **automatically** emailed that stock is back and they can Sign in in a few days to track customisation (**Result**) status (idempotent; skip expired/declined/captured/canceled; no Staff-triggered send in v1). New sessions on the configurator flip back to the normal hold CTA. (Restock channel remains email unless separately changed; preview waiting promise is WhatsApp outreach.)

Same money path: hold → **Result** → assign → Accept → capture → **Order**; no separate Pre-order queue in v1.
_Avoid_: conflating soft “low stock” badges with Pre-order; calling the held **Result** an **Order** before Accept + capture; “Purchase” as the hold CTA (payment is still an **Authorization hold**); UI-only Pre-order that vanishes after Stripe; bolster-only rules; CMS editing of waiting-time copy in v1; manual restock notice as the v1 path; inventing a per-SKU ETA field in v1

**Appointment**:
A scheduled in-store Customisation or Re-adjustment session booked via Google Appointment Scheduling (Calendar Events on `admin@mpillow.com`).
_Avoid_: Order, Result, Customer journey (appointments are not linked to Orders in v1)

**Appointment reminder**:
A WhatsApp utility message for an **Appointment** — day-before Confirm/Reschedule, optional morning-of nudge, or cancel + rebook link.
_Avoid_: Result SLA reminder (operator-facing held-Result reminders)

**Customisation appointment**:
An **Appointment** for first-time pillow/bolster customisation; type inferred from calendar event summary match strings.
_Avoid_: mp-config **Result** (digital submission flow)

**Re-adjustment appointment**:
An **Appointment** for post-purchase fitting/adjustment; type inferred from calendar event summary match strings.

**Sign in**:
The unified authentication entry at `/account/login`. Guests start here; role (**Staff** vs **Customer**) is decided after the session exists, not by picking a separate staff login URL.
_Avoid_: “Staff sign in” as a separate customer-facing door; splitting shopper and staff onto different auth pages for v1

**Admin Panel**:
The staff back office under `/settings`. User-facing name for that surface.
_Avoid_: Settings (as the product name for this surface — keep the `/settings` URL path)

**Profile**:
The signed-in **Customer** account entry from the storefront Menu pill (opens `/account`). Not a separate dock icon.
_Avoid_: adding a second Profile control on the landing dock

**Staff**:
An authorized back-office actor: active row in `admin_users`, or bootstrap allowlist. Shares the same Supabase session as a possible **Customer** record; when both apply, **Staff** wins for Menu chrome.
_Avoid_: treating every signed-in user as staff; calling the back office “Settings” in UI copy; saying “admin” in product language when you mean **Staff**

**Staff assist mode**:
Extra configuration controls on the customisation preview (**Your Custom Mpillow** / parallel bolster preview) that appear only when **Staff** is signed in. Used on a shared in-store device — the shopper uses Staff’s device; no separate customer session or multi-device sync. Guests (no **Staff** session) see the normal preview with no filling editors — cover/case/**Add-on** flow unchanged. Layout: **left** = pillow silhouette (cover/case overlays + selected **Add-on** preview images under it) and, when Staff, the **x-ray filling editor**; **right** = shopper controls including **Add-on** selection, cover, case, contact, discovery, shipping, hold CTA.
_Avoid_: co-browse / remote assist; requiring a **Customer** Sign-in for in-store customisation; duplicating this editor as a third surface beyond preview + **Result** assign; showing assist chrome to non-Staff; moving **Add-on** *selection* off the right rail (left only *previews* selected add-ons)

**X-ray filling editor**:
Staff-only left-column interaction on the pillow silhouette: an “x-ray” / cutaway art direction that reveals internal **Sections**. Hover highlights the three **Sections**; click dives into that section’s **sub-sections** to add/remove inventory filling **Placements** (max 5 per **cell**). Not shown to guests.
_Avoid_: treating this as a shopper-facing game; requiring WebGL/3D unless research proves 2D SVG insufficient

**Customer**:
A shopper account identity after Sign in when the session is not **Staff**. Menu pill → **Profile**; logout lives in account UI, not the landing Menu.
_Avoid_: conflating with **Customer preference** (cover/case choices only)

**Order**:
A paid platform sale in our DB (post Accept + capture when a hold existed). Analytics sales windows for platform **Orders** use **`paid_at`**, not `created_at`. Unpaid checkouts are outside realized margin.
_Avoid_: calling a held **Result** an **Order**; using `created_at` for Analytics sold-margin windows

**Analytics channel**:
Admin Panel → Analytics view filter: `all` | `orders` | `shopify`. **All** = paid platform **Orders** ∪ **Shopify order mirror** for the same date range. In-store inventory sells without an **Order** are not a revenue channel. Accepted **Results** count only via the **Order** they become.
_Avoid_: live Shopify Admin API reads from the Analytics page; a third “in-store sell” toggle in v1

**Shopify order mirror**:
Durable DB finance facts for Shopify paid sales (orders, lines, refunds, sync cursor). Source for Analytics Shopify / All’s Shopify half. Distinct from `shopify_sales_queue` (ops inventory commit). Shopify Admin API is ingest-only (webhook + catch-up); Analytics reads the mirror only.
_Avoid_: merging mirror tables/jobs with the sales queue; treating live API list price × qty as P&L truth

**Others**:
Unmapped or uncosted **Shopify order mirror** lines. Revenue and units still count; COGS is zero/unknown until Staff fixes mapping or **Costings** and re-resolve graduates the line. Freeze-at-sale: healthy already-costed lines are not rewritten on every Costings edit.
_Avoid_: dropping unmapped lines from totals; silently understating Shopify sales

## Rules Engine (recommendations)

**Rules Engine**:
The single recommendation authority: a Staff-authored node workbench (entry point inside **Product Builder**) whose published **Rule graphs** derive every measurement → size / tier-suggestion / **Filling Template** recommendation. See ADR `docs/adr/0010-rules-engine-single-recommendation-authority.md`.
_Avoid_: hardcoded sizing rules as a parallel truth; "recommendation engine" for the dormant LLM hooks

**Rule graph**:
One flow's decision DAG (Premium Mpillow, Basic Mpillow, or Mbolster): one editable draft plus immutable published versions. Only the published version runs live; Publish is gated by validation (DAG, band coverage, reachable **Fallback**, size-scoped **Template outputs**, same-flow fallback beside every **Flow route**).
_Avoid_: editing a published version in place; multiple concurrently-live versions per flow

**Input node**:
Emits one typed answer from the flow's code-defined input catalog (measurements, sleep position, bed firmness, health flags, blood pressure, pain areas, uses bolster, gender, age group). Every catalog input is **required** — no "not answered" branches.
_Avoid_: referencing inputs the flow does not collect; silent client defaults for skipped measurements

**Range node**:
Maps a numeric input to a named band via ordered ranges that must be contiguous and non-overlapping. Authored in **inches** (canonical storage stays cm).

**Match node**:
Branches on an enum/boolean input, one edge per value.

**Combine node**:
ANDs multiple branches (e.g. three measurement ranges must all match). Disjunction is expressed with parallel **Match** branches, not an OR node.

**Terminal**:
A leaf that resolves the evaluation: **Size output** (size or bolster length), **Template output** (a **Filling Template** scoped to the resolved size), **Tier suggestion** (advisory copy only — never changes the sold product), or **Flow route** (upsell/cross-sell to another flow via the **Upsell card**).
_Avoid_: a Template output pointing across sizes; Tier suggestion mutating the held product or amount

**Fallback**:
The per-graph default terminal when no path matches. Publish requires it reachable, and every **Flow route** terminal needs a same-flow fallback sibling so declining an upsell always lands on a sellable result.

**Recommendation record**:
The engine's output persisted on the configurator response and copied to the **Result** at hold create: graph version id, fired terminals, resolved size/length, recommended template id, tier suggestion, **Evaluation trace**, and entry flow → final flow journey. It is advice — never the filling snapshot (guest snapshots stay null until Admin Panel assign); the assign hint upgrades from **Default Filling Template** to the engine-recommended template. A **Staff assist mode** mix at hold create wins over it.
_Avoid_: conflating with **Filling configuration** snapshot; treating it as binding on production

**Evaluation trace**:
The recorded path (nodes and matched values) that produced a recommendation — the "why" shown to shoppers in plain language, to operators at assign, and replayable on the canvas.

**Upsell card**:
The consent surface on the completed preview when a **Flow route** fires: reason from the fired path, both prices, Upgrade / Keep. Accept carries shared answers over and collects only the missing target-flow steps; Decline keeps the same-flow fallback result. All routing resolves before the Stripe hold.
_Avoid_: silent auto-redirect to another flow; holding an amount the shopper did not explicitly confirm

## Returns / RMA (ADR 0011)

**Return** (RMA):
A customer-initiated, **item-level** request against a delivered **Order** to send goods back, resolved as a **refund**, **exchange**, or **replacement**. Its own aggregate (`rma_requests` + `rma_request_items` + `rma_status_events`), not an order column.
_Avoid_: "refund request" (that is the separate order-level Result flow, migration 0048); "return" when you mean a code `return`

**Resolution**:
What the customer asks for on a **Return**: `refund` (money back via the existing `refundPayment` + money-ledger webhook), `exchange` (same item re-sent), or `replacement` (corrected/like item re-sent). Fixed at request time.
_Avoid_: "outcome" (that is the terminal status the resolution drives)

**RMA status**:
The lifecycle state: `requested → approved | rejected | cancelled`; `approved → instructions_sent | cancelled`; `instructions_sent → received | cancelled`; `received → completed | refunded`. Terminal: `completed`, `refunded`, `rejected`, `cancelled`. Validated by the pure `canTransition`.
_Avoid_: inventing intermediate states in UI without adding them to `canTransition`

**Status event**:
An append-only `rma_status_events` row (`from_status`, `to_status`, `actor`, `reason`) — the customer-visible **Return** timeline. Distinct from the staff-only `admin_audit_log` entry written alongside it.
_Avoid_: mutating `rma_requests.status` without appending an event (status is a cache of the latest event)

**Return window**:
The eligibility period, `site_settings.rma_return_window_days` (default **30**), measured from `orders.delivered_at`. Only delivered orders within the window are returnable.
_Avoid_: measuring the window from order/ship date

## Relationships

- An **Item** may be a **Sellable item** when it has an MSRP
- A **Composed sellable** is made of one or more **Items** (BOM)
- A **Storefront product** projects either a **Composed sellable** or a **Sellable item**
- A **Storefront product** has one or more **Variants**
- **Costings** owns MSRP, cost, and compare-at for every non-legacy **Variant**
- Each **Composed sellable** may have at most one **Default Filling Template**; many Filling Templates may exist per size (catalog)
- After assignment, a **Result** links to a **Composed sellable** (size×tier or length) and a **Filling Template** (default or operator override)
- Final build lines = non-filling **Composed sellable** BOM lines (packaging, protector, and other non-filling defaults) + **Filling Template** lines (default or operator override) + **Customer preference** lines + **Add-on** lines
- **Composed sellable** Configure drawers edit non-filling BOM lines only; fillings are not edited as raw lines there — only a **Default Filling Template** is chosen from the size-scoped catalog
- A **complete product** on a **Result** = assigned **Composed sellable** (non-filling) + operator-**confirmed** **Filling Template** at assign — not a Configure validation gate
- Fillings live only in **Filling Templates** — never in composed sellable BOM or warehouse presets. Legacy filling rows are migrated into Filling Templates (seed defaults per product card), then removed from live BOMs
- Fillings affect COGS/fulfillment only; sell price is **Costings** **MSRP** for the composed sellable plus preference/add-on item **MSRP**s, plus shipping and tax
- An accepted **Result** plus successful capture (when an **Authorization hold** exists) becomes an **Order**
- A **Media Asset** is the library record; landing slots, blogs, products, slide configs, and **Product Builder** overlays are consumers. **Product slide section config** media stays code-config until adopted onto Assets.
- **Product Builder** (Landing Site) links cover/case **Items** to overlay **Media Assets** for the configurator silhouette; preview selection reflects that mapping (**C**: thumbnails on **Item**, overlay fit in Product Builder when needed).
- The storefront Menu’s last pill is **Sign in** (guest), **Profile** (**Customer**), or **Admin Panel** (**Staff**). When the session is **Staff**, prefer **Admin Panel** over **Profile**.
- **Staff assist mode** appears on the customisation preview only when the session is **Staff**; the shopper operates that shared device. It does not replace **Result** assign in the **Admin Panel**.
- **Staff assist mode** may load/edit a **Filling configuration** (from a **Filling Template** or scratch) for the live customisation; catalog create/**Promote** of **Filling Templates** stays in the **Admin Panel** only.
- Every used **Filling configuration** is tracked for analytics; **Unpromoted configurations** are ranked by usage to guide **Promote**.
- With **Staff assist mode**, the **Result** receives a spatial **Filling configuration** snapshot at hold create; without assist (guest), the snapshot is first set at Admin Panel assign. `filling_template_id` is optional and only on exact catalog match.
- After assign, Admin Panel revisions are what the shopper reviews; on **Accept** or **Decline** the **Result** keeps that **Filling configuration** snapshot for records/analytics. Payment Stripe-capture happens only on Accept (when a hold exists) — not on Decline.
- One **Filling Template** (or **Filling configuration**) owns all nine **cells**. Pack list / stock / COGS = flattened inventory **Item** lines derived from placements (**A**). Per-**cell** editor: inventory-linked fillings only; UI starts at 1 piece, max 5 pieces per cell in v1.
- Spatial persistence — resolved (**B** refined / **Q10-A**): dedicated **placement** rows are the “where” source of truth; flat pack list is always derived; **Warehouse template** stays non-filling (ADR 0003).
- Analytics is retrospective P&L: sales windows use **`paid_at`** on platform **Orders** and the **Shopify order mirror**. On-hand stock value KPIs (inventory at cost, potential MSRP revenue, unrealized margin, weighted margin %) live on **Costings** as-of-now, not on Analytics.
- **Analytics channel** All = paid **Orders** ∪ **Shopify order mirror** only; `shopify_sales_queue` is ops, not a finance channel.
- A **Visitor** has zero or more **Visits**; each **Visit** has one **Entry source** and may end in a **Drop-off** or a paid **Order**
- A **Prospect** is a **Visitor** with no paid **Order**; after payment they are no longer a **Prospect**
- **Entry source** is machine-captured at **Visit** start; **Discovery source** is self-reported later on the **Result** — never the same field
- A **Visitor** merges to a **Customer** (or email) only via a deterministic key — never by IP, user-agent, or fingerprint alone
- Each flow (Premium Mpillow, Basic Mpillow, Mbolster) has exactly one **Rule graph** (draft + published versions); all recommendation callers (online ballpark, in-store suggestion, basic recommend) evaluate the published version
- A **Recommendation record** on a **Result** references the **Rule graph** version that produced it; the recommended template becomes the assign hint, and the filling snapshot rules from **Staff assist mode** / Admin Panel assign are unchanged
- Sold tier is flow-scoped: a **Rule graph** advises (**Tier suggestion**) or routes with consent (**Flow route** → **Upsell card**) but never changes the held product or amount on its own

## Example dialogue

> **Dev:** "Can I type a price on the product editor for an accessory?"
> **Domain expert:** "No — publish a **Sellable item** from inventory. Its **MSRP** in **Costings** is the price customers see."
>
> **Dev:** "What if we clear the MSRP on that item?"
> **Domain expert:** "The **Storefront product** is archived on the next sync. Restore the MSRP and it comes back as a draft — we never delete it."
>
> **Dev:** "Customer finished mp-config. What happens next?"
> **Domain expert:** "We create a **Result** with an **Authorization hold**. The operator assigns size×**tier** and a **Filling Template** on the platform. The customer sees the final build, Accepts, we capture payment, and the **Result** becomes an **Order** for production."
>
> **Dev:** "Can the customer pick the protector or fillings?"
> **Domain expert:** "No. Protector is owned on the **Composed sellable** BOM (pillow by **tier**, bolster by **length**). Fillings come only from the **Filling Template**. **Customer preference** is cover + case on **Mpillow**; **case only** on **Mbolster** (Bolster Case — no covers in inventory)."
>
> **Dev:** "What if the operator doesn't pick a filling mix at assign?"
> **Domain expert:** "Assign is blocked until they confirm one. The UI shows the **Default Filling Template** for that **Composed sellable** as a hint, plus a short preview of its filling lines (variant, qty). They must actively select — usually the default, sometimes an override."
>
> **Dev:** "What does the operator see while assigning?"
> **Domain expert:** "Two sections: **Product** (size×tier, non-filling lines — mostly read-only) and **Filling mix** (default hint, dropdown, variant/qty preview). Both update when size or tier changes. Save only after they confirm a filling template."
>
> **Dev:** "Should PDP care questions live in Global FAQ or on the product page?"
> **Domain expert:** "Both can mention care, but the ranking URL needs a **Page FAQ** on that **FAQ surface** (`product:{id}`). **Global FAQ** stays the `/faq` catalog — independent rows, no shared IDs in v1."
>
> **Dev:** "Industry says add a TL;DR under the H1. New component?"
> **Domain expert:** "No — that's the **Answer lede**. Fill `seo_answer` (or the home/configurator lede field). Do not ship a second summary block."
>
> **Dev:** "Staff still need a separate Settings login page, right?"
> **Domain expert:** "No — one **Sign in** at `/account/login`. After the session, **Staff** go to the **Admin Panel**; everyone else is a **Customer** on **Profile**. Keep the `/settings` path; just don't call it Settings in the UI."
>
> **Dev:** "In-store, can Staff edit fillings on the same Your Custom Mpillow page the shopper is using?"
> **Domain expert:** "Yes — **Staff assist mode** on that shared device when **Staff** is signed in. No second login for the shopper, no remote co-browse."
>
> **Dev:** "Can they Save as template from the configurator?"
> **Domain expert:** "No. Assist can change the **Filling configuration** for this session. Creating or **Promote**-ing a **Filling Template** is Admin Panel only. Analytics tracks every used mix so Staff can promote the most common **Unpromoted configurations** later."
>
> **Dev:** "Does the Result store the template id or the actual mix?"
> **Domain expert:** "The full spatial **Filling configuration** snapshot. Template id is optional, only when that snapshot still exactly matches a catalog **Filling Template**."
>
> **Dev:** "Guest on mp-config with no Staff login — do they see filling editors?"
> **Domain expert:** "No. Normal preview only. Fillings are set later in the Admin Panel (or at hold if the session was **Staff assist mode**)."
>
> **Dev:** "Staff changes the mix in the Admin Panel after hold, customer Declines — do we keep the mix?"
> **Domain expert:** "Yes. Accept and Decline both retain the **Filling configuration** snapshot for records. Decline does not Stripe-capture."
>
> **Dev:** "Is a Filling Template just a flat BOM?"
> **Domain expert:** "No — it stores **where** each filling piece goes (**Section** + **sub-section** + slot). The flat BOM is a projection for stock/COGS. Same **Item** can appear up to five times in one **cell**. See ADR 0008."
>
> **Dev:** "Where do assist controls sit on Your Custom Mpillow?"
> **Domain expert:** "Left: spatial fillings (and size×tier if Staff changes size). Right: cover, case, add-ons, and the rest of the purchase inputs — same as the guest preview."
>
> **Dev:** "Staff changes size and the chosen case isn’t made in that size?"
> **Domain expert:** "If it’s not offered for that size, clear it and make them re-pick. If it’s offered but stock is 0, keep it and use the normal out-of-stock / **Pre-order** path."
>
> **Dev:** "Where do cover overlays get assigned?"
> **Domain expert:** "**Product Builder** under Landing Site — pick a **Media Asset** per cover/case **Item**. The Your Custom Mpillow preview shows that overlay when the shopper selects the option."
>
> **Dev:** "Pre-order waiting — do we show weeks?"
> **Domain expert:** "No numeric ETA in v1. Fixed copy: we’ll reach out shortly via WhatsApp. Restock automation email is separate."
>
> **Dev:** "Add-ons on left or right?"
> **Domain expert:** "Select on the right. Left only shows images of the *selected* add-ons under the pillow so you can see what you picked."
>
> **Dev:** "How do Staff edit fillings on the pillow?"
> **Domain expert:** "**X-ray filling editor** — hover the three **Sections**, click to dive into **sub-sections**, place inventory fillings. Guests never see that mode."
>
> **Dev:** "Should Analytics pull Shopify sales live from the Admin API?"
> **Domain expert:** "No — read the **Shopify order mirror**. Unmapped lines stay under **Others** with revenue counted. On-hand stock value belongs on **Costings**, not Analytics."
>
> **Dev:** "Is **Entry source** the same as **Discovery source**?"
> **Domain expert:** "No — **Entry source** is UTM/referrer/Direct at **Visit** start. **Discovery source** is the questionnaire answer on the **Result**."
>
> **Dev:** "Can we merge two **Visitors** on the same IP into one person?"
> **Domain expert:** "Only after email or **Customer** Sign-in. Until then each browser stays its own **Visitor**; roommates must not share identity."
>
> **Dev:** "What should Staff look at first on Analytics — converters or leavers?"
> **Domain expert:** "**Prospects** and **Drop-off**. Paid **Orders** are the muted minority until Staff opt in."
>
> **Dev:** "Where do I change the shoulder-to-size thresholds?"
> **Domain expert:** "On the flow's **Rule graph** in the **Rules Engine** — edit the **Range node**, test in the panel, **Publish**. Never back in code; the published graph is the only authority."
>
> **Dev:** "The Basic graph decided this shopper should get Premium — do we switch their product?"
> **Domain expert:** "No. A **Flow route** shows the **Upsell card**. If they accept, their answers carry over and we collect only the neck measurements; if they decline, the same-flow **Fallback** result stands. The hold amount is always what they confirmed."
>
> **Dev:** "Does the engine's template pick go straight to production?"
> **Domain expert:** "No — it's a **Recommendation record**. Guest snapshots stay null until assign; the operator sees the engine's template as the hint with its **Evaluation trace** and still confirms. An assist-session mix outranks it."

## Configure (settings)

**Product tab**:
The composed sellable recipe editor in Configure: non-filling BOM lines (cover, case, protector, packaging, etc.) plus the **Default Filling Template** picker for that size×tier or length.

**Configure product page**:
Clicking a Configure product card opens a **full page** with breadcrumbs (e.g. Configure / Premium Mpillow / Size M) hosting the Product and **Filling Config** tabs — replacing the previous slide-in drawer/sheet.
_Avoid_: reintroducing the drawer for product card editing; breadcrumb-less deep pages

**Complete product**:
What gets sold and fulfilled for one order: non-filling **Composed sellable** lines for the assigned size×tier (or length) plus the operator-**confirmed** **Filling Template** at assignment. Configure maintains the recipe and catalog separately; they come together only when the operator confirms assignment on a **Result**.

**Filling Config tab**:
The filling-only catalog and editor inside the same product card page. Scoped to that product type and size (or length) only — pillow cards never show bolster mixes and vice versa. Create, edit, and activate mixes; set which one is default on the Product tab. Auto-seeded templates from legacy BOM data are named `{size} - {tier} - default` (pillow) or `{length} - default` (bolster), active immediately. Also hosts the ranked **Unpromoted configuration** list for that product card (usage counts, **Promote** in place) — segmented per product and size, not a global list.

**Warehouse template**:
A named non-filling BOM preset (`role: warehouse`) for Apply-to-active-BOM. Must not include filling lines — fillings live only in **Filling Templates**. See ADR `docs/adr/0003-fillings-only-in-filling-templates.md`.

## Marketing

**Science of Sleep**:
Mpillow's brand umbrella: clinical engineering for cervical alignment, modular custom fit, and lasting overnight support. Gift/customisation language is a conversion tactic (CTAs, product cards), not the primary brand story.
_Avoid_: leading every surface with gift/lifestyle framing when the page's job is clinical sleep fit

**Affluent Wellness / Pain Sufferer**:
Primary home-hero persona — high-intent buyers with chronic neck pain or stiffness who value consultative in-store fitting and Premium customisation.
_Avoid_: treating this as interchangeable with Tech Neck or Families messaging on the first viewport

**Tech Neck professional**:
PMEB / desk-device strain persona. Weave only into the **Cervical Neck Support** learn-more slide-in (and its Neck Pains trigger) — may add a section inside that slide-in; no new routes.
_Avoid_: inventing a tech-neck landing page; medical treat/cure claims

**Multi-generational family**:
Household / seniors / kids-height persona. Weave only into **Mbolster** surfaces (home card, slide-in, mbolster-config). Do not invent Family Sleep Bundles unless a live bundle offer exists.
_Avoid_: new family landing pages; claiming bundles that are not sellable

**Elusive Sleeper**:
Shared pain pattern under all three personas — failed one-size pillows, Goldilocks frustration, willingness to invest in a real fit. Not a fourth competing audience.
_Avoid_: using Elusive Sleeper as the sole marketing persona doc

**Consumer ambassador**:
Lifestyle/social-proof ambassadors on the home ambassadors surface (e.g. Skyjin & Piggie). Distinct from clinical partners.
_Avoid_: calling consumer ambassadors "Local Ambassadors"

**Local Ambassador (clinical)**:
Chiropractors, physiotherapists, and wellness coaches addressed on `/our-partners` and clinical proof surfaces (credibility, clinician review) — not the celebrity ambassadors section.
_Avoid_: renaming Skyjin/Piggie to Local Ambassadors; inventing referral-voucher programs in copy before they exist

**Media Asset**:
A first-class library record for a managed photo, video, PDF, or external link. Staff manage these in Settings → Media. Not a raw storage-bucket object alone — the Asset owns display name, alt text, kind, provenance, and usage metadata.
_Avoid_: "media" when you mean a landing-page image slot override or a hard-coded slide-in path; those are consumers, not Assets

**Asset kind**:
`image` | `video` | `pdf` | `link`. Images are hosted for fast site delivery; video and PDF Assets are Drive-linked references (no large file copy into app storage).

**Hosted URL**:
The public URL for an image **Media Asset** served on the site (app storage). Storefront and admin use this for display; responsive delivery is handled at serve time.

**Drive provenance**:
The original Google Drive file id/URL kept on an Asset after a one-time import — for Open in Drive and manual re-import only. No ongoing sync with Drive.

**Used / unused**:
**Used** = currently referenced by a known consumer (landing slots, blogs, products, categories, partners, page builder; drafts count). Order item image snapshots do not count. **Unused** = no such reference.

**Last used**:
Timestamp of the last attach, replace, or save in a consumer that referenced the Asset — not storefront page views.

**Media Asset Library**:
The Settings → Media DAM and shared Asset picker. Separate from **Product slide section config** media props (code-config paths) until those configs are adopted onto Assets.

**Product Builder**:
Admin Panel page under **Landing Site** where **Staff** map inventory cover/case (and related) **Items** to overlay **Media Assets** (and optional fit) for the customisation preview silhouette (**Your Custom Mpillow** / bolster preview), and view/edit **Filling visual** colors. Card thumbnails come from the **Item**; non-default overlay placement on the SVG is presentation config here. Choosing a cover/case on the preview shows the linked overlay from this page.
_Avoid_: a parallel upload silo outside **Media Assets**; hard-coding overlay files in the configurator; putting this under Inventory Configure (recipe) instead of Landing Site presentation

**Filling visual**:
The x-ray rendering identity of one filling **Item** type: a designer-authored fluid SVG shape (default mapped in code config) plus a color. Staff can see the mapping and edit the **color** in **Product Builder**; shape changes are a designer/code update. Multiple pieces in a **cell** render compressed but individually distinct (two pouches read as two). Guardrails: ADR `docs/adr/0009-xray-filling-visuals.md`.
_Avoid_: rect/bounding-box cropping of filling shapes; gooey-merging pieces so the count is unreadable; generating random blob shapes in v1

**Learn-more slide-in**:
The full-height sheet opened from landing-page "Learn more" CTAs (Basic Mpillow, Premium Mpillow, Mbolster). Primary job: product story + route to customisation or book appointment. Layout redesign target: reuse shared section templates across the three slide-ins with minimal hard-coded layout.
_Avoid_: conflating with standalone routes like `/mbolster` or the `/mp-basic` / `/mp-config` wizards

**Product section template**:
A layout primitive reused across learn-more slide-ins. Each template accepts content props (title, description, image, items, etc.) — no product-specific copy inside the component. Agents compose slide-ins by ordering templates with i18n-backed content. Shell (header, progress, sticky CTA) is out of scope for layout redesign.
_Avoid_: one-off inline layout duplicated per slide-in file; hard-coded product copy inside templates

**Product slide section config**:
A typed array declaring section order for one learn-more slide-in. Each entry: `{ type, contentKey?, ...mediaProps }`. A `ProductSlideSectionRenderer` maps `type` → template component. Simple sections are fully config-driven; complex sections (purchase panel, measurement grid) are named components referenced by type. Adding a new product = new config file + i18n keys — no new template code unless a novel layout pattern is needed.
_Avoid_: hard-coded section JSX inside slide-in files; one monolithic slide-in component per product

**Template content schema**:
Each product section template type defines a TypeScript content interface (e.g. `SplitHeroContent`, `FeatureCarouselContent`). Config uses `contentKey` pointing into `m.slides.{product}.{contentKey}`. i18n must satisfy the schema; renderer resolves at compile time. Media (images, video IDs) live in config, not i18n.
_Avoid_: inline copy in config files; untyped i18n blobs wired to templates

## Learn-more slide-in section recipes (approved)

**Basic Mpillow**: `split_hero` → `firmness_compare` → `feature_carousel` → `size_guide_split` → `video_section`

**Premium Mpillow**: `split_hero_dual_media` → `trust_strip` → `split_hero`(overseas) → `icon_list` → `feature_carousel` → `firmness_compare` → `split_hero`(accessory) → `spec_table` → `measurement_grid` → `packaging_block` → `video_section` ×2 → `commitment_cards` → `help_contact`

**Mbolster**: `purchase_panel` → `split_hero`(about) → `size_guide_split` → `packaging_block` → `outcome_grid` → `testimonial_card` → `feature_carousel`(story) → `split_hero`(discover)

**Cervical Neck Support** (nested slide-in — opened from Premium accessory CTA + neck-pains section; shell keeps "Back" footer): `media_intro` → `split_hero`(why) → `full_bleed_media`(comparison) → `feature_card_grid`(benefits) → `text_callout_block`(difference)

**Content preservation (non-negotiable)**: Refactor is layout/template extraction only. All existing i18n copy, images, videos, and section content must be retained — reorder allowed per approved recipes; do not delete or omit content that exists today.

**Agent catalog**: TypeScript types in `lib/product-slide-sections/` (source of truth) + agent playbook at `.cursor/marketing-page/product-slide-sections.md`. Templates are reusable code blocks; future scope (not now) may expose them in settings for drag/edit like the landing page builder.

**Answer lede**:
A direct-answer block immediately after the page H1 (or H2 on sectioned pages). Stored as optional `seo_answer` on **Storefront product** and blog content; falls back to `seo_description` then `description`. Primary pattern for AEO/GEO fact density. Industry “TL;DR” / key-takeaways guidance maps to **Answer lede** — same field, same placement; do not add a second summary UI.
- **Home hero** (`home.hero.seoAnswer`): **28–40 words**, hard **≤4 lines** (`line-clamp-4`) — layout over the product image wins; still answer-first for extractors.
- **Other surfaces** (config shells, guides, PDP): prefer **40–60 words** (featured-snippet peak).
_Avoid_: burying the answer below fold or inside client-only modals; building a separate TL;DR / key-takeaways component; shipping a hero wall of text over the product image

**Copy fit (layout + SEO)**:
Marketing strings must fit the surface they render in — keyword intent does not excuse overflow. Hard bands for en-US **home hero**:
- **Hero H1**: **≤2 lines** → 4–8 words and ≤55 characters (`line-clamp-2`). May be a brand tagline; then Singapore / cervical / neck / Science of Sleep **must** appear in the Answer lede.
- **Hero subtitle**: optional; ≤12 words when present (omit rather than repeat the lede).
- **Hero Answer lede (`seoAnswer`)**: **≤4 lines** → 28–40 words (`line-clamp-4`).
- **Meta title** (separate from H1): 50–60 characters for SERP display; may differ from on-page H1.
- **Card / section blurbs**: ≤18 words unless the surface is a long-form slide body.
Canvas Recommended supplies keyword intent; if a Recommended string breaks a band, **compress** — do not drop required intents (Singapore / cervical / neck pain / Science of Sleep where the surface requires them). Science of Sleep may live in the lede when the H1 is at the 2-line cap.
_Avoid_: treating canvas Recommended as a license to ignore layout; removing `line-clamp-2` / `line-clamp-4` from the hero; stuffing every keyword into the H1

**Global FAQ**:
The site-wide Q&A catalog at `/faq` (`faq_categories` / `faq_items`), managed under Settings → FAQ. Covers warranty, shipping, care, and other cross-page topics. Public API `/api/faq` and `FAQPage` JSON-LD on `/faq`.
_Avoid_: putting page-specific buyer prompts (fit, product differences, configurator process) only here when they belong on the ranking URL as a **Page FAQ**

**Page FAQ**:
A Q&A list owned by one **FAQ surface**, rendered on that surface’s URL as a compact accordion with `FAQPage` JSON-LD when visible items exist. Stored in `faq_page_sets` / `faq_page_items`, independent of **Global FAQ** — no shared rows in v1 (same question may be copied into both catalogs).
_Avoid_: conflating with **Global FAQ** (`/faq`); hardcoding page Q&A in TS like guide hubs; dumping the full Global FAQ catalog onto a commercial page

**FAQ surface**:
The page identity a **Page FAQ** set is keyed to: `home` | `mp-config` | `mbolster-config` | `product:{productId}` (`productId` = **Storefront product** UUID). Home placement is via page-builder `faq` section; PDPs and configurator **SEO shells** auto-show when the surface has ≥1 visible item.
_Avoid_: inventing surface keys outside that set; tying Page FAQ sets to Global FAQ category IDs

**Editorial hub**:
An indexable `/guides/{topic}` marketing page for mid-funnel queries (e.g. neck pain Singapore). Contains answer lede, curated internal links, and FAQ JSON-LD. Commercial CTAs point to `mp-config` / `mbolster-config` — not duplicate shop landing pages.
_Avoid_: using hubs as a second customisation funnel

**SEO shell**:
Server-rendered crawlable intro (H1, answer lede, JSON-LD) prepended above a client-heavy configurator (`mp-config`, `mbolster-config`). Metadata via server `generateMetadata`.
_Avoid_: noindexing the actual conversion path

**Curated llms index**:
The `/llms.txt` file as a concise AI crawler guide (brand, product taxonomy, key URLs, target queries) — not a full mirror of blog/FAQ bodies.
_Avoid_: dumping entire blog content into llms.txt

**AEO**:
Answer Engine Optimization — structuring pages so AI answer engines (Perplexity, ChatGPT search, Google AI Overviews) can extract direct, cite-worthy facts.
_Avoid_: conflating with paid ads or traditional link-building only

**GEO**:
Generative Engine Optimization — same goal as AEO for generative search citations; share answer-first content and JSON-LD infrastructure.
_Avoid_: treating GEO as a separate codebase from SEO

**Slide-in template architecture (approved)**:
Shared React components in `components/sections/product/` receive JSONB-serializable content props. Code config files now (`lib/product-slide-sections/`); same `{ type, content }` shape can move to DB/settings later. May reuse layout patterns from landing components but **do not modify landing pages** — slide-in refactor only.
_Avoid_: changing `components/sections/landing/`, homepage page builder, or `landing_sections` in this exercise

## Flagged ambiguities
- Pre-order preview waiting copy — resolved: fixed i18n promises WhatsApp reach-out shortly (implemented in `preOrderWaitingCopy`); restock automation stays email for now.
- "admin" on the customisation page — resolved: product language is **Staff**; UI capability is **Staff assist mode** (shared in-store device, preview only when signed in as **Staff**).
- Mpillow spatial fillings — resolved: **Section** = left | center | right; **sub-section** = front | middle | back → nine **cells**. A **cell** may hold **multiple** filling **Item** lines (stuffing). Prefer these short names over “Filling section/cell”. Band id is **front** (not top) to match the LLM model API.
- Assist-session “Save as template” — resolved for v1: **no**. Catalog **Filling Template** create/**Promote** only in **Admin Panel**. Assist mutates the live **Filling configuration**; analytics tracks all used mixes and ranks **Unpromoted configurations** for later **Promote**.
- **Result** filling truth — resolved: full spatial **Filling configuration** snapshot; optional `filling_template_id` only on exact catalog match.
- Snapshot write timing — resolved (**A**): with **Staff assist mode**, at hold create from the session mix; without assist, at Admin Panel assign. Post-hold edits stay in Admin Panel (no Result-reopen assist in v1). Accept and Decline both retain the snapshot for records; Decline ≠ Stripe-capture.
- Snapshot semantics — resolved (yes/yes): an edit that diverges from the loaded **Filling Template** clears `filling_template_id` immediately (snapshot is sole truth); a guest hold carries a **null** filling snapshot until Admin Panel assign writes it.
- Mbolster scope — resolved: included in v1. Same x-ray effect, case overlays, and add-on image cards as Mpillow, but **its own spatial schema**: one long compartment, **no piece cap** in v1, no left/center/right or sub-section enums borrowed from Mpillow. Filling **Items** come from the same inventory; pack list still derived from placements (ADR 0008 applies to both).
- Inventory math — resolved (**A**): flatten nine **cells** to item totals for stock/COGS; spatial layout is placement + analytics. One template = all nine cells and **where** each piece goes. Cell editor: inventory **Items** only; max **5 pieces per cell**; same Item may repeat (e.g. 5× 6D Small); UI starts with 1; each persisted row is one piece (qty 1).
- Spatial persistence — resolved: dedicated placement rows (e.g. `filling_template_placements`) = **where**; pack list always **derived** (not a second editable filling BOM); **Warehouse template** remains non-filling. Exact table/column names left to implementation; Result snapshot copies placement rows. ADR: `docs/adr/0008-spatial-filling-placements.md`.
- **Staff assist** layout — resolved: left = fillings (+ size×**tier** when changed in assist); right = existing cover/case/**Add-on**/checkout inputs. On size change, re-check size-scoped cover/case/**Add-on** eligibility: auto-clear when the **Item** is not offered for that size; if offered but stock is 0, keep selection and use existing out-of-stock / **Pre-order** signals (**C**).
- Assist size×tier change vs placements — resolved (**A**): clears current **Placements** (confirm dialog first) and loads the new size's **Default Filling Template** as the starting mix — same size-scoping rule as **Result** assign.
- Unpromoted ranking surface — resolved (**A**): inside Configure → **Filling Config tab**, segmented per product card and size; **Promote** in place. No separate Analytics surface in v1.
- Configure drawer → page — resolved: product cards open a full **Configure product page** with breadcrumbs instead of the slide-in drawer (glossary references to “drawer” describe the old UX).
- `/mp-basic` scope — resolved: **yes**, all preview features (**Staff assist mode**, x-ray editor, overlays, add-on cards) apply to the basic flow too — one shared preview surface; tier only scopes which composed sellables and **Filling Templates** load.
- "price" was used for both the editable Costings field and the storefront mirror — resolved: **MSRP** is the source; `product_variants.price` is the mirror.
- "kind" was used for basic/premium — resolved: human-facing language is **tier**. Existing DB columns may remain `kind` / `pillow_kind`; UI, emails, and new human-facing API field labels use `tier`.
- **Filling Template** (filling-only Configure BOM template, operator-selected) vs **Composed sellable** (size×tier or length BOM owning packaging/protector defaults and sell **MSRP**) vs **Storefront product** (shop listing projection) — three different things; do not conflate.
- Protector is owned on the **Composed sellable** BOM, not a **Customer preference**. Fillings come from **Filling Templates** only.
- Mbolster “covers” — resolved: inventory/Configure have **Bolster Case** + **Bolster Protector** (plus packaging/etc.); no cover category. **Customer preference** on mbolster-config is case only; customise UI must not show Cover Style or require `selectedCover`.
- Customise “sold out / low stock / still pay” — resolved: **Pre-order** when a required preference line on-hand is 0 **or** composed sellable buildable is 0. Preview CTA is **live**; **Result** mode is **sticky** at hold create; **automated** restock email to **`held`/`assigned`** Pre-order Results when stock recovers (idempotent; no manual send in v1). Scope: Mpillow + Mbolster. Waiting-time copy: fixed i18n — promise is **WhatsApp reach-out shortly** (not numeric ETA; **Q13b-A**). Restock notice channel stays email unless separately changed. No separate ops queue in v1. Hold CTA: Proceed vs Pre-order (not “Purchase”). Packaged inside **UX polish Jul 2026** PRD (single backlog; Pre-order is vertical slices within it, not a separate PRD). ADR: `docs/adr/0005-pre-order-authorization-hold.md`.
- Cover/case overlays on configurator — resolved (**C**): **Product Builder** under Landing Site maps **Items** → **Media Asset** overlays (optional fit); **Item** supplies card thumbnails; preview reflects the mapping when cover/case changes.
- **Add-on** cards — resolved (**A** + clarify): selection stays on the **right**; left shows image previews of *selected* add-ons under the silhouette (desktop row / mobile stack). **Item** primary **Media Asset** supplies the image.
- **X-ray filling editor** — resolved as Staff-only left silhouette interaction: hover → 3 **Sections**; click → dive into **sub-sections** / **Placements**. Art direction = x-ray/cutaway of fillings inside the pillow shape.
- X-ray implementation — resolved (**A** + amendments): layered interactive SVG. Designer-exported silhouette + per-cell boundary paths become `clipPath` regions; each filling type = one fluid path asset tagged by item subtype + color; blobs conform via nested clipping; deterministic 1–5 compressed-but-distinct layout per cell; `framer-motion`/`gsap` (installed) for hover/dive; **`flubber` approved** as the one new dependency (shape morphs), installed when the editor is built. Gooey merge rejected as default (piece count must stay legible). Guardrails ADR: `docs/adr/0009-xray-filling-visuals.md`.
- Filling-type → shape + color map — resolved (**C** extended): shape defaults in code config now; **Product Builder** surfaces the mapping read/write for **color** (shape stays designer/code). Migrate shape editing into Product Builder only if shapes churn without deploys.
- Marketing app dock scroll — resolved: hide on scroll-down, show on scroll-up / near top, **and** show when near document bottom; configurator post-welcome `dock-hidden` unchanged. Trim excess bottom padding that double-counts dock clearance.
- Mbolster (i) FAQ dismiss — resolved: **`hideClose` + inline close below the FAQ accordion** (scrolls with content), matching Mpillow FAQ — not a fixed/corner X.
- Mbolster height “can’t type `.`” — resolved as AFK bug: input round-trips through `parseFloat`/`toDisplayHeight` on every keystroke so intermediate values like `1.` become `1`. Keep a draft display string while typing; normalize/clamp on blur or Continue.
- Pre-order trade-offs — ADR written: `docs/adr/0005-pre-order-authorization-hold.md`.
- Orders date-range **sales** report — resolved: filter list + dashboard summary by **`paid_at`** (not `created_at`). Unpaid/pending without `paid_at` fall outside the sales window. Same rule for Analytics platform half and **Shopify order mirror** `paid_at`.
- Analytics live Shopify API vs DB — resolved: DB-only via **Shopify order mirror**; channel toggle **Analytics channel**; gap lines = **Others**. ADR: `docs/adr/0006-analytics-db-channel-facts.md`. On-hand inventory value KPIs → **Costings** (as-of-now).
- Mpillow/Mbolster “Stripe API issue” on deploy — resolved: missing **`STRIPE_SECRET_KEY`** on the deployed Vercel env (localhost had it). Operator fixed env; **no code slice** in this PRD for that failure. Still remove bolster **cover** preference requirement as a separate customise correctness slice.
- "media" / landing slot images vs **Media Asset** — slot overrides and slide-in config paths are consumers; the library record is the **Media Asset**. Hybrid refs: new attachments prefer Asset id; legacy URL strings still count toward **Used**.
- “TL;DR” / key takeaways vs **Answer lede** — resolved: same pattern; industry synonym only, no second UI.
- “FAQ” alone is ambiguous — resolved: **Global FAQ** = `/faq` catalog; **Page FAQ** = per-**FAQ surface** embed. Independent catalogs in v1.
- Marketing “ambassador” was overloaded — resolved: **Consumer ambassador** (home/Skyjin & Piggie) vs **Local Ambassador (clinical)** (`/our-partners`).
- Single “Elusive Sleeper” persona vs roadmap trio — resolved: Elusive Sleeper is the shared pain pattern; canonical audiences are **Affluent Wellness / Pain Sufferer**, **Tech Neck professional**, **Multi-generational family**.
- “How did you hear about us?” / referral / lead source — resolved: domain term is **Discovery source** (not referral; avoids partner/voucher collision). Forms settings edit option lists only — not a customization-steps CMS.
- Traffic “from” vs “how did you hear” — resolved: **Entry source** (machine, **Visit** start) ≠ **Discovery source** (self-reported on **Result**).
- Anonymous browser vs shopper account — resolved: **Visitor** until deterministic merge to email/**Customer**; **Prospect** = **Visitor** with no paid **Order**. No “Customer journey” label (collides with **Appointment**). ADR: `docs/adr/0007-first-party-journey-analytics.md`.
- Prospect journey “expand” was overloaded — resolved: **Section dive** (`divePath`) = Houdini-style enter into a page’s section network (focused canvas; siblings hidden; Entry/Exit ports; breadcrumb `Journey / {page}` + Up/`U`/Esc to leave). API still loads section children via `expandPath` when dived; UI never injects `#` children into the page circle. **Expanded node** = click a page/Converted node to grow dig-in in place — **no side/split drawer**; multiple dig-ins may be open for compare (`detailPaths`). Do not use “expand” alone without saying **Section dive** vs **Expanded node**. Entering dig-in: node body click (toggle); canvas click / Esc clears dig-ins. Entering dive: on-node chevron (stops propagation). Diving clears dig-ins. Filters + Arrange + Fit live **inside** the canvas toolbar with the breadcrumb.
- Exit section links — resolved: in **Expanded node**, exit sections are storefront **anchor links** `{origin}/{lang}{path}#{sectionId}` (open new tab). Admin Panel `[lang]` supplies the locale. Tagged surfaces must expose matching HTML `id` equal to `data-section` / `data-step` so the hash scrolls to the block.
- Expanded node dig-in content — resolved: median dwell, exit sections, **Time on page** (was “dwell samples”), **Routes** (was “sample paths”), return timeline, plus **exit section share %** of that page’s drop-offs and **outbound top transitions** (to → count). Human section titles deferred unless a slug→label map already exists. Converted dig-in stays its own fields (last-touch Entry source, duration, value, short path).
- Time on page dig-in — resolved: answers “what’s the **shape** of time on this page?” (not campaign trend). UI label **Time on page**; viz = **line histogram** (frequency over bins, not bar chips) of per-Visit page dwells. Bin width = **10 seconds**; X spans **0 → max** with left always 0. Axis **caps at 10 minutes**; dwells beyond that land in a final **≥10m** overflow bin. Reference markers: **median** = solid vertical line (aligned with node chrome KPI), **mean** = dotted vertical line; tiny legend. Median/mean computed on raw samples. If no overflow, right edge = observed max ceiled to 10s. Replaces chip-list “Dwell samples”. Trend-over-range deferred.
- Routes dig-in — resolved: answers “which **Visit page sequences** through this node are common?” UI label **Routes** (avoid “sample paths”). Aggregate identical sequences; viz = **bar chart** ranked by count. Idle: bars + short rank (`1`…`N`) only — no path text. Hover tooltip: full route + count, page names via existing **`labelPath`** (`Home` for `/`, else path — no separate pretty-name map). Default show top **5**; dig-in **chevron expands to top 10** max.
- Return timeline dig-in viz — deferred: keep text list (prior Drop-off → here + gap). Node chrome already has return hits + median gap; no new chart until Staff need it.
- Expanded node load — resolved: graph aggregates and node dig-in fetch separately. Node click does not refetch the transition graph; a thin detail action loads dig-in per open path (filters still applied). Graph reloads only on date range / filters / **Section dive** / Include converted changes.
- Journey sinks dig-in — resolved: **Converted** uses **Expanded node** in place with Converted-specific fields. **Drop-off** remains non-expandable; page-node dig-in covers exits that feed the sink.
- Section child dig-in — resolved: inside **Section dive**, section child nodes and Entry/Exit ports stay compact chrome only. **Expanded node** dig-in is page-level (not while dived) for page nodes + **Converted** only.
- Expanded node build tracking — resolved: AFK slice **14** (`.claude/PRD-prospect-journey-analytics/issues/14-expanded-node-dig-in.md`); do not reopen slice 07. PRD story 19 amended to **Expanded node**.
- Dig-in viz + Section expand chrome — resolved: AFK slice **15** (`.claude/PRD-prospect-journey-analytics/issues/15-dig-in-viz-section-expand-chrome.md`); do not reopen slice 14.
- Three sizing engines disagreed (shop `SIZE_MAP` vs in-store XS–XL bands vs basic recommend) — resolved: the **Rules Engine**'s published **Rule graph** per flow is the single authority; seeds use the in-store XS–XL shoulder bands; legacy engines retire after seeding (mp-maker legacy untouched). ADR `docs/adr/0010-rules-engine-single-recommendation-authority.md`; PRD `.claude/PRD-rules-engine/`.
- Engine recommendation vs filling snapshot — resolved: engine output is a **Recommendation record** (advice + trace); the **Filling configuration** snapshot rules are unchanged (null for guests until assign; assist mix wins). The assign hint upgrades to the engine-recommended template.
- Measurement unit default — resolved: display/authoring default is **inches** (onsite practice); canonical storage stays cm. All engine inputs are **required** (pain areas gains a "None" chip; photos stay optional); the old silent defaults (shoulder 40, neck 8/10/10) are removed.
- Upsell/cross-sell between flows — resolved: **Flow route** terminals + **Upsell card** (consent, carry-over, gap-fill steps), always resolved before the Stripe hold; sold tier stays flow-scoped; every Flow route needs a same-flow **Fallback** sibling (publish-validated).
