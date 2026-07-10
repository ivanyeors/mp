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

**Filling Template**:
A Configure BOM template that contains filling lines only, scoped by product type and size. A **Composed sellable** may designate one active Filling Template as its **Default Filling Template** (baseline mix). At assignment the operator may keep that default or pick another template from the same size-scoped catalog; the choice is stored on the **Result**. Fillings never come from customer input or from raw filling lines on the composed sellable BOM. Affects COGS and fulfillment, not sell price.

**Default Filling Template**:
The baseline filling mix for one Configure product card (e.g. Basic Size S, Premium Size M, Bolster medium). Stored on that **Composed sellable**, not on a warehouse preset name. Shown as a hint at assignment; the operator must actively confirm or override. Changing assigned size×tier (or length) on a **Result** clears any filling selection and reloads the hint for the new product card.

**Customer preference**:
Cover and case **Item** choices only. Protector is tier-owned on the **Composed sellable**, not a preference.

**Add-on**:
An accessory (or optional extra) line at item **MSRP**, chosen during customisation.

**Authorization hold**:
An uncaptured Stripe payment for the ballpark total (composed sellable **MSRP** + preference/add-on **MSRP**s + shipping + tax). Card details are taken; charge happens only on Accept (or via top-up if the final total exceeds the hold).

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
> **Domain expert:** "No. Protector is **tier**-owned on the **Composed sellable**. Fillings come only from the **Filling Template**. **Customer preference** is cover and case only."
>
> **Dev:** "What if the operator doesn't pick a filling mix at assign?"
> **Domain expert:** "Assign is blocked until they confirm one. The UI shows the **Default Filling Template** for that **Composed sellable** as a hint, plus a short preview of its filling lines (variant, qty). They must actively select — usually the default, sometimes an override."
>
> **Dev:** "What does the operator see while assigning?"
> **Domain expert:** "Two sections: **Product** (size×tier, non-filling lines — mostly read-only) and **Filling mix** (default hint, dropdown, variant/qty preview). Both update when size or tier changes. Save only after they confirm a filling template."

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
A 60–120 word direct-answer block immediately after the page H1 (or H2 on sectioned pages). Stored as optional `seo_answer` on **Storefront product** and blog content; falls back to `seo_description` then `description`. Primary pattern for AEO/GEO fact density.
_Avoid_: burying the answer below fold or inside client-only modals

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
- Protector is **tier**-owned on the **Composed sellable**, not a **Customer preference**. Fillings come from **Filling Templates** only.
- "media" / landing slot images vs **Media Asset** — slot overrides and slide-in config paths are consumers; the library record is the **Media Asset**. Hybrid refs: new attachments prefer Asset id; legacy URL strings still count toward **Used**.
