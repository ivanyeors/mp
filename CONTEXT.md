# Mpillow (mp)

Inventory-backed catalog and storefront for custom pillows, bolsters, and accessories. Costings is the single source of sell price; storefront products are a projection of inventory.

## Language

**Item**:
An atomic inventory part (cover, filling, case, packaging, accessory, etc.) with optional cost and MSRP in Costings.
_Avoid_: SKU (ambiguous with storefront variant SKU), part (when you mean the sellable finished good)

**Sellable item**:
An **Item** with an MSRP set in Costings (`item_prices.msrp` not null). MSRP makes it **eligible** to be published as a storefront product — it does not mean it is for sale. Every active Item now carries an MSRP (preferences and add-ons are priced from it), so eligibility no longer discriminates on its own; whether an eligible Item is actually **Listed** is a separate, operator-set fact.
_Avoid_: accessory (category only — eligibility is signalled by MSRP, not category); reading "has an MSRP" as "is in the shop"

**Composed sellable**:
A pillow (`pillow_products`, size × **tier**) or bolster (`bolster_bom_lines`, short/medium/long **length**) built from a BOM of **Items**. Finished-good MSRP lives in `product_prices`. Existing DB columns may still be named `kind` / `pillow_kind`; human-facing language uses **tier**.
_Avoid_: product (when you mean the inventory BOM template, not the storefront listing)

**Tier**:
`basic` | `premium` for pillows. Bolsters use **length** only (short/medium/long), not tier. Protector (and related non-filling defaults) live on the **Composed sellable** and separate tiers — not a **Customer preference**.
_Avoid_: kind

**Storefront product**:
A shop listing (`products` + `product_variants`). A projection of inventory: auto-generated from pillows/bolsters or published from a **Sellable item**. When `is_auto_generated`, price/cost/compare-at are Costings-derived and locked.
_Avoid_: listing, SKU (use **Variant** for the priced unit)

**Listed**:
Whether a **Sellable item** is actually on sale in the shop. Recorded by its **Storefront product** — `products.status = 'active'` with at least one `product_variants.is_active` — which is exactly what the shop query filters on, so there is nothing else to keep in step. Operators flip it per family under Settings → Products → Accessories; un-listing archives to `draft` and never deletes, so re-listing restores the same product rather than minting a duplicate. Items group into one product per (category, name), with sizes as **Variant**s — one switch covers Cervical Neck Support XS–L.
_Avoid_: a `sell_as_accessory` column on `items` (a second source of truth the projection already answers); "published" (that is the one-time create, not the on/off state); deleting an un-listed product

**Variant**:
A priced, stocked unit of a **Storefront product**, linked to inventory via `item_id`, `pillow_product_id`, and/or `price_key`.
_Avoid_: option (UI option values are not the variant itself)

**Costings**:
The single write surface for item and product prices: cost, MSRP, and compare-at (`item_prices`, `product_prices`), and for **Service** prices (`service_prices`, edited at Costings → Service fees).
_Avoid_: pricing page, product editor (those only display mirrors)

**MSRP**:
The authoritative sell price set in **Costings**. Mirrored to `product_variants.price` and Stripe.
_Avoid_: price (when you mean the editable source — use MSRP), list price

**Legacy product**:
A **Storefront product** that is not inventory-linked (`is_auto_generated = false` and no costing link on variants). Hand-editable; should be adopted or retired.

**Result**:
A customisation submission with optional **Authorization hold** and operator assignment. After assignment it links to a **Composed sellable** (size×tier or length) and a **Filling Template**. Accepted Results become an **Order** after successful payment capture (when a hold exists).

**Draft Result**:
A **Result** that has not entered the money path: `mp_config_responses.status` is null. Measurements typed into the configurator and autosaved, before any **Authorization hold** and before in-store finalization. The only state a guest may write — `/api/results/hold` writes `held`, and in-store finalization writes `held` via `buildInstoreReviewOnlyPatch`, so a non-null status means the submission is live and configurator writes are refused.
_Avoid_: "unsaved" (a Draft Result is persisted); "unfinalised" (`is_final` records that the Telegram message was sent, not a lifecycle state); cart

**Paired build**:
An **Mpillow** **Result** (the *anchor*) and an **Mbolster** **Result** (the *companion*) bought together when the Rule graph's **Flow route** to Mbolster fires: the configurator's two-step stepper, where step 2 is the Mbolster configurator in paired mode (height only, then its own customisation page, Staff x-ray included) and can be skipped. Linked by `paired_build_id`, the anchor's id on both rows. The two share one **Authorization hold** and one checkout. Each **Result** is assigned on its own, but the shopper accepts them together into one **Order**, and may drop the Mbolster at that point. Shipping is charged once, on the anchor. Ending the anchor ends the pair; ending the companion leaves the anchor and its hold alone — until money has moved for the pair (a Balance payment paid, or the hold captured), after which the companion can no longer be dropped on its own (ADR 0026).
_Avoid_: "bundle" (a storefront `product_type`, and a marketing claim the glossary forbids); two **Orders** for one hold; a companion accepted, released or charged shipping on its own

**Result access token**:
The `access_token` uuid on a **Result** — a bearer capability proving "I am this Result's customer" without a **Customer** sign-in. Minted when the **Draft Result** is created (or at hold, for a Result that has none) and kept across re-submits, so an **Owner**'s retry never locks them out; travels in the status-page link of the held, assigned, SLA-reminder and restock emails. Verified by `authorizeResultAccess` (`lib/results/access.ts`).
_Avoid_: Stripe checkout `session_id`; the **Result** id itself (an identifier, never a credential)

**Owner**:
Whoever may act on a **Result** without being **Staff**: a holder of its **Result access token**, or a signed-in **Customer** whose id or email matches the row. Exactly one implementation — `authorizeResultAccess` — so the two ways of being an Owner cannot drift into two different checks. An Owner receives a redacted payload; **Staff** receive the full one.
_Avoid_: "the customer" (a **Staff** member assisting in store is not the Owner); "authenticated" (an Owner may be a signed-out guest)

**Customisation session**:
The unit a **Reference photo** hangs off, keyed by a `session_id`. For **Mpillow** it is the configurator `responseId` (`mp_config_responses.id`); for **Mbolster** it is a UUID minted upfront in the hold draft and reused as the `responseId` at hold. Because the session id becomes the **Result** id, one id addresses both a session's reference photos and its Result across both products.
_Avoid_: Stripe checkout `session_id`; **Visit** (analytics browsing session)

**Reference photo**:
Staff-uploaded imagery attached to a **Customisation session** (`config_upload` table) while assisting a build — e.g. the customer's current pillow, posture, or a sample build. Compressed server-side and stored in the `media` bucket, but **not** registered in the **Media Asset** library (DAM). Delivered to the build team via the **Mpillow** Telegram group and the **Result** detail gallery (both products). Visible only when **Staff assist mode** is on.
_Avoid_: **Sizing photo** (the customer's own front/side photos — a separate, untouched feature)

**Sizing photo**:
The customer's own front/side body photos captured in the configurator to size a build (`mp_config_response_photos`, base64 data URLs, Telegram-only). A separate, pre-existing feature that this work does **not** change.
_Avoid_: **Reference photo** (staff-uploaded build references in `config_upload`)

**Discovery source**:
The visitor’s answer to “How did you hear about us?” captured on configurator preview (mp-config, mp-basic, mbolster-config) and required for authorize / in-store save. Stored on the **Result** as a stable option id (plus free text when Other). Operators edit the bilingual option list under Landing Site → **Forms** — option-list editing only, not a customization-steps CMS.
_Avoid_: referral, referral source, lead source (partner/voucher collision); **Customer preference**; **Add-on**; conflating with **Entry source**

**Source**:
The auto-set channel provenance of a **Result** — how the submission arrived: `manual` (in-store / operator-created), `online_customization` (configurator submission), `online_purchase` (paid online), or `staff_assisted` (an **Assisted customisation** — the configurator opened through a **Staff** member's **Assist link**, stamped server-side when that code resolves and never taken from the request). Free text with no check constraint, so a fourth value is a labelling change, not a migration. System-set, not operator-edited; shown as a badge on the Results table.
_Avoid_: **Location** (the operator-editable place a Result originated); **Discovery source** (self-reported "how did you hear"); **Entry source** (machine **Visit** origin); keying deferred-payment behaviour on `staff_assisted` — a **Result** settles by **Balance payment** because it has no **Authorization hold**, not because of its Source (ADR 0016)

**Location**:
A physical place a **Result** can originate and an **Appointment** can be booked at. Stored in the `partners` table with `type: own | partner` — `own` = Mpillow studios; `partner` = an external clinic (**Local Ambassador**) shown on `/our-partners` when `visible`. A separate `bookable` flag (default on) says whether it takes **Appointment** bookings — `visible` never does (own studios are saved `visible=false`); the customer picker lists bookable Locations that have an address, and staff flip `bookable` from Settings → Appointments (gear sheet). Each booked event is stamped with the Location id (private extended property) and the Admin Panel calendar shows the Location as a coloured **dot** with a legend. Operators pick a Location per **Result** (distinct from the auto **Source** badge) and manage the list under Settings → **Locations**.
_Avoid_: conflating with **Source** (auto channel provenance), **Discovery source**, or **Entry source**; calling an `own` studio a partner; a separate `locations` table (it is the `partners` table extended — ADR 0012)

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
A named filling recipe in the **Admin Panel** (Configure) catalog for **Mpillow** (and bolster where applicable), scoped to **one or more sizes** (lengths for **Mbolster**). Nothing in a recipe is size-specific — the nine **cells**, the **Derived pack list** and the canonical fingerprint are identical whatever the pillow measures — so one recipe commonly serves several sizes rather than being re-authored per size. The set of sizes it serves is its **Size membership**. One template = all nine **cells** (**Section** × **sub-section**) as a single recipe. The persisted model must record **where** each filling **Item** goes (**Section** + **sub-section** + order within the cell) — not only a flat item list. A flat BOM projection (summed `item_id × count` across cells) is derived for stock/COGS display. A **Composed sellable** may designate one active template as its **Default Filling Template**. **Staff assist mode** may load and mutate a template’s mix for the live session, but must not create a catalog **Filling Template** from the configurator — create and **Promote** happen only in the **Admin Panel**. Every filling line must reference an inventory **Item** (no free-text shapes). Fillings never come from guest customer input or from raw filling lines on the composed sellable BOM. Affects COGS and fulfillment, not sell price.

**Filling configuration**:
The concrete spatial mix used on one customisation (**Result** / assist session): all **cells** with their filling **Item** lines. May start from a **Filling Template** and diverge. When present on a **Result**, it is a full spatial snapshot (fulfillment + analytics truth). Optionally also stores `filling_template_id` when the snapshot still exactly matches a catalog **Filling Template**. Analytics fingerprints are derived from the snapshot. Written at hold create when **Staff assist mode** supplied a mix; otherwise first written when **Staff** assigns in the **Admin Panel**. **Staff** may revise it in the Admin Panel after hold and send the updated build to the shopper. On shopper **Accept** or **Decline**, the **Result** retains that snapshot for records (Decline does not Stripe-capture payment — “capture” here means persist the mix, not charge the card).

**Unpromoted configuration**:
A **Filling configuration** (or equivalent recipe fingerprint) that has been used on one or more **Results** but is not yet a catalog **Filling Template**. Analytics ranks these by usage so **Staff** can **Promote** the highest ones into permanent templates.

**Promote** (fillings):
Staff action in the **Admin Panel** that turns an **Unpromoted configuration** into a named catalog **Filling Template**. Not available on the storefront configurator in v1.

**Placement** (pillow fillings):
One persisted filling piece in a **Filling Template** or **Filling configuration** snapshot: inventory `item_id` + **Section** + **sub-section** + slot (1–25) + **Layer** (`row_index`, 0–4). Source of truth for “where.” The pack list is derived by aggregating **Placements** — never an independently edited filling BOM, and never stored on a **Warehouse template**.

**Section** (pillow fillings):
One of the three vertical compartments of an **Mpillow**: `left` | `center` | `right`. Side-sleep support lives in left/right; back-sleep support in center. **Mbolster** does not use this enum — it has its own spatial schema (single long compartment, no piece cap in v1); only the filling **Items** come from the same inventory.
_Avoid_: “middle section” for the column (use **center**); **Filling section** as a longer synonym — prefer **Section** in this grid; conflating with **sub-section**; reusing the Mpillow section/sub-section enums for **Mbolster**

**sub-section** (pillow fillings):
One of the three bands inside a **Section**: `front` | `middle` | `back`. Together with **Section**, forms a 3×3 grid of **cells**. Canonical ids match the existing LLM model API (`front`, not `top`).
_Avoid_: “top” for this band; using “middle” alone without saying **Section** vs **sub-section**

**cell** (pillow fillings):
The addressable slot at one **Section** × **sub-section** (9 cells on **Mpillow**). Holds **1–5 Layers**, each holding filling **Item** pieces chosen from inventory (add/remove in assist or Configure). Cap: **at most 5 pieces per Layer**, so **at most 25 per cell**; the same **Item** may repeat (e.g. five × 6D Small in one **Layer**). Empty cells allowed. Each piece is one inventory-linked unit (qty 1 per row); stock/COGS flatten by summing identical `item_id`s across all cells — spatial columns remain the source of truth for placement.
_Avoid_: “max 5 pieces per cell” — that was the pre-**Layer** cap and is now the per-**Layer** cap

**Layer** (pillow fillings):
One depth plane inside a **cell**, stored as a **Placement**’s `row_index`: `0` = top/front in the top-down x-ray, increasing = deeper into the pillow. **1–5 Layers per cell.** Pieces **share** a Layer — several at the same depth lie side by side across the cell — so `row_index` is not unique within a cell; `row_index` null means Layer 0, which is how every recipe written before Layers reads. A cell of one Layer is stored with no `row_index` at all, so “side-by-side” and “one Layer” are the same state rather than two. Visual only: the pack list, COGS and the canonical filling fingerprint all ignore Layers, so re-layering a recipe never changes what the build team picks or how a **Result** is grouped. An **empty** Layer is not persistable and is not a thing — adding a Layer *is* placing a piece at a new depth, which is why the **X-ray editor**’s “Add layer” opens the filling picker. **Mbolster** has no Layers: one long compartment cannot stack a second plane (ADR 0008).
_Avoid_: “row” (the column is `row_index`, but the band inside a **Section** is a **sub-section**, not a row); “stack depth” for the count of *pieces* — a Layer holds up to five; treating a Layer as a group that can itself be “stacked”, which is just two Layers

**Insert order** (pillow fillings):
The step at which a piece goes into its **Section** when the pillow is assembled — one numbered sequence per **Section** (left, center, right); **sub-sections** and **Layers** are not part of it. Stored as a **Placement**'s `insert_order` (1-based, a per-Section sort key); null = not authored, which sorts last so a piece added after ordering is simply the next step. Authored by drag in Configure → **Filling Template** beside the **Derived pack list**, shown (and editable) on **Result** detail assign, and snapshotted with the **Filling configuration** like a **Layer**. Assembly only: the pack list, COGS and the fingerprint ignore it. The template's **Assembly notes** (`bom_templates.notes`) carry the nuances a sequence cannot. **Mbolster** has none — its single compartment is already an ordered slot list.
_Avoid_: "insert order" for the slot number inside a **cell**; deriving it from **Layer** depth (a Layer is where a piece sits, not when it goes in); a second per-Section filling list — the steps are the Section's **Placements**, only sequenced

**Spatially authored** (pillow fillings):
Whether a **Filling Template**'s **Placements** were laid out by a person or auto-generated. Operational test, **both** halves required: the recipe occupies **more than one Section**, *and* it uses `left` and `right` either together or not at all. The second half exists because spanning two **Sections** alone is not authorship — the two XL templates hold 16 and 17 pieces, so they overflow the three `left` **cells** into `center` while `right` stays empty, and they are the same artefact as the eight that never leave `left`. Per **Section**, side-sleep support belongs in left/right, so a recipe that fills one flank and not the other describes no pillow anyone can build. Derived from the **Placements** themselves on read — never a stored column, never a workflow state, so it cannot go stale against the data it describes. The cause is the 2026-07-24 backfill, which materialised **Placements** for every legacy template from flat `bom_template_lines` (quantities only, no spatial information) using a fill-cells-in-order spread that fills all three left **cells** before reaching center — so a recipe that omits `left` entirely did *not* come from it, and the warning should not claim it did. Surfaced as an advisory warning in the **X-ray editor** and the Configure template list; never blocks a save. **Mbolster** has no **Section** enum and is never evaluated for it.
_Avoid_: treating it as a stored flag, a **triage** state, or something **Staff** tick off; conflating with **Promote** (which turns an **Unpromoted configuration** into a catalog template — a different act entirely); "unauthored" meaning the template has no **Placements** (it has them; they were guessed)

**X-ray editor** (pillow fillings):
The editable **Placement** surface: the pillow silhouette with dive-into-a-**Section**, the radial filling picker, add/remove/drag-to-reorder **Layers**, and per-piece removal. One component, three surfaces — the configurator under **Staff assist mode**, Configure → **Filling Template**, and **Result** detail assign — so **Staff** learn the interaction once. Renders read-only (no edit affordances) when given no filling **Items** and no change handler, which is how the shopper's completed-preview x-ray uses the same renderer. Visual guardrails are ADR 0009; **Mbolster** uses its ordered compartment list instead and never the 3×3 pillow metaphor.
Every surface shows the **Derived pack list** beside it, and removing a filling there removes all of its pieces. Configure → **Filling Template** and the configurator under **Staff assist mode** dock the dived **Section**'s controls off the pillow art in the same Section editor panel (`XraySectionDock`) on a desktop or tablet; **Result** detail assign still edits them on the pillow, and phones keep them in the dock under it.
_Avoid_: calling the shopper's read-only preview x-ray an **X-ray editor**; the retired 3×3 **cell** grid of dropdowns (deleted — it was a second, divergent filling editor); assuming "editor" implies a separate component from the preview renderer

**Neck support** (Cervical Neck Support):
An **Accessories** **Item** that **Staff** may also place inside a **premium** pillow on the **X-ray editor**, drawn as a pill. Unlike a filling it is not part of the Costings row: each placed piece is charged at its own MSRP, like an add-on, and comes out of its own stock. Never on a basic pillow or an **Mbolster**; a **Filling Template** (scoped by size, never by **Tier**) may hold one, and a basic **Result** refuses it at assign.
_Avoid_: re-categorising it as a filling (it is still sold as an accessory); placing it free of charge

**Product dimensions** (x-ray):
The physical measurements the x-ray draws and budgets with, in millimetres, in one pure registry (`lib/spatial-fillings/dimensions.ts`, ADR 0019). Pillow geometry per **Size** — the silhouette (the M master scaled to the Size's width and body length, no neck tab), the **Section** widths at the protector's divider seams, the gusset heights (side 4''–8'', centre one inch lower) — comes from the 2018 drawings and is code only. Filling pouch, **Neck support** and **Mbolster** dimensions ship as code defaults and may be overridden per entry in **Product Visualize** (slice 12); a row wins, no row means the code value, Reset deletes the row. Pouch and **Neck support** dimensions (and a pouch's fine offset) describe the piece in a **Size** M pillow, the reference Size; every other Size scales them by its own proportions to M — width by the pillow width, length by the body length, thickness by the side gusset — because the fillings are cut to the pillow and one recipe serves several Sizes. On the x-ray the pillow fills the stage at every Size, so a filling keeps its share of the pillow from XS to XL while the fit budgets the Size's real millimetres. An entry nobody has measured resolves as a *fallback* (a plausible family-sized pouch) and is labelled so wherever it is shown. Never stored on the **Item** and never in a **Result**.
_Avoid_: dimension columns on `items`; editing pillow geometry anywhere; presenting a fallback as measured; a second registry keyed on `subtype` alone (live inventory leaves it null — key off the same descriptor the picker uses)

**Loft**:
The height a **cell** or **Section** of filling stands at: the sum of each **Layer**'s thickest piece, relaxed or compressed. A pillow **Size** has a max loft per **Section** — the gusset height (centre one inch lower than the sides) plus the loft allowance, 10 % by default because the case is cloth and gives — and the fit model budgets against it.
_Avoid_: one loft budget for the whole pillow (the centre is lower); treating loft as a stored value (it is derived on every read)

**Fit status**:
`ok`, `compressed` or `over`, derived on every read for each **Layer** (width against the **Section** width) and each **cell** (**Loft** against the **Size**'s budget), never persisted. `compressed` means it fits only by squeezing, each piece no further than its minimum; `over` means it does not fit even fully squeezed. Advisory, never blocking: an `over` cell warns and asks for a confirm on save or hold, like the **Spatially authored** warning. Compression is shared pro rata by each piece's compressible range.
_Avoid_: refusing a save on `over`; storing the status; a second rule set for the add / move refusal (it is the same function on the hypothetical result)

**Cross-section view**:
A live cut of the pillow beside every x-ray, on all three surfaces and the shopper's read-only preview: **Across** (left, centre, right **Sections** at a chosen **sub-section**) or **Along** (front, middle, back of the dived **Section**). The shell is a lens per **Section** at that Section's max **Loft**; each **Layer** a slab of its compressed thickness in the filling's colour, hatched when compressed, through the loft line in red when `over`. Reads the same fit object the x-ray uses; recomputes nothing.
_Avoid_: a second fit computation for the cut; edit affordances on the shopper's cut

**Soft cut**:
How the **Cross-section view** draws its pieces (ADR 0025): the fit's pieces, stacked gravity-first one **Layer** at a time from the back panel up, settled as soft bodies — each pouch fixed-length fabric held out by its fill, a **Neck support** a roll that flattens where it rests and is pressed — a little when firm; set soft, it shares a crowded cell's squeeze as far as fully squashed — inside a case that behaves as cloth: slack and sagging below its sewn outline when under-filled, standing to it when full. Display only: the spans, **Layers**, thicknesses and **Fit status** are the fit's, and nothing it draws feeds back. Deterministic, one outline per piece with a gap between. Tuned and switched off in Settings → Inventory → Configure → **Soft body**, one stored value for every surface.
_Avoid_: reading a loft or fit number off the soft shapes; "physics" for the fit model (the fit is arithmetic; only the drawing is physical); merging pieces into one mass

**Nudge**:
A fine, millimetre-step move of one piece within its **cell** (slice 08, gated on the calibration sign-off), persisted as visual-only offsets that never change the **cell**, the **Layer** or the **Insert order** — so the pack list and the fingerprint cannot see it. Distinct from a move, which changes the **cell** or **Layer**.
_Avoid_: letting a nudge cross a cell edge; reading offsets into anything but the drawing

**Natural settle**:
A display-and-fit pass between layout and fit: a pouch spreads front-to-back into an empty neighbouring **sub-section** of its own **Section** and **Layer**, thinning by volume (never below its minimum thickness), on screen and in the **Loft** arithmetic. The pillow's protector walls the three **Sections** and nothing else, so settle never crosses a Section and applies to every pillow **Size**; a product whose sub-sections are physically walled turns it off. Two views of one recipe: **Authored** — the **cells** as **Staff** placed them, shown in the dived **Section** with the settled outline as a ghost — and **Settled** — what the chamber does, the default everywhere else. It writes nothing: the **Placement** rows, the pack list, the fingerprint and **Promote** grouping are untouched.
_Avoid_: rewriting a **Placement**'s cell because it settled; spreading across a **Section** wall or a **Layer**; dynamic physics (gravity, sag between Layers) — settle is static and per plane (the **Soft cut** draws the physics, after settle, without changing it)

**Size membership** (Filling Templates):
The set of size keys a **Filling Template** serves, stored in `bom_template_keys` and the single authority for "does this recipe apply here". `bom_templates.key` survives as the **primary** key and is kept in step with the canonically-first member by the one writer that changes membership, so it is always a real member — a partial answer, never a divergent one. At least one size is required; a template serving none would be invisible in every list with no way back. Editing a shared recipe edits it for every size it serves, so the editor warns and offers a per-size copy (the **Fork**) rather than letting a size diverge by accident. Deleting is likewise not scoped to the size on screen. Past **Results** are unaffected either way: a **Filling configuration** is a snapshot, so a build already assigned keeps the mix it was built with.
_Avoid_: reading `bom_templates.key` as the scope (it is only the primary — filtering on it hides every template shared in from another size); a template with an empty membership; treating **Size membership** as a tier scope (Filling Templates have never carried **Tier**)

**Default Filling Template**:
The baseline filling mix for one Configure product card (e.g. Basic Size S, Premium Size M, Bolster medium). Stored on that **Composed sellable**, not on a warehouse preset name. Any template whose **Size membership** covers the card's size is eligible, including one authored at another size. Shown as a hint at assignment; the operator must actively confirm or override. Changing assigned size×tier (or length) on a **Result** clears any filling selection and reloads the hint for the new product card.

**Customer preference**:
Shopper-chosen **Item**s on a customisation preview. **Mpillow** (full/basic): cover and case only. **Mbolster**: case only (`bolster_case`) — no cover category in inventory or Configure for bolsters. When exactly one eligible case is available to choose, the preview auto-selects it. Protector (`pillow_protector` / `bolster_protector`) is owned on the **Composed sellable** BOM, not a preference.
_Avoid_: showing a Cover Style picker on mbolster-config; treating bolster protector as a shopper choice

**Add-on**:
An accessory (or optional extra) line at item **MSRP**, chosen during customisation. Preview cards use the **Item**’s primary **Media Asset** image (not **Product Visualize** overlays).

**Service**:
A priced act of labour Mpillow performs that consumes no inventory. Exactly three: Measurement (Premium), Measurement (Basic) and Re-adjustment, keyed `measurement_premium` / `measurement_basic` / `readjustment`. Priced in **Costings** (`service_prices`) and never an **Item**; a fourth is a migration plus a rule in code, never a row an operator invents (ADR 0024).
_Avoid_: an **Item** with a "service" category; an **Add-on**; "product"

**Service fee**:
The amount charged for a **Service** on a **Result** or an **Order**: the **Service**'s MSRP in **Costings**, never typed by **Staff** and never taken from a client. On an **Order** it is its own line (`order_items.kind = 'service'`) — never shipped, never stock-deducted, never returnable through RMA, outside the commission base and the free-shipping threshold, inside the taxable base.
_Avoid_: "fee" alone in money-ledger context (`order_payments.type = 'fee'` is Stripe's dispute fee — a cost to us, not a charge to the customer); "surcharge"

**Measurement service**:
**Staff** measuring a customer for a customisation. Charged automatically when the **Result**'s `measured_by_type = 'staff'`, at the rate for its **Tier** (`assigned_tier ?? suggested_tier`): Premium → Measurement (Premium), Basic → Measurement (Basic). **Mbolster** carries no measurement fee, whoever measured (owner, 2026-10-13). Self-measurement online is free. Derived on every repricing from who measured — never stored as its own flag.
_Avoid_: a customer-ticked option in the configurator; treating the "Have us measure you" link as the charge (the link books the visit; the charge follows who measured); "customisation charge"

**Authorization hold**:
An uncaptured Stripe payment for the ballpark total (composed sellable **MSRP** + preference/add-on **MSRP**s + shipping + tax). Card details are taken; charge happens only on Accept (or via top-up if the final total exceeds the hold).

**Balance payment**:
The immediate-capture Stripe Checkout that settles a **Result**: the amount owed above its **Authorization hold**, or the whole total when there is no hold. One mechanism, two readings — a top-up over a partial hold, and a full payment where the hold is zero — so an **Assisted customisation** settles through the same Checkout, the same webhook and the same re-entrant Accept as every other **Result**. The amount is **Costings**-derived like any other (composed sellable **MSRP** + preference/add-on **MSRP**s + shipping + tax); **Staff** never type it.
_Avoid_: "top-up" in customer-facing copy for what is the entire price; renaming the `topup_*` columns to match this term (in-flight rows depend on them — Balance payment is the domain word, the columns keep their names); **Authorization hold** (a Balance payment charges the card there and then, it does not authorize); treating it as a deposit or an instalment (one payment, in full, at the end)

**Pre-order**:
A customise-preview fulfillment mode when immediate build is not possible from current inventory: a required **Customer preference** line has `stock_available <= 0` (Mpillow: cover or case; Mbolster: case), **or** the recommended **Composed sellable** (size×tier / length) has buildable `<= 0`. Applies to **Mpillow** (full/basic) and **Mbolster**.

- **Live preview CTA:** recomputed from current inventory. When trigger is false, new shoppers see the normal hold CTA (e.g. Proceed) — not Pre-order. When true, CTA + waiting-time section use Pre-order copy (fixed i18n in v1). Waiting body tells the shopper **Staff will reach out shortly via WhatsApp** (not a numeric ETA; not CMS-edited in v1).
- **Persisted Result mode:** at hold create, if the shopper submitted under Pre-order, the **Result** keeps that mode (sticky for that submission).
- **Restock notice:** when inventory recovers enough that the Pre-order trigger would clear, open Pre-order **Results** in status **`held`** or **`assigned`** are **automatically** emailed that stock is back and they can Sign in in a few days to track customisation (**Result**) status (idempotent; skip expired/declined/captured/canceled; no Staff-triggered send in v1). New sessions on the configurator flip back to the normal hold CTA. (Restock channel remains email unless separately changed; preview waiting promise is WhatsApp outreach.)

Same money path: hold → **Result** → assign → Accept → capture → **Order**; no separate Pre-order queue in v1.
_Avoid_: conflating soft “low stock” badges with Pre-order; calling the held **Result** an **Order** before Accept + capture; “Purchase” as the hold CTA (payment is still an **Authorization hold**); UI-only Pre-order that vanishes after Stripe; bolster-only rules; CMS editing of waiting-time copy in v1; manual restock notice as the v1 path; inventing a per-SKU ETA field in v1

**Appointment**:
A scheduled in-store Customisation or Re-adjustment session booked via Mpillow's own booking flow — a **Location** picker over one shared availability (appointment settings + central-calendar `freeBusy`) that writes the event to Google Calendar via API (Calendar Events on `admin@mpillow.com`). The picked **Location**'s address is stamped onto the event; a **Local Ambassador (clinical)** partner is a `type='partner'` **Location** (ADR 0013). A **Re-adjustment appointment** is linked to a **Customer**, a purchase and (when paid) an **Order** through its **Re-adjustment booking**; a **Customisation appointment** is still linked to nothing.
_Avoid_: Order, Result, Customer journey (a Customisation appointment is not linked to an Order); the retired Google Appointment-Scheduling iframe (booking is now first-party)

**Appointment reminder**:
A WhatsApp utility message for an **Appointment** — day-before Confirm/Reschedule, optional morning-of nudge, or cancel + rebook link.
_Avoid_: Result SLA reminder (operator-facing held-Result reminders)

**Customisation appointment**:
An **Appointment** for first-time pillow/bolster customisation; type inferred from calendar event summary match strings.
_Avoid_: mp-config **Result** (digital submission flow)

**Re-adjustment appointment**:
An **Appointment** for post-purchase fitting/adjustment; type inferred from calendar event summary match strings.

**Re-adjustment**:
A post-purchase visit to re-tune one purchased pillow or bolster — booked as a **Re-adjustment appointment** by a signed-in **Customer** against one purchase, recorded as a **Re-adjustment booking**. Costs the Re-adjustment **Service fee** unless it is a **Complimentary re-adjustment**. One booking re-adjusts one pillow.
_Avoid_: an anonymous **Appointment** (the pre-ADR-0024 state); "readjust" in UI copy

**Complimentary re-adjustment**:
A **Re-adjustment** charged nothing. **Premium Mpillow only**; `readjustment_free_visits` (default 1) per unit, while the booking date is within `readjustment_free_window_days` (default 60) of the purchase's `orders.paid_at`, counted in Singapore calendar days with the purchase day as day 0. A booking that is booked, attended or a no-show uses one; one that is cancelled or expired gives it back. Decided server-side by `evaluateReadjustment` (`lib/readjustment/eligibility.ts`).
_Avoid_: "warranty" (the 10-year fillings warranty is separate and still charges the fee); computing it on the client; Basic Mpillow or **Mbolster** (always charged)

**Re-adjustment booking**:
The `readjustment_bookings` row linking a **Customer**, one purchase (an `order_item`, or "not listed"), a slot, a **Location**, and either *complimentary* or a paid service **Order**. What **Staff** read at the visit; its id rides on the calendar event as a private extended property.
_Avoid_: conflating with `appointment_reminders` (WhatsApp reminder state keyed by calendar event — unchanged); a payment recorded on the booking instead of an **Order**

**Appointment RSVP status**:
The customer's Google Calendar invite response on an **Appointment** event — `accepted | declined | tentative | needsAction` (mirrors Google's `responseStatus`). Read live from the guest attendee on the central-calendar event (no local store) and shown in the **Admin Panel** calendar as a status **icon** + left-border accent (`accepted`→**Confirmed** tick green, `declined`→**Declined** cross red, `tentative`→**Tentative** question amber, `needsAction`→**Invited** envelope gray; a Google-cancelled event, listed only when the admin opts in, shows **Cancelled** ban struck-through), alongside the event **type** icon (Customise sparkle / Readjust refresh) — two visual channels: fill + icon = type, icon + accent = RSVP. The chip is one line (type icon · guest name · status icon; no time, no type text). Icon + label are spelled out in the legend and the event click-detail sheet. Requires **email** to be required (so the guest is always an attendee) and `sendUpdates: "all"` on `events.insert`/reschedule (so Google actually sends the invite the customer responds to). Applies to the customer even when Staff books on their behalf — the invite still lands on the customer's email.
_Avoid_: **Result** Accept/Decline (shopper accepting the *build* → capture → **Order**, `cursor/accept-decline-capture-order`); "pillow status" (it is a status **pill**); recoloring the whole event by RSVP (the **type** color — customisation/re-adjustment — must survive; RSVP is a second, additive channel).

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
An authorized back-office actor: a signed-in, active **Member** (or bootstrap allowlist). Shares the same Supabase session as a possible **Customer** record; when both apply, **Staff** wins for Menu chrome.
_Avoid_: treating every signed-in user as staff; calling the back office “Settings” in UI copy; saying “admin” in product language when you mean **Staff**

**Users & permissions**:
The **Admin Panel** page at `/settings/users` that manages **Members**, **Roles**, **Staff profiles** and **Telegram links** in one place, built like GitHub's organisation settings (ADR 0023). Tabs: Members, Staff profiles, Roles (the permission matrix) and Telegram. Guarded by the `users` **Permission**.
_Avoid_: "Admin Users" and "Staff Management" (retired page names — their URLs redirect to the matching tab)

**Member**:
One **Admin Panel** login: an `admin_users` row, bound to an auth user on first sign-in with the invited email. Holds exactly one **Role**. States: **Invited** (no auth user bound yet), **Active**, **Deactivated**. A signed-in active Member is **Staff**. A Member can hold several **Staff profiles** (a shared studio account) or one (a personal login).
_Avoid_: "admin user" (collides with the **Admin** role); "user" in code (collides with **Customer** and `by_user`); a Member as a person — the person is the **Staff profile**

**Role**:
A named set of **Permissions** (`admin_roles`). **Owner** and **Admin** are built in, locked, and grant every permission, including pages added later. Every other role is a **custom role**: editable on **Users & permissions** → Roles, and granted a new page only when someone ticks it. Nobody who is not Owner or Admin can create, edit or assign a role that holds a permission they lack.
_Avoid_: treating the role name as the authority — code checks **Permissions**, never role names; per-member exceptions (a one-off access pattern is a new custom role)

**Permission**:
One entry in the code catalog (`lib/auth/permissions.ts`): an **Admin Panel** page (one sidebar entry, its URL and every API behind it) or a **Telegram action**. A **Role** either has it or does not; there is no per-member override, and no view-only level except on Customers, where `customers` is seeing the page and `customers-edit` is making changes (ADR 0027 i). Some pages require another (Page Builder, Blogs, Partners and Products pick images, so they require Media); ticking one ticks its requirements.
_Avoid_: "scope"; a key that gates several pages (the catalog is one key per page); hiding a page in the sidebar as the only protection — its URL and APIs refuse too

**Owner**:
The built-in **Role** that can grant or remove Owner. There is always at least one active Owner; the last one cannot be demoted or deactivated. A bootstrap-allowlisted email that signs in with no **Member** row is provisioned as Owner.
_Avoid_: using Owner for day-to-day access — **Admin** has every page too

**Staff profile**:
A named person who works under a **Member** (`mp_staff`). A **Result** is "measured by" a Staff profile, and a **Telegram link** belongs to one. A profile cannot sign in and never has more access than its Member. Archived, never deleted, so historical attribution survives; archived profiles drop out of pickers but keep their name on old **Results**. On a shared login, the person at the device can pick who they are "working as", which defaults new Results' measured-by and names them in the Audit Log — attribution, never authorisation.
_Avoid_: "staff member" (ambiguous with **Staff**); treating a profile as a login

**Telegram link**:
A **Staff profile**'s bound Telegram user id (redeemed with a one-time `/link` code) plus the **Telegram actions** granted to it (reply to Google reviews, moderate **Shop reviews**). Effective access = the Member's **Role** permissions ∩ the link's granted actions, and only while the profile and the **Member** are both active — deactivating a login silences every Telegram account under it.
_Avoid_: a list of Telegram people separate from logins (the retired **Telegram operator** list); granting a link an action its login's role does not hold

**Staff assist mode**:
Extra configuration controls on the customisation preview (**Your Custom Mpillow** / parallel bolster preview) that appear only when **Staff** is signed in. Used on a shared in-store device — the shopper uses Staff’s device; no separate customer session or multi-device sync. Guests (no **Staff** session) see the normal preview with no filling editors — cover/case/**Add-on** flow unchanged. Layout: **left** = pillow silhouette (cover/case overlays + selected **Add-on** preview images under it) and, when Staff, the **x-ray filling editor**; **right** = shopper controls including **Add-on** selection, cover, case, contact, discovery, shipping, hold CTA.
_Avoid_: co-browse / remote assist; requiring a **Customer** Sign-in for in-store customisation; duplicating this editor as a third surface beyond preview + **Result** assign; showing assist chrome to non-Staff; moving **Add-on** *selection* off the right rail (left only *previews* selected add-ons); **Assisted customisation** (customer alone on their own device, no card, **Staff** building afterwards — this mode is its opposite: one shared device, **Staff** driving, a card at the end of the session)

**X-ray filling editor**:
Staff-only left-column interaction on the pillow silhouette: an “x-ray” / cutaway art direction that reveals internal **Sections**. Hover highlights the three **Sections**; click dives into that section’s **sub-sections** to add/remove inventory filling **Placements** (max 5 per **cell**). Not shown to guests.
_Avoid_: treating this as a shopper-facing game; requiring WebGL/3D unless research proves 2D SVG insufficient

**Assist link**:
`/mp-config?assist=<code>` — one reusable, unguessable code per **Staff** member (held on `admin_users`), copied once and sent to any number of customers over WhatsApp, email, or shown as a QR. The code is resolved server-side and the **Staff** id it resolves to is never read from the request; rotating the code revokes that one member's link and nobody else's. A session opened through it is an **Assisted customisation** and carries **Source** `staff_assisted`.
_Avoid_: a **Referral** `?ref` / `?partner` code — that attributes a sale to a **Partner account** and pays **Commission**, while an **Assist link** attributes nothing and pays nobody; a single-use link minted per customer (one code per **Staff** member, reused forever); treating it as a **Staff** credential — whoever holds it has no `admin_users` row, no **Staff** session, and never sees **Staff assist mode**

**Assisted customisation**:
A **Customisation session** a **Staff** member originates with an **Assist link**. The customer answers the measurement questions, either in person on a **Staff** device or alone on their own, and sends them to the build team **from the questionnaire** with contact details only. No cover, case or shipping is chosen yet, and **no Authorization hold is taken**. The signed-in account on that device is never linked as the buyer. **Staff** then compose the fillings in the **Admin Panel** on **Result** detail, the same assign card and the same **X-ray editor** as any other **Result**, which opens pre-filled with the recommended mix. Save assignment sends the build back. The customer reopens the finish page with those fillings shown read-only, picks cover, case, **Add-ons** and shipping, and pays the full price by **Balance payment** (ADR 0017). Only then does the **Result** become an **Order**, born `confirmed` and shipped through normal fulfilment. Premium **Mpillow** only in v1. It attributes nothing: `partner_id` stays null and no **Commission** is earned.
_Avoid_: **Staff assist mode** (a shared in-store device with **Staff** at the controls and extra editors on the preview, gated on the `results` permission — the assisted customer is not **Staff**, is not in the room, and sees none of that chrome); **Partner-assisted customisation** (the partner's device, launched from **Partner Hub**, an **Authorization hold** taken up front, a **Referral** stamped for **Commission**); "staff assist" as shorthand for this in commit messages, code, or copy — it names the other thing; calling the unpaid submission an **Order**

**Customer**:
A shopper's record (`customers` row), created at checkout, at **Sign in**, or by the Shopify import. It **has an account** once a **Sign in** is bound to it (`auth_user_id`). Menu pill → **Profile**; logout lives in account UI, not the landing Menu.
_Avoid_: conflating with **Customer preference** (cover/case choices only)

**Order**:
A paid platform sale in our DB (post Accept + capture when a hold existed). Analytics sales windows for platform **Orders** use **`paid_at`**, not `created_at`. Unpaid checkouts are outside realized margin.
_Avoid_: calling a held **Result** an **Order**; using `created_at` for Analytics sold-margin windows

**Analytics channel**:
Admin Panel → Analytics view filter: `all` | `orders` | `shopify`. **All** = paid platform **Orders** ∪ **Shopify order mirror** for the same date range. In-store inventory sells without an **Order** are not a revenue channel. Accepted **Results** count only via the **Order** they become.
_Avoid_: live Shopify Admin API reads from the Analytics page; a third “in-store sell” toggle in v1

**Shopify order mirror**:
Durable DB finance facts for Shopify paid sales (orders, lines, refunds, sync cursor). Source for Analytics Shopify / All’s Shopify half. Distinct from `shopify_sales_queue` (ops inventory commit). Shopify Admin API is ingest-only (webhook + catch-up); Analytics reads the mirror only.
_Avoid_: merging mirror tables/jobs with the sales queue; treating live API list price × qty as P&L truth; building new features on Shopify — it is ad hoc and not on the roadmap: no linking Shopify orders to **Customers**, no syncing prices to Shopify, no mapping its products (owner, 2026-10-13). The mirror stays a read-only Analytics input. Shopify customers are imported once (ADR 0028); their orders stay unlinked.

**Others**:
Unmapped or uncosted **Shopify order mirror** lines. Revenue and units still count; COGS is zero/unknown until Staff fixes mapping or **Costings** and re-resolve graduates the line. Freeze-at-sale: healthy already-costed lines are not rewritten on every Costings edit.
_Avoid_: dropping unmapped lines from totals; silently understating Shopify sales

## Shopify customer migration (ADR 0028)

**Migrated customer**:
A **Customer** whose row was created or enriched from the Shopify customer export. It carries one `migrated_customers` row: Shopify customer id, Shopify-era order count and spend, Shopify tags and note, the consent snapshot, the **Import batch** and `claimed_at`. Readable by the service role only.
_Avoid_: "imported account" or "migrated account" — no login moved, and Shopify credentials never leave Shopify; until it is **Claimed**, a Migrated customer is a row, not an account; writing Shopify-era figures into `customers.total_orders` / `total_spent` — those are platform-derived and recomputed by `updateCustomerStats`

**Claim**:
The first **Sign in**, after import, by the person who owns a **Migrated customer**'s email. `linkCustomerToAuthUser` binds `auth_user_id` as it would for any customer row. The Claim stamps `claimed_at` and issues the **Welcome-back voucher**, both in one transaction and both exactly once.
_Avoid_: "invite" or "activation" — nothing is created in `auth.users` before the person signs in, and no Supabase invite is sent

**Claim link**:
The per-customer link in a campaign email, `/account/welcome?c=<token>`. The token is opaque; only its hash is stored. It prefills the email on the welcome page and attributes the click.
_Avoid_: "magic link" — a Claim link never signs anyone in; proof of the email is always the **Sign in** itself

**Welcome-back voucher**:
The one `coupons` row issued to a **Migrated customer** at **Claim** (`issued_for = 'welcome_back'`). It is bound to that **Customer**: valid only while they are signed in and checking out with the account email. It is a shop-cart voucher, like every coupon today.
_Avoid_: "store credit", "points", "gift card" (none exist); describing it as usable on a customisation — **Results** price with no discount (`app/api/results/hold/route.ts:648`, `lib/results/paired-hold.ts:118`)

**Marketing consent**:
Whether a **Customer** agreed to marketing email, stored as `subscribed | not_subscribed | unsubscribed` with its source and timestamp. Every change is appended to `customer_consent_events`.
_Avoid_: inferring consent from having an account, a past **Order**, or a **Claim**; treating Shopify's "no" as `unsubscribed` — it may mean "never asked"

**Import batch**:
One import that wrote to the database, run from **Admin Panel** → Customers → Import from Shopify. It records the file's name and SHA-256, the counts by outcome, the **Staff** who ran it, and when. It is the unit of reconciliation, of resume, and of undo.
_Avoid_: "upload" — the file itself is never uploaded or stored; the browser reads it and sends rows

**Account status**:
Whether a **Customer** row is bound to a login: *Signed up* (since `account_linked_at`) or *No account*. It is derived from `auth_user_id` in the Customer overview (`admin_customer_overview`), never stored as text. It applies to every **Customer**, not only Migrated ones. For a **Migrated customer**, *Signed up* and **Claimed** usually coincide. They differ when the person already had an account before the import: that Customer is *Signed up* at once, and is **Claimed** at their next **Sign in**.
_Avoid_: "registered", "member" (a **Member** is **Staff**) or "active" for this; reading *Signed up* as **Claimed**

## Rules Engine (recommendations)

**Rules Engine**:
The single recommendation authority: a Staff-authored node workbench (entry point inside the **Product Visualize** tab) whose published **Rule graphs** derive every measurement → size / tier-suggestion / **Filling Template** recommendation. See ADR `docs/adr/0010-rules-engine-single-recommendation-authority.md`.
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
The recorded path (nodes and matched values) that produced a recommendation — the "why" shown to operators at assign, and replayable on the canvas. Shoppers see no why line: band and match detail is lost once answers meet a **Combine node**, so a trace-built line named only the shoulder band and never what chose the template. It returns when a reason covering the whole decision replaces it.

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

## Reviews (PRD-google-review-replies)

**Google review**:
A review of the business on Google Maps, read through the Google Business Profile API and kept as a `google_reviews` row keyed by its resource name. The only kind of review that gets a public reply from us.
_Avoid_: the Places API testimonials on the landing page (`lib/google/places-reviews.ts` — Google's top five, read-only, never stored)

**Shop review**:
A review a signed-in **Customer** leaves on a **Storefront product** (`product_reviews`). Starts `pending`; a **Shop moderator** approves it onto the product page or rejects it. No public reply.
_Avoid_: "product review" when the source matters on a Telegram card — the card says SHOP REVIEW

**Review card**:
The Telegram message in the measurements group (`MP_CONFIG_TELEGRAM_CHAT_ID`) for one **Google review** or **Shop review**. Its first line names the source. A Google card carries Claude's suggested reply and Post / Redraft / Skip; a review manager's reply to the card replaces the draft, and nothing reaches Google until someone taps Post on the version they are looking at.
_Avoid_: auto-posting a draft; a card that keeps its buttons after someone acted

**Reply type**:
Which kind of reply a **Google review** gets, chosen from its star rating in code (`lib/reviews/reply-style.ts`), never by the model: **Thank-you** (4–5★), **Constructive** (3★ or no rating), **Service recovery** (1–2★ — apologise for the specific problem, own it, offer one concrete next step, and always ask them to message us on the staffed support WhatsApp; no promotion and no compensation in public). A 1–2★ **Review card** is flagged SERVICE RECOVERY so someone also follows up with the customer personally. When the rating later moves into another type — after we answered, skipped, or never carded it — the review **reopens** as a fresh card whose reply replaces the one on Google.
_Avoid_: thanking or selling under a 1–2★ review; promising refunds or freebies in a public reply; giving the automated appointment WhatsApp line in a reply

**Telegram operator**:
Retired name for a **Telegram link** (the table is still `telegram_operators`). A person may press buttons on **Review cards** only through a **Telegram link** on their **Staff profile**, managed on **Users & permissions** → Telegram. Everyone in the group sees cards; only a linked profile whose **Member** is active and whose **Role** and link both grant the action can act. The old **Review manager** maps to both Telegram actions, **Shop moderator** to moderating **Shop reviews** only.
_Avoid_: a Telegram list separate from logins — access is one tree: **Member** → **Staff profile** → **Telegram link**

## Customer CRM (ADR 0027)

**Customer note**:
A dated, authored remark by **Staff** about a **Customer**, in `customer_notes`. Only the service role can read it. Notes are never edited; a correction is a new note.
_Avoid_: `customers.notes` — the **Customer** can read their own row (`0037_customer_auth.sql:14-18`), so that column is retired

**Customer timeline**:
Everything that happened with a **Customer**, newest first, merged when it is read from the tables that already record it: **Orders**, **Results**, **Re-adjustment bookings**, **Returns**, reviews, emails, **Customer notes** and **Follow-ups**. Each kind is shown only to **Staff** holding that source's **Permission**.
_Avoid_: "activity log" or "events table" — nothing is copied

**Segment**:
A named, saved set of Customers-list filters, shared by all **Staff** with `customers` and counted live. A **Segment** and the same filters in the URL always return the same **Customers**.
_Avoid_: "list" (a Segment is a query, not a frozen set of people); "audience" (that is email marketing's word for a Segment narrowed by consent)

**Follow-up**:
A dated to-do about one **Customer**, assigned to a **Staff profile**, and done or not done.
_Avoid_: "task" or "ticket" (it is not a support queue); assigning it to a **Member** or a login — a person works as a profile

**Aftercare message**:
A service message, by email and WhatsApp, about something the **Customer** bought. There are two: the **Review request**, once per Customer, 14 days after delivery; and the **Check-up reminder**, yearly, stating that the visit is paid and its fee. Email uses the transactional transport and is on unless switched off (`aftercare_email`). WhatsApp is off until the customer opts in (`aftercare_whatsapp`). Every change is recorded with who made it and how. Neither ever carries an offer.
_Avoid_: calling it marketing, or gating it on **Marketing consent** (migration PRD) — the one exception is the **Check-up reminder**, which offers a paid visit and so goes only to customers who agreed (ADR 0027 h); anything promotional belongs to `PRD-email-marketing`; an email about the free re-adjustment window (there is none, owner, 2026-10-20)

**Review request**:
The one message, by email and (when they opted in) WhatsApp, that asks a **Customer** for a **Google review**, with an unconditional *"need anything else? message us"* line. It goes once per Customer, ever, to every eligible Customer alike.
_Avoid_: choosing who is asked by satisfaction, returns or ratings, or offering anything for a review — both break Google's review policy

**Linked Google review**:
A **Google review** that **Staff** have confirmed belongs to a **Customer**. Google never says who wrote a review, so the code only suggests a match, from the name and the timing of a **Review request**.
_Avoid_: linking automatically; treating a review-link click as proof of a review

**Contact status**:
What is known about how to reach a **Customer**, each part derived from a fact: *Verified email* (they have signed in with it); *Sign-in methods* (emailed code, Google); *Valid mobile* (the number on file passes `isValidPhone`); *Replied on WhatsApp* (the number has written to our WhatsApp line, as recorded in `whatsapp_inbound`).
_Avoid_: "verified mobile" — nothing verifies a phone number by code; letting **Staff** tick "verified"

## Shipping (ADR 0020, ADR 0022)

**Shipping method**:
A row in `shipping_methods` a shopper picks at checkout (e.g. Standard, Express), scoped to `countries`. Its **Rate source** decides how it is priced; `free_above` and free-shipping coupons apply to either source. Edited in Settings → Shipping.
_Avoid_: "courier" (a method may be served by different couriers per address)

**Rate source**:
How a **Shipping method** is priced: `flat` (its `base_rate`, the same for every address in its countries) or `easyship` (a **Live rate**, the default for new methods). A live method's `base_rate` is its customisation order rate: Results charge it flat because they don't quote couriers. It is never charged at checkout.
_Avoid_: "fallback rate" — a live method with no quote is hidden, not priced flat (ADR 0022)

**Live rate**:
The price of an Easyship **Shipping method** for one cart to one postal code: Easyship's courier price for the courier the method's strategy picks (`cheapest`, `fastest`, `best_value`, or one pinned **Courier service**), plus the method's markup, rounded up to its increment. Quoted by the server from the **Variants** in the database — never from a client price — and cached as a **Rate quote**.
_Avoid_: treating it as a stored price on the method; showing a live rate the checkout route would not charge

**Hidden live method**:
A live method with no quote for this cart and address (no token, couriers down, wrong currency, no box for an item type, or no allowed courier serves it) is left out of checkout. Only an active flat method guarantees the shopper an option, and the Shipping page warns when there is none.

**Rate quote**:
One Easyship rates answer for one destination postal code and set of **Parcels**, stored in `shipping_rate_quotes` for the settings' TTL. The checkout page and the checkout route hash the same parcels to the same quote, which is how the shopper is charged exactly the rate they were shown.

**Parcel** (shipping):
One box a courier prices. Every pillow, bolster or bundle unit is its own parcel in its type's **Box for type**; accessories ride in the first box, or share one accessory box. Built by the pure `buildParcels`.

**Courier account**:
The one synced doc in `api_configs[slug=easyship]`, edited in Settings → Shipping → Couriers and pushed to the provider on Save & sync. It holds the addresses, boxes, shipping rules, tracking and webhook settings. Its address flagged default sender is where every quote and label ships from.
_Avoid_: "ship-from address" or "package profile" stored anywhere else

**Box for type**:
Which **Courier account** box an item type (pillow, bolster, accessory) ships in, plus one unit's content weight, set by the "Used for" chips on the Boxes tab. Kept on the doc only and never synced. A **Variant**'s own `weight_grams` wins over the content weight; the dimensions and tare always come from the box.
_Avoid_: "package profile"

**Courier service**:
One Easyship service (e.g. "Ninja Van Standard"), identified by its Easyship id. The one a shopper paid for is recorded with the **Order shipment**; Staff may choose another when buying the label.

**Order shipment**:
An **Order**'s Easyship shipment in `order_shipments` (one per order): the **Courier service** chosen at checkout and what it was quoted at, the label, and what the label cost. Server-only — what a courier costs us is never on `orders`, which customers read. The courier's name and its latest tracking status are on `orders`, because customers see those.
_Avoid_: putting carrier cost or label URLs on `orders`

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
- A **Result** measured by **Staff** carries a **Measurement service** **Service fee**; on its **Order** that fee is a second line beside the build
- A paid **Re-adjustment** is an **Order** with one **Service fee** line; a **Complimentary re-adjustment** has a **Re-adjustment booking** and no **Order**
- An **Assisted customisation** takes **no Authorization hold**; its **Result** reaches **Order** through a **Balance payment** for the full price after **Staff** assign the build in the **Admin Panel** — same Accept, same **Order**, no **Referral** and no **Commission** (ADR 0016)
- A **Media Asset** is the library record; landing slots, blogs, products, slide configs, and **Product Visualize** overlays are consumers. **Product slide section config** media stays code-config until adopted onto Assets.
- **Product Visualize** (tab on Store → Products) links cover/case **Items** to overlay **Media Assets** for the configurator silhouette; preview selection reflects that mapping (**C**: thumbnails on **Item**, overlay fit in Product Visualize when needed).
- The storefront Menu’s last pill is **Sign in** (guest), **Profile** (**Customer**), the partner portal (**Partner account**), or **Admin Panel** (**Staff**). Pill precedence when one session holds multiple roles: **Staff > Partner > Customer**. Access is additive — the pill routes to the highest surface, it does not ban the lower ones (a Partner who is also a Customer can still open `/account` directly; `/settings` still requires **Staff**; the partner portal requires an approved **Partner account**).
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
> **Domain expert:** "**Product Visualize** on the Products page — pick a **Media Asset** per cover/case **Item**. The Your Custom Mpillow preview shows that overlay when the shopper selects the option."
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

## Partner portal

**Partner account**:
The login identity of a partner business: a `partner_users` row (mirroring the `admin_users` pattern) linking an auth user to a `type='partner'` **Location** row in the `partners` table. Approved self-serve signup creates/claims that Location row (`visible=false` until Staff flips it). Portal profile edits (company name, logo, write-up, location) write to the **same row** that powers `/our-partners` and appointment booking — one aggregate, one CRUD path. Edits apply **immediately** (hub and `/our-partners` both reflect them); Staff are notified and can one-click hide (`visible=false`) or revert — no draft/published split in v1. Logo guidelines (square, min dimensions, format) are shown at upload. Online-only referrers are rows with no address that never get booked.
_Avoid_: a separate partner-profile table that can drift from the **Location** row; "partner" alone when you mean the login identity vs the business row

**Partner application**:
The self-serve signup submission: the 8-field questionnaire — company name · ACRA UEN · business website (or main social page) · business category (physio / chiro / TCM / wellness / retail / other) · contact person name · contact mobile (WhatsApp) · business email (prefilled from sign-in) · "How do you plan to introduce Mpillow to your clients?" (free text, the reject-signal question) — plus recorded agreement to the partner terms. Verification is Staff eyeballing ACRA/website manually (no ACRA API in v1). Address/logo/write-up are profile settings after approval, not application fields. The agreement is a **static versioned legal page** in the repo (i18n): the application records `agreed_version` + timestamp; a later terms change = new version, existing partners re-accept on next hub entry. Status machine: `pending → approved | rejected`. "Become a Partner" (enabled only after agreeing to terms) submits the application; the applicant can sign in but sees only an "under review" screen while `pending`. **Approval gates the portal**: Staff approve → notification → full portal unlocks; reject → rejected state. No referral accrual, no commissions, no `/our-partners` publishing before approval.
_Avoid_: granting portal features at agreement time; treating the agreement page as the approval

**Partner sign-in**:
Partners use the same unified **Sign in** at `/account/login` (menu → login) — no separate door, no password. Methods: Google OAuth, or passwordless email where the one shared email carries **both** a 6-digit code and the magic link (form gains a code-entry step via `verifyOtp`); this upgrade applies to all roles, not a partner fork. Partner sessions have a **7-day absolute cap** enforced app-side in the partner portal guard (`last_sign_in_at` check → force re-auth); Customer/Staff session behavior unchanged.
**Backup email**: the partner may add one backup email in hub settings, verified once by OTP; it becomes a second recognised sign-in identity on the same **Partner account** — signing in with it uses the normal OTP flow and lands in the same hub. No custom recovery-code bridge.
_Avoid_: a partner-specific login page; capping the global Supabase session (it would hit Customers/Staff); idle-timeout semantics ("7 days max" is absolute); server-minted sessions for the "backup code" path

**Partner Hub**:
The partner-facing portal at `/partner` — pill label and page title "Partner Hub". Requires an approved **Partner account** (pending applicants see the under-review screen; guests are sent to **Sign in**). Home = gamified earnings/milestone dashboard; also profile settings, backup email, and WhatsApp support CTA.
**Partner notifications**: email for application approved/rejected · "you just earned a referral" at attributed capture (the delight moment) · milestone rung reached · payout made (proof attached) · re-accept terms. Partners with WhatsApp may **opt in** to receive the same events via the existing WhatsApp Cloud API (per-partner channel preference; templates required). Cross-cutting requirement: **all** outbound utility emails (customers and partners alike) get properly styled branded HTML templates.
_Avoid_: "Partners page" (collides with `/our-partners` and the `partners_page` CMS table); `/partners` as the route; undated or unstyled notification emails

**Referral**:
A deterministic credit linking a **Customer**'s customisation/purchase to a **Partner account**. Channels: (1) the partner's unique **referral code / shareable link+QR** (stamped on the Visitor at landing, carried onto the **Result** at hold and the **Order** at capture; typeable in an optional "Partner / referral code" field on the customisation contact step — mp-config and mbolster-config — and on shop checkout, validated inline against active partner codes), (2) **partner-assisted customisation** — a signed-in partner runs the customisation flow for a customer, and the partner session stamps the attribution on the Result automatically. Self-reported **Discovery source** is never attribution.
Conflicts: **one Referral per Order, never split — whoever closed the sale gets the commission.** Priority: partner-assisted session > code explicitly typed by the customer > most recent `?ref` link within the **30-day** attribution window (last-touch overwrites).
Partner-visible detail (PDPA): **partner-assisted** referrals (their own clients / walk-ins — data the partner entered) show **full customer details** for verification; **link/code** referrals show **masked identity only** (those customers never consented to sharing identity with the clinic) plus product, commission status, and release countdown. Headline hub metric = distinct customers with attributed **paid Orders**, plus an "in progress" pipeline line (attributed Results not yet captured). The Admin Panel always sees all details.
_Avoid_: "client" for the partner (ambiguous with the partner's own patients — say **Partner**); Discovery source as a commission trigger; Entry source as attribution

**Partner-assisted customisation**:
The existing configurator (mp-config / mbolster-config) launched from **Partner Hub** ("Customise for a customer") with the signed-in partner session stamping the **Referral** on the Result — same questions, same photos, no duplicated form. Differences from the guest flow: the recommendation surface shows **size only** (no **Filling Template** recommendation), **Add-on** cards and the cross-flow **Upsell card** are hidden (commission scope is pillow/bolster only), and the finish panel is co-branded — title "[Partner name] × Mpillow" with the partner's uploaded logo beside the Mpillow logo and a partner-personalised description (replacing the generic "Customize finish… optional add-ons…" copy). Keeps: cover style, case style, contact → shipping, and the **Authorization hold** — the customer enters their own card on the partner's device. This is **not** Staff assist mode: no x-ray filling editors, no admin tools.
_Avoid_: rebuilding the questionnaire inside the hub; showing filling-template recommendations to partners; add-on upsells in the partner-assisted flow; **Assisted customisation** (a **Staff** member's **Assist link**, the customer's own device, no **Authorization hold**, no **Referral** and no **Commission**)

**Commission**:
The money a **Referral** earns a partner on pillow/bolster units in an attributed **Order**. Lifecycle: `held → released → paid | void`. Created **held** at capture (`paid_at`); **released** when the RMA **Return window** closes (30 days after `delivered_at` — the commission countdown in Partner Hub IS the return window; in-store handover sets `delivered_at` at handover). An RMA **refund** resolution voids that item's commission; **exchange/replacement keep it** (a pillow was still sold). Released commissions accumulate toward the next payout. Scope: pillow/bolster products only — never add-ons, accessories, shipping, or tax.
**Framing (compliance)**: the partner is the ACRA-registered **business entity**; commission is framed as retail/referral **margin to the clinic**, never a per-referral payment to an individual clinician (AHPC Code §5.7 — registered AHPs' recommendations must not be reward-influenced; §5.7.1 requires disclosing financial interest). The partner agreement requires patient-facing disclosure of the partnership; the co-branded assist flow doubles as that disclosure. Individual-clinician perks lean non-cash.
_Avoid_: releasing on a payment-dated clock while the return window is still open; clawback-after-release states; commission on add-ons; "kickback"-shaped copy aimed at individual clinicians

**Commission scheme**:
The per-partner configuration that prices a **Commission** unit: flat $ per unit or % base, settable per product (pillow / bolster), negotiated per partner agreement. Edited **only** in the Admin Panel — partners see their earned amounts in Partner Hub, never the scheme editor. A default scheme applies unless the partner has an override.
_Avoid_: one hardcoded global rate; exposing scheme configuration in Partner Hub

**Partner self-purchase**:
A purchase made in the partner's **own signed-in account** at a partner-specific discounted rate (admin-set, like the **Commission scheme**), capped at an admin-set number of units. Distinct from earning **Commission**: self-purchase gets the better price instead, and self-purchased units **never count toward the Milestone track** (a partner must not buy their way to a permanent rate bump). A partner's own referral link used anonymously still follows the normal commission model.
_Avoid_: conflating the self-purchase discount with commission; uncapped self-purchase pricing; self-purchases moving the milestone bar

**Payout**:
How released **Commission** leaves the building: **manual only in v1** — Staff transfer via PayNow or bank using the payment details the partner uploaded in Partner Hub (PayNow QR image and/or bank account fields), then record the payout with an uploaded **proof-of-payment image**. The partner sees their accumulated released balance, payout status, and the proof attachment in the hub — full transparency. No minimum threshold (thresholds that trap small balances are a documented churn driver). Staff work payouts from a dedicated Admin Panel **Partner commissions** page (per-partner ledger: held / released / paid, countdowns, payment details, application queue nearby); the Orders table gets a partner-source **badge** on attributed rows, but money workflows never live inside Orders rows.
_Avoid_: automated disbursement rails in v1; payout minimums; undated "pending" balances anywhere in the hub

**Milestone track**:
The Partner Hub's gamified spine: a **cumulative lifetime** ladder of attributed pillow/bolster units, rungs spaced roughly geometrically (~5 / 15 / 40 / 100; exact values Admin-tunable). Progress moves **at sale** (attributed Order capture) for instant feedback; a later refund-void decrements the count. Each rung grants: a **one-time cash bonus** + a **permanent per-unit rate bump** (tiers ratchet up, never demote) + an escalating **non-cash professional perk** (certified-fitter site listing → demo set → co-marketing → top-tier recognition). **Endowed progress**: the bar starts with 2 units credited, with the reason stated ("launch partner bonus"). Social proof is a "top N%" percentile chip — no leaderboard. Occasional surprise gift at rung crossings is the only variable-reward element. Money is separate and always follows the **Commission** lifecycle. No periodic resets in v1.
_Avoid_: moving the bar only at commission release (kills the feedback loop); resetting progress; demoting tiers; full ranked leaderboards at this partner count; hard streaks for monthly-cadence sellers

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
Chiropractors, physiotherapists, and wellness coaches addressed on `/our-partners` and clinical proof surfaces (credibility, clinician review) — not the celebrity ambassadors section. Modeled as a `type='partner'` **Location** (the `partners` table); visible partners render on `/our-partners`.
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

**Product Visualize**:
Admin Panel tab on Store → Products (formerly the standalone **Product Builder** page, which code identifiers and the `/settings/product-builder/*` routes still name) where **Staff** map inventory cover/case (and related) **Items** to overlay **Media Assets** (and optional fit) for the customisation preview silhouette (**Your Custom Mpillow** / bolster preview), and view/edit **Filling visual** colors. Card thumbnails come from the **Item**; non-default overlay placement on the SVG is presentation config here. Choosing a cover/case on the preview shows the linked overlay from this page.
_Avoid_: a parallel upload silo outside **Media Assets**; hard-coding overlay files in the configurator; putting this under Inventory Configure (recipe) instead of the Products presentation tab

**Filling visual**:
The x-ray rendering identity of one filling **Item** type: a designer-authored fluid SVG shape (default mapped in code config) plus a color. The default color is per filling **family** (3D, 6D, 6D+), so every size and variant of a family ("6D Fold", "6D Round") shares it; the family is read from whichever of `subtype`/`name` carries the density, because live inventory leaves `subtype` empty. Each front piece carries its type + size written inside it. Its drawn size comes from **Product dimensions** × the pillow **Size**'s scale, never from `items.size` alone. Staff can see the mapping and edit the **color** in **Product Visualize**; shape changes are a designer/code update. Multiple pieces in a **cell** render compressed but individually distinct (two pouches read as two). Guardrails: ADR `docs/adr/0009-xray-filling-visuals.md`.
_Avoid_: rect/bounding-box cropping of filling shapes; gooey-merging pieces so the count is unreadable; generating random blob shapes in v1

**Landing section**:
One ordered block of the landing page (`landing_sections`): a `section_type` from the code-defined
catalog, a stable `slug`, a position, a visibility flag, and a `content` JSONB of **Staff** overrides.
Content is an override layer, not the copy itself — each section resolves `content` first and falls
back to its i18n message, and images fall back to the `landing_*` **site_settings** slot then a code
default. Built-in types are seeded and cannot be deleted or re-slugged (their components branch on
`slug`, and the slug is also the journey-analytics anchor); custom types can be added, renamed and
removed. Edited in the **Admin Panel** under Landing Site → Page Builder.
_Avoid_: bare **Section** (that is an Mpillow filling compartment — `left | center | right`); "block"
(no block model exists — a section is the smallest unit); **Product section template** (the
learn-more slide-in primitive, a different catalog)

**Section draft**:
A pending, unpublished edit to one **Landing section**, held in nullable draft columns on that same
row. A row with no draft columns set has no pending change. Drafts are per-section, so two **Staff**
editing different sections never clobber each other. Invisible to shoppers until **Publish**; visible
to **Staff** in **Preview mode**. Images referenced only by a **Section draft** still count as
**Used** in the **Media Asset Library**.
_Avoid_: a single shared whole-page draft row (last-write-wins across every section — strictly worse
than per-row writes); "revision" (that is a **Publish snapshot**); treating a draft as a second
published state

**Publish** (landing):
The single **Staff** action that applies every pending **Section draft** to the live landing page at
once — atomically, in one database function — and writes one **Publish snapshot**. Discard is its
mirror: clears draft state, touches nothing published. This is the only path from draft to live.
_Avoid_: conflating with **Rule graph** publish (Rules Engine versions), with publishing a
**Sellable item** to the storefront, or with **Promote** (fillings); per-section publishing; treating
a save as a publish

**Publish snapshot**:
The full ordered **Landing section** array as it stood at one **Publish**, with timestamp and author.
Append-only, bounded by retention, written by the publish function and read only by Restore — never
by the render path. Restore writes a snapshot back into the **Section draft** layer, never straight
into published state, so a recovery is reviewed in **Preview mode** before it ships.
_Avoid_: "revision" / "version" used interchangeably in UI copy (pick one label and keep it);
restoring directly to live; treating snapshots as a backup of anything but section content

**Preview mode**:
A render of the real landing route showing **Section draft** content, gated on an admin context and
embedded same-origin in the Page Builder. It reuses the landing route's own section renderer — there
is no second renderer, so preview and production cannot diverge. Visitor-facing chrome is shown and
**Staff** chrome is not; journey analytics, Google Analytics and Speed Insights record nothing; and
the reviews section serves fallback testimonials rather than calling the paid API on every reload.
_Avoid_: the customisation preview (**Your Custom Mpillow** / bolster preview — an unrelated
surface); Next draft mode (it would drop the Data Cache and bill a reviews call per reload, and its
bypass cookie is browser-wide); the retired "Preview" link that opened the published site in a new tab

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
- Left-packed default **Filling Templates** — resolved: fixed **by hand**, never by a migration. All ten default pillow templates are not **Spatially authored** (eight sit entirely in `left`; the two XL templates spill 1–2 pieces into `center`; none uses `right`), because the 2026-07-24 backfill invented their **Placements** from flat legacy lines. An automatic re-spread was considered and rejected: it would be a guess about a physical product, and a guess that *looks* authored is worse than an artefact that is labelled. So the build ships detection plus an advisory warning, and **Staff** author the ten in the **X-ray editor**. The backfill migration is not reverted or edited — it is idempotent and skips templates that already have **Placements**. Timing: production carries no **Result** filling snapshot or fingerprint yet, so re-authoring invalidates nothing; after the first real hold, moving a piece between **cells** changes the canonical fingerprint and regroups **Unpromoted configuration** ranking.
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
- Cover/case overlays on configurator — resolved (**C**): **Product Visualize** on the Products page maps **Items** → **Media Asset** overlays (optional fit); **Item** supplies card thumbnails; preview reflects the mapping when cover/case changes.
- **Add-on** cards — resolved (**A** + clarify): selection stays on the **right**; left shows image previews of *selected* add-ons under the silhouette (desktop row / mobile stack). **Item** primary **Media Asset** supplies the image.
- **X-ray filling editor** — resolved as Staff-only left silhouette interaction: hover → 3 **Sections**; click → dive into **sub-sections** / **Placements**. Art direction = x-ray/cutaway of fillings inside the pillow shape.
- X-ray implementation — resolved (**A** + amendments): layered interactive SVG. Designer-exported silhouette + per-cell boundary paths become `clipPath` regions; each filling type = one fluid path asset tagged by item subtype + color; blobs conform via nested clipping; deterministic 1–5 compressed-but-distinct layout per cell; `framer-motion`/`gsap` (installed) for hover/dive; **`flubber` approved** as the one new dependency (shape morphs), installed when the editor is built. Gooey merge rejected as default (piece count must stay legible). Guardrails ADR: `docs/adr/0009-xray-filling-visuals.md`.
- Filling-type → shape + color map — resolved (**C** extended): shape defaults in code config now; **Product Visualize** surfaces the mapping read/write for **color** (shape stays designer/code). Migrate shape editing into Product Visualize only if shapes churn without deploys.
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
- Partner vs studio vs booking place — resolved: one domain term **Location** (`type: own | partner`) stored as **additive columns on the `partners` table** (no rename; prod-safe). Auto **Source** channel badge is untouched; operators add an editable **Location** per **Result**. **Local Ambassador (clinical)** = `type='partner'` **Location** on `/our-partners`. Booking is first-party (**Location** picker + one shared availability + Google `events.insert` stamping the Location address); the Google iframe retires. ADRs: `docs/adr/0012-locations-unified-partner-model.md`, `docs/adr/0013-custom-multi-location-booking.md`.
- Calendar "accept/decline" vs **Result** Accept/Decline — resolved: new term **Appointment RSVP status** (the guest's Google `responseStatus`, read live from the attendee; not the shopper *build* Accept → capture → **Order**). Shown as a status **pill** + type label in the **Admin Panel** calendar. Prereqs: **email required** (guest always an attendee) + `sendUpdates: "all"` on `events.insert`/reschedule (so Google actually sends the invite the customer responds to). See glossary. (Q1/Q2 Jul 2026.)
- Guest "add to their own calendar" (item ②) — resolved: a **Save to calendar** button on the booking confirmation screen serving a hand-built `.ics` (`text/calendar`, no new dependency) — on phones this triggers the native add-sheet (iPhone) / intent chooser (Android), no per-provider dropdown. Complements the Google invite email, which already carries an addable `.ics` for any provider once `sendUpdates: "all"` is on.
- Booking "dupe" — resolved: the reported dupe was **two stacked slide-in drawers** (booking Sheet opened on top of a learn-more slide-in; the flow also mounted twice — global `BookAppointmentHost` + an inline hero `BookAppointmentSheet`). Fix: booking converts from **Sheet** to a page route **`/[lang]/appointments`** (`?type=customisation|readjustment`), fronted by a **pill overlay** (Customise/Readjust, styled after the hero tier pills) before navigation; direct load with no `type` renders the same pills inline. All 7 entry points navigate instead of `openBookAppointmentSheet()`; host + inline sheet + `mpillow:open-book-appointment` event removed. Backend unchanged. ADR 0013 amendment (2026-07-27).
- Landing draft storage — resolved: **Section draft** state lives in nullable draft columns on
  `landing_sections`, not in a separate draft table or a single shared whole-page draft row. Reason:
  per-row drafts preserve the concurrency the current per-row writes already have (a shared row makes
  two **Staff** clobber each other across the whole page), and keeping drafts on the same row means
  `lib/media/replace.ts` and the **Used / unused** scan reach them by widening the selected columns
  rather than learning a new table. **Publish snapshot** history is a separate append-only table,
  written by the publish function and never on the render path.
- Landing preview transport — resolved: same-origin `iframe` of the real landing route under
  **Preview mode**, with selection and scroll as direct DOM reads against the frame. Cross-origin
  machinery (message protocols, content-source-map encoding) is unnecessary because the storefront and
  **Admin Panel** share an origin — which also means adding a `frame-ancestors` CSP or splitting the
  origins would break the Page Builder, and is worth an ADR before anyone tries.
- Landing "Publish" was overloaded — resolved: **Publish** (landing) applies **Section drafts** to the
  live landing page. It is not **Rule graph** publish, not storefront publishing of a **Sellable
  item**, and not **Promote** (fillings). Say which one in prose whenever the surface is ambiguous.
