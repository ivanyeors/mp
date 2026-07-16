# Money Pillow (mp)

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
A Configure BOM template that contains filling lines only, scoped by product type and size. A **Composed sellable** may designate one active Filling Template as its **Default Filling Template** (baseline mix). At assignment the operator may keep that default or pick another template from the same size-scoped catalog; the choice is stored on the **Result**. Fillings never come from customer input or from raw filling lines on the composed sellable BOM. Affects COGS and fulfillment, not sell price.

**Default Filling Template**:
The baseline filling mix for one Configure product card (e.g. Basic Size S, Premium Size M, Bolster medium). Stored on that **Composed sellable**, not on a warehouse preset name. Shown as a hint at assignment; the operator must actively confirm or override. Changing assigned size×tier (or length) on a **Result** clears any filling selection and reloads the hint for the new product card.

**Customer preference**:
Shopper-chosen **Item**s on a customisation preview. **Mpillow** (full/basic): cover and case only. **Mbolster**: case only (`bolster_case`) — no cover category in inventory or Configure for bolsters. When exactly one eligible case is available to choose, the preview auto-selects it. Protector (`pillow_protector` / `bolster_protector`) is owned on the **Composed sellable** BOM, not a preference.
_Avoid_: showing a Cover Style picker on mbolster-config; treating bolster protector as a shopper choice

**Add-on**:
An accessory (or optional extra) line at item **MSRP**, chosen during customisation.

**Authorization hold**:
An uncaptured Stripe payment for the ballpark total (composed sellable **MSRP** + preference/add-on **MSRP**s + shipping + tax). Card details are taken; charge happens only on Accept (or via top-up if the final total exceeds the hold).

**Pre-order**:
A customise-preview fulfillment mode when immediate build is not possible from current inventory: a required **Customer preference** line has `stock_available <= 0` (Mpillow: cover or case; Mbolster: case), **or** the recommended **Composed sellable** (size×tier / length) has buildable `<= 0`. Applies to **Mpillow** (full/basic) and **Mbolster**.

- **Live preview CTA:** recomputed from current inventory. When trigger is false, new shoppers see the normal hold CTA (e.g. Proceed) — not Pre-order. When true, CTA + waiting-time section use Pre-order copy (fixed i18n in v1).
- **Persisted Result mode:** at hold create, if the shopper submitted under Pre-order, the **Result** keeps that mode (sticky for that submission).
- **Restock notice:** when inventory recovers enough that the Pre-order trigger would clear, open Pre-order **Results** in status **`held`** or **`assigned`** are **automatically** emailed that stock is back and they can Sign in in a few days to track customisation (**Result**) status (idempotent; skip expired/declined/captured/canceled; no Staff-triggered send in v1). New sessions on the configurator flip back to the normal hold CTA.

Same money path: hold → **Result** → assign → Accept → capture → **Order**; no separate Pre-order queue in v1.
_Avoid_: conflating soft “low stock” badges with Pre-order; calling the held **Result** an **Order** before Accept + capture; “Purchase” as the hold CTA (payment is still an **Authorization hold**); UI-only Pre-order that vanishes after Stripe; bolster-only rules; CMS editing of waiting-time copy in v1; manual restock notice as the v1 path

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
_Avoid_: treating every signed-in user as staff; calling the back office “Settings” in UI copy

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
- A **Media Asset** is the library record; landing slots, blogs, products, and slide configs are consumers. **Product slide section config** media stays code-config until adopted onto Assets.
- The storefront Menu’s last pill is **Sign in** (guest), **Profile** (**Customer**), or **Admin Panel** (**Staff**). When the session is **Staff**, prefer **Admin Panel** over **Profile**.
- Analytics is retrospective P&L: sales windows use **`paid_at`** on platform **Orders** and the **Shopify order mirror**. On-hand stock value KPIs (inventory at cost, potential MSRP revenue, unrealized margin, weighted margin %) live on **Costings** as-of-now, not on Analytics.
- **Analytics channel** All = paid **Orders** ∪ **Shopify order mirror** only; `shopify_sales_queue` is ops, not a finance channel.
- A **Visitor** has zero or more **Visits**; each **Visit** has one **Entry source** and may end in a **Drop-off** or a paid **Order**
- A **Prospect** is a **Visitor** with no paid **Order**; after payment they are no longer a **Prospect**
- **Entry source** is machine-captured at **Visit** start; **Discovery source** is self-reported later on the **Result** — never the same field
- A **Visitor** merges to a **Customer** (or email) only via a deterministic key — never by IP, user-agent, or fingerprint alone

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

## Configure (settings)

**Product tab**:
The composed sellable recipe editor in Configure: non-filling BOM lines (cover, case, protector, packaging, etc.) plus the **Default Filling Template** picker for that size×tier or length.

**Complete product**:
What gets sold and fulfilled for one order: non-filling **Composed sellable** lines for the assigned size×tier (or length) plus the operator-**confirmed** **Filling Template** at assignment. Configure maintains the recipe and catalog separately; they come together only when the operator confirms assignment on a **Result**.

**Filling Config tab**:
The filling-only catalog and editor inside the same product drawer. Scoped to that product type and size (or length) only — pillow drawers never show bolster mixes and vice versa. Create, edit, and activate mixes; set which one is default on the Product tab. Auto-seeded templates from legacy BOM data are named `{size} - {tier} - default` (pillow) or `{length} - default` (bolster), active immediately.

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
- "price" was used for both the editable Costings field and the storefront mirror — resolved: **MSRP** is the source; `product_variants.price` is the mirror.
- "kind" was used for basic/premium — resolved: human-facing language is **tier**. Existing DB columns may remain `kind` / `pillow_kind`; UI, emails, and new human-facing API field labels use `tier`.
- **Filling Template** (filling-only Configure BOM template, operator-selected) vs **Composed sellable** (size×tier or length BOM owning packaging/protector defaults and sell **MSRP**) vs **Storefront product** (shop listing projection) — three different things; do not conflate.
- Protector is owned on the **Composed sellable** BOM, not a **Customer preference**. Fillings come from **Filling Templates** only.
- Mbolster “covers” — resolved: inventory/Configure have **Bolster Case** + **Bolster Protector** (plus packaging/etc.); no cover category. **Customer preference** on mbolster-config is case only; customise UI must not show Cover Style or require `selectedCover`.
- Customise “sold out / low stock / still pay” — resolved: **Pre-order** when a required preference line on-hand is 0 **or** composed sellable buildable is 0. Preview CTA is **live**; **Result** mode is **sticky** at hold create; **automated** restock email to **`held`/`assigned`** Pre-order Results when stock recovers (idempotent; no manual send in v1). Scope: Mpillow + Mbolster. Waiting-time copy: fixed i18n. No separate ops queue in v1. Hold CTA: Proceed vs Pre-order (not “Purchase”). Packaged inside **UX polish Jul 2026** PRD (single backlog; Pre-order is vertical slices within it, not a separate PRD). ADR: `docs/adr/0005-pre-order-authorization-hold.md`.
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
