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
Whether a **Sellable item** is actually on sale in the shop. Recorded by its **Storefront product** — `products.status = 'active'` with at least one `product_variants.is_active` — which is exactly what the shop query filters on, so there is nothing else to keep in step. Operators flip it per product under Settings → Products → In the shop (`?tab=shop`), which lists the **Storefront product**s on the Products tab, never Inventory directly: an Item gets there by being **Pushed** first. Un-listing sets the product to `draft` and never deletes, so re-listing restores the same product rather than minting a duplicate. Items group into one product per (category, name), with sizes as **Variant**s — one switch covers Cervical Neck Support XS–L.
_Avoid_: a `sell_as_accessory` column on `items` (a second source of truth the projection already answers); "published" (that is the one-time create, not the on/off state); deleting an un-listed product

**Pushed** (to Products):
A **Sellable item**'s family made into a **Storefront product** from Inventory, after a price check: Costings must hold a cost and an MSRP for every size, Staff confirm each size's cost, MSRP and margin, and the server refuses the push if Costings changed since (ADR 0045). A first push makes a `draft` product; a later one adds sizes new to Inventory as **Variant**s of the same product. Pushing never puts anything on sale: that is **Listed**.
_Avoid_: "publish" for the switch that sells it; pushing an Item Costings has not finished

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
A **Result** that has not entered the money path: `mp_config_responses.status` is null. Measurements typed into the configurator and autosaved, before any **Authorization hold** and before in-store finalization. The only state a guest may write — `/api/results/hold` writes `held`, and in-store finalization writes `held` via `buildInstoreReviewOnlyPatch`, so a non-null status means the submission is live and configurator writes are refused. A guest's Draft carries their email (`customer_email`) from birth: the Mpillow configurators ask it on the first question, beside the name, and save nothing for a guest before it (ADR 0049); a Staff device's Draft gets its email at the hold, at *Save without purchasing*, or when Staff link it to a **Customer** (ADR 0051). Results lists Drafts under *Unfinished*, with where they stopped. A guest reopens their own Draft on any device from its **Continue link**, which the **Draft reminder** emails carry (ADR 0050).
_Avoid_: "unsaved" (a Draft Result is persisted); "unfinalised" (`is_final` records that the Telegram message was sent, not a lifecycle state); cart

**Continue link**:
`/{lang}/mp-config?draft={id}&token={access token}` (or `/mp-basic`, wherever the Draft was started, recorded as `data.configurator`): reopens a guest's own **Draft Result** on any device, proven by its **Result access token**. The device takes the Draft over as its own session, the form is filled with its saved answers, and it opens on the first question left unanswered, or on the preview; the id and token then leave the address bar. Only a **Draft Result** of an **Mpillow**, never an **Assisted customisation** (ADR 0050).
_Avoid_: finish link (an assigned Assisted customisation's, ADR 0017); status page link (a live Result's)

**Draft reminder**:
One of up to three emails to a guest who gave their email on the first question and stopped: 1 day, 1 week and 1 month after their **Draft Result** was last saved, each with its **Continue link**, then no more. Only to a **Customer** with **Marketing consent**, sent like a campaign (an Unsubscribe link), never for a Draft **Staff** measured or sent an **Assist link** for, and over once the shopper holds or pays for a pillow (ADR 0050).
_Avoid_: abandoned cart (there is no cart); payment reminder (an assigned build's balance)

**Paired build**:
An **Mpillow** **Result** (the *anchor*) and an **Mbolster** **Result** (the *companion*) bought together when the Rule graph's **Flow route** to Mbolster fires: the configurator's stepper, where step 2 is the Mbolster configurator in paired mode (height only, then its own customisation page, Staff x-ray included) and can be skipped, and only once both builds are customised does the Mpillow page ask for contact and shipping (step 3) and show the summary the pair is paid from (step 4). Linked by `paired_build_id`, the anchor's id on both rows. The two share one **Authorization hold** and one checkout. Each **Result** is assigned on its own, but the shopper accepts them together into one **Order**, and may drop the Mbolster at that point. Shipping is charged once, on the anchor. Ending the anchor ends the pair; ending the companion leaves the anchor and its hold alone — until money has moved for the pair (a Balance payment paid, or the hold captured), after which the companion can no longer be dropped on its own (ADR 0026).
_Avoid_: "bundle" (a storefront `product_type`, and a marketing claim the glossary forbids); two **Orders** for one hold; a companion accepted, released or charged shipping on its own

**Result access token**:
The `access_token` uuid on a **Result** — a bearer capability proving "I am this Result's customer" without a **Customer** sign-in. Minted when the **Draft Result** is created (or at hold, for a Result that has none) and kept across re-submits, so an **Owner**'s retry never locks them out; travels in the status-page link of the held, assigned, SLA-reminder and restock emails. Verified by `authorizeResultAccess` (`lib/results/access.ts`). Unique across every Result except a **Paired build**'s companion, which carries its anchor's token so one link proves ownership of both builds; a companion a re-hold unlinks gives its token up.
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
The customer's own front/side body photos captured in the configurator to size a build (`mp_config_response_photos`, WebP base64 data URLs, Telegram-only). Screened by Claude before it is kept (ADR 0047): a rejected photo is never stored, and only a photo whose `screening_status` is `passed` is attached on Telegram. Separate from **Reference photos**, which are not screened.
_Avoid_: **Reference photo** (staff-uploaded build references in `config_upload`)

**Discovery source**:
The visitor’s answer to “How did you hear about us?” captured on configurator preview (mp-config, mp-basic, mbolster-config) and required for authorize / in-store save. Stored on the **Result** as a stable option id (plus free text when Other). Operators edit the bilingual option list under Landing Site → **Forms** — option-list editing only, not a customization-steps CMS.
_Avoid_: referral, referral source, lead source (partner/voucher collision); **Customer preference**; **Add-on**; conflating with **Entry source**

**Source**:
The auto-set channel provenance of a **Result** — how the submission arrived: `manual` (in-store / operator-created), `online_customization` (configurator submission), `online_purchase` (paid online), or `staff_assisted` (an **Assisted customisation** — the configurator opened through a **Staff** member's **Assist link**, stamped server-side when that code resolves and never taken from the request). Free text with no check constraint, so a fourth value is a labelling change, not a migration. System-set, not operator-edited; shown as a badge on the Results table.
_Avoid_: **Location** (the operator-editable place a Result originated); **Discovery source** (self-reported "how did you hear"); **Entry source** (machine **Visit** origin); keying deferred-payment behaviour on `staff_assisted` — a **Result** settles by **Balance payment** because it has no **Authorization hold**, not because of its Source (ADR 0016)

**Location**:
A physical place a **Result** can originate and an **Appointment** can be booked at. Stored in the `partners` table with `type: own | partner` — `own` = Mpillow studios; `partner` = an external clinic (**Local Ambassador**) shown on `/our-partners` when `visible`. A separate `bookable` flag (default on) says whether it takes **Appointment** bookings — `visible` never does (own studios are saved `visible=false`); the customer picker lists bookable Locations that have an address, and staff flip `bookable` from Settings → Appointments (gear sheet). Each booked event is stamped with the Location id (private extended property) and the Admin Panel calendar shows the Location as a coloured **dot** with a legend. Operators pick a Location per **Result** (distinct from the auto **Source** badge) and manage the list under Settings → **Locations**.
A partner with several clinics has one Location per clinic: its **main** row, which is also the partner business (the **Partner account**, referral code, **Commission Pool**, logo, write-up, `visible`), and a **branch** row for each other clinic, with `parent_id` set to the main row (ADR 0037). A branch holds only its place (an optional `branch_name` such as "Novena", the address, postal code and `bookable`) and takes the partner's name. It shows on `/our-partners` under its partner, never as a partner of its own. A Location's display name is "partner · branch name" when the clinic has a name. Staff edit all of a partner's clinics in its Settings → Partners dialog, and the partner edits them in Partner Hub settings.
_Avoid_: conflating with **Source** (auto channel provenance), **Discovery source**, or **Entry source**; calling an `own` studio a partner; a separate `locations` table (it is the `partners` table extended — ADR 0012); a table or JSON list of a partner's addresses (each clinic is a Location row — ADR 0037); counting a branch as a partner (it has no referral code, account or commission)

**Self-collect**:
A shipping method whose `collect_location_id` names the own **Location** (studio) the customer collects from, instead of a courier delivering. Offered on customisations only (the configurators, the Assisted finish and Staff re-configure), never in shop checkout. The customer gives only who collects; the **Result**, and the **Order** made from it, carry the studio's address with the customer as recipient and a `collect_location` marker, so every "has an address" check holds, the Order is not born delivered, and no courier label can be bought for it. Always a flat rate. A **Paired build**'s Mbolster is collected with its Mpillow.
_Avoid_: "pickup" (Easyship's word for where a courier collects parcels from us); a null shipping address (that means an in-store handover or an unfinished Assisted customisation)

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
Machine-captured traffic origin at **Visit** start: UTM when present, else referrer host, else Direct. Recorded beside it: the landing path, an ad click id, and the app whose built-in browser the Visit began in. Read back as a channel (how it came: Paid, Social, Organic search, …) and a **platform** (who sent it: Google, Instagram, TikTok, …). A **Customer**'s first entry point is the Entry source of the earliest Visit tied to them, derived, never stored (ADR 0007 amendment 2026-11-13).
_Avoid_: **Discovery source** (self-reported on **Result**); referral source; campaign (when you mean the full Entry source)

**Drop-off**:
The end of a **Visit** without conversion: last page, last section when known, and dwell — not a surveyed reason.
_Avoid_: bounce (too narrow); exit intent; “why they left” as captured fact

**Drop-off reason**:
What a person tells us stopped them, asked on the configurators and at checkout as they move to leave, and on a **Result**'s decline step (`drop_off_reasons`; PRD-crm-retention-loop slice 10). Self-reported: one closed answer, with optional text on *Something did not work* and *Other*. Holds no contact details: tied to the **Visit** and **Visitor** ids, or for a decline to the **Result**. A **Visitor** merged to a person links their answers to them too, so the card promises only that it asks for no name or email, never that answers are anonymous. Kept apart from a **Drop-off**, which records only where a **Visit** ended. Asked at most once per browser per 30 days; the reply offers help, never a discount.
_Avoid_: treating it as a **Drop-off** or the reverse; inferring a reason nobody gave; **Discovery source** (how they found us, not why they left)

**Unsubscribe reason**:
Why a **Customer** unsubscribed from marketing email, in their words: one closed answer (*Too many emails*, *Not relevant to me*, *I have the pillow I need*, *I wasn't happy with my pillow*, *I never signed up for these*, *Other* with an optional line), asked once the unsubscribe has taken effect and never before it (`customer_unsubscribe_reasons`; PRD-crm-retention-loop slice 11). Asked on the unsubscribe page, in their account when they turn *Email me news and offers* off, and recorded by **Staff** when a customer asks them to stop. Optional; at most one per unsubscribe; never asked after a spam complaint or a mail client's one-click unsubscribe, and no email is sent to ask. Unlike a **Drop-off reason** it is kept on the Customer, shown beside *Lost*, because the person is known and is told so.
_Avoid_: delaying, blocking or undoing an unsubscribe for it; offering a discount or asking them to stay; treating an answer as consent

**Filling Template**:
A named filling recipe in the **Admin Panel** (Configure) catalog for **Mpillow** (and bolster where applicable), scoped to **one or more sizes** (lengths for **Mbolster**). Nothing in a recipe is size-specific — the nine **cells**, the **Derived pack list** and the canonical fingerprint are identical whatever the pillow measures — so one recipe commonly serves several sizes rather than being re-authored per size. The set of sizes it serves is its **Size membership**. One template = all nine **cells** (**Section** × **sub-section**) as a single recipe. The persisted model must record **where** each filling **Item** goes (**Section** + **sub-section** + order within the cell) — not only a flat item list. A flat BOM projection (summed `item_id × count` across cells) is derived for stock/COGS display. A **Composed sellable** may designate one active template as its **Default Filling Template**. **Staff assist mode** may load and mutate a template’s mix for the live session, but must not create a catalog **Filling Template** from the configurator — create and **Promote** happen only in the **Admin Panel**. Every filling line must reference an inventory **Item** (no free-text shapes). Fillings never come from guest customer input or from raw filling lines on the composed sellable BOM. Affects COGS and fulfillment, not sell price.

**Filling configuration**:
The concrete spatial mix used on one customisation (**Result** / assist session): all **cells** with their filling **Item** lines. May start from a **Filling Template** and diverge. When present on a **Result**, it is a full spatial snapshot (fulfillment + analytics truth). Optionally also stores `filling_template_id` when the snapshot still exactly matches a catalog **Filling Template**. Analytics fingerprints are derived from the snapshot. Written at hold create when **Staff assist mode** supplied a mix; otherwise first written when **Staff** assigns in the **Admin Panel** — or earlier, when **Staff** lay it out on a **Draft Result** from its Result detail page before the customer submits (Mpillow only; the save moves no status, price or email, and the hold keeps it unless the configurator sends its own mix). **Staff** may revise it in the Admin Panel after hold and send the updated build to the shopper. On shopper **Accept** or **Decline**, the **Result** retains that snapshot for records (Decline does not Stripe-capture payment — “capture” here means persist the mix, not charge the card).

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
The step at which a piece goes into its **Section** when the pillow is assembled — one numbered sequence per **Section** (left, center, right); **sub-sections** and **Layers** are not part of it. Stored as a **Placement**'s `insert_order` (1-based, a per-Section sort key); null = not authored, which sorts last so a piece added after ordering is simply the next step. Authored by drag in Configure → **Filling Template** beside the **Derived pack list**, shown (and editable) on **Result** detail assign and in the Customer page's Re-adjust editor (in place of the pack list there), and snapshotted with the **Filling configuration** like a **Layer**. Each step says where its piece sits — its **sub-section**, and its **Layer** in a stacked **cell** — only so it can be found; where editable, a step's bin removes that one piece. Assembly only: the pack list, COGS and the fingerprint ignore it. The template's **Assembly notes** (`bom_templates.notes`) carry the nuances a sequence cannot. **Mbolster** has none — its single compartment is already an ordered slot list.
_Avoid_: "insert order" for the slot number inside a **cell**; deriving it from **Layer** depth (a Layer is where a piece sits, not when it goes in); a second per-Section filling list — the steps are the Section's **Placements**, only sequenced

**Spatially authored** (pillow fillings):
Whether a **Filling Template**'s **Placements** were laid out by a person or auto-generated. Operational test, **both** halves required: the recipe occupies **more than one Section**, *and* it uses `left` and `right` either together or not at all. The second half exists because spanning two **Sections** alone is not authorship — the two XL templates hold 16 and 17 pieces, so they overflow the three `left` **cells** into `center` while `right` stays empty, and they are the same artefact as the eight that never leave `left`. Per **Section**, side-sleep support belongs in left/right, so a recipe that fills one flank and not the other describes no pillow anyone can build. Derived from the **Placements** themselves on read — never a stored column, never a workflow state, so it cannot go stale against the data it describes. The cause is the 2026-07-24 backfill, which materialised **Placements** for every legacy template from flat `bom_template_lines` (quantities only, no spatial information) using a fill-cells-in-order spread that fills all three left **cells** before reaching center — so a recipe that omits `left` entirely did *not* come from it, and the warning should not claim it did. Surfaced as an advisory warning in the **X-ray editor** and the Configure template list; never blocks a save. **Mbolster** has no **Section** enum and is never evaluated for it.
_Avoid_: treating it as a stored flag, a **triage** state, or something **Staff** tick off; conflating with **Promote** (which turns an **Unpromoted configuration** into a catalog template — a different act entirely); "unauthored" meaning the template has no **Placements** (it has them; they were guessed)

**X-ray editor** (pillow fillings):
The editable **Placement** surface: the pillow silhouette with dive-into-a-**Section**, the radial filling picker, add/remove/drag-to-reorder **Layers**, and per-piece removal. One component, three surfaces — the configurator under **Staff assist mode**, Configure → **Filling Template**, and **Result** detail assign — so **Staff** learn the interaction once. Renders read-only (no edit affordances) when given no filling **Items** and no change handler, which is how the shopper's completed-preview x-ray uses the same renderer. Visual guardrails are ADR 0009; **Mbolster** uses its ordered compartment list instead and never the 3×3 pillow metaphor.
Every surface shows the **Derived pack list** beside it, and removing a filling there removes all of its pieces — except the Customer page's Re-adjust editor, which shows the **Insert order** in its place, one column per **Section** under that Section's cut: a count per filling cannot say which Section a piece is in, and taking pieces out of a pillow someone already has needs to (owner, 15-11-2026). On every surface one pouch comes out three ways, each with Undo: the bin on the selected pouch, Delete, or dragging it off the x-ray (past the frame's edge and off every drop target, so a layer row still takes a drop). The pouch coming out is the one thing the x-ray draws red; **Fit status** never is. Configure → **Filling Template**, the configurator under **Staff assist mode**, **Result** detail assign and the Customer page's Re-adjust editor dock the dived **Section**'s controls off the pillow art in the same Section editor panel (`XraySectionDock`) on a desktop, so the radial filling picker blooms over a clear pillow. Configure and **Result** detail fall back to editing on the pillow only when their workbench is too narrow for the panel; phones keep the controls in the dock under it. The **Mbolster**'s capsule x-ray edits the same way, without a dive: the same piece chips and radial picker (blooming over the capsule, which is also its trigger), and its one compartment's controls dock in that panel — Configure's left column, and under the capsule on the Mbolster configurator's Staff stage — falling back to under the capsule in its own frame on a phone or a narrow workbench. Neither editor shows a used / max mm gauge: a **cell** or the compartment says only *Compressed* or *Over*, with the numbers in its tooltip (owner, 7-11-2026).
_Avoid_: calling the shopper's read-only preview x-ray an **X-ray editor**; the retired 3×3 **cell** grid of dropdowns (deleted — it was a second, divergent filling editor); assuming "editor" implies a separate component from the preview renderer

**Neck support** (Cervical Neck Support):
An **Accessories** **Item** that **Staff** may also place inside a **premium** pillow on the **X-ray editor**, drawn as a pill. Placed in the pillow it is priced like a filling: it is inside the premium pillow's **MSRP**, so placing one adds nothing and taking it out takes nothing off (owner, 4-11-2026). Its cost still counts in the build's COGS, and each piece comes out of its own stock. Never on a basic pillow or an **Mbolster**; a **Filling Template** (scoped by size, never by **Tier**) may hold one, and a basic **Result** refuses it at assign. Bought on its own, as an **Add-on** beside the pillow, it is charged at its MSRP like any other.
_Avoid_: re-categorising it as a filling (it is still sold as an accessory); charging a placed one on top of the pillow's MSRP; lowering the price when one is taken out

**Ear Comfort Pad** (ear pad, in the x-ray):
An **Accessories** **Item** — also an **Add-on** — that **Staff** may place inside a **premium** pillow on the **X-ray editor**, as a **Neck support** may, but priced differently: each placed piece is charged at its own **MSRP** on top of the premium pillow's (owner, 5-11-2026). Its cost counts in the build's COGS and each piece comes out of its own stock; never on a basic pillow or an **Mbolster**, and a **Filling Template** may hold one. Picked as an **Add-on** beside the pillow, it is charged at its MSRP too. A square cushion with a sewn well in its middle where the ear rests: from above it draws as a puffy square with the well as a shaded ring, side-on as a cushion whose top dips into the well between two rims. Its size and thickness are a **Product dimensions** row (`ear/one-size`, a fallback until measured); its firmness and the well's size and depth are **Soft body** settings, and the well is drawn whether the **Soft cut** is on or off. The two that may be placed inside a pillow together are the *in-pillow accessories* (`isInPillowAccessory`).
_Avoid_: re-categorising it as a filling; placing one free of charge (it is not in the pillow's MSRP, as a placed Neck support is); reading the well's size off its dimensions (it is a Soft body setting)

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
A live cut of the pillow beside every x-ray, on all three surfaces and the shopper's read-only preview. Result detail, the **Pillow on record** (Customer page and Profile, read-only) and its Re-adjust editor draw all three **Sections**' cuts side by side at once. A cut is **Across** (left, centre, right **Sections** at a chosen **sub-section**) or **Along** (front, middle, back of the dived **Section**). The shell is a lens per **Section** at that Section's max **Loft**; each **Layer** a slab of its compressed thickness in the filling's colour, hatched when compressed, through the loft line in red when `over`. Reads the same fit object the x-ray uses; recomputes nothing. **Linked** to the x-ray (7-11-2026): front-to-back both draw the settle's own millimetres, and while a pouch is held in either one, both draw what its release would commit — the top view is where pouches are arranged side by side, the cut where they are stacked into **Layers** and placed to the millimetre.
_Avoid_: a second fit computation for the cut; edit affordances on the shopper's cut; a view drawing a pouch front-to-back anywhere but where the settle stands it

**Soft cut**:
How the **Cross-section view** draws its pieces (ADR 0025): the fit's pieces, stacked gravity-first one **Layer** at a time from the back panel up, settled as soft bodies — each pouch fixed-length fabric held out by its fill, a **Neck support** a roll that flattens where it rests and is pressed — a little when firm; set soft, it shares a crowded cell's squeeze as far as fully squashed; an **Ear Comfort Pad** firm the same way at its own firmness, keeping its rim and well — inside a case that behaves as cloth: slack and sagging below its sewn outline when under-filled, standing to it when full. Display only: the spans, **Layers**, thicknesses and **Fit status** are the fit's, and nothing it draws feeds back. Deterministic, one outline per piece with a gap between. Tuned and switched off in Settings → Inventory → Configure → **Soft body**, one stored value for every surface. The x-ray (top view) settles with the same solver and Settings, inside rigid walls and without gravity (ADR 0025 amendment, 1-11-2026), one plane per height of each **Section**'s stack, counted from the floor as the cut stacks it. Stuffed, not layered (Ivan, 9-11-2026): pouches at one height press on each other in both views — a cell's side by side, and Front, Middle and Back end to end where the settle stood them — each remembering its own length, so one pressed shorter pushes back on its neighbours and, side-on, bulges up; a pouch higher in a stack rests over a lower neighbour's end. A firm piece (a **Neck support**, an **Ear Comfort Pad**) is held across where it was put, so a wall it reaches pushes it front ↔ back, never on to a corner (8-11-2026), and keeps its whole length; a **Neck support** stays inside its own **Section**'s walls (9-11-2026: Left, Center and Right are sewn apart), one longer than its **Section** is wide drawn wall to wall and still marked as not fitting.
_Avoid_: reading a loft or fit number off the soft shapes; a top view that draws a nudged piece anywhere across but where it was put; "physics" for the fit model (the fit is arithmetic; only the drawing is physical); merging pieces into one mass

**Nudge**:
A fine, millimetre-step move of one piece (slice 08), persisted as visual-only offsets that never change the **Layer** or the **Insert order** — so the pack list and the fingerprint cannot see it. Front-to-back a nudged piece slides anywhere its **Layer** leaves free in its **Section**: its own column and the empty ones beside it, never into a neighbour of its own Layer (7-11-2026, the same rule in both views); once its centre is in another **sub-section** it is in that **cell** — a move. Usually made by dragging, which is precise by default: a creeping hand moves the piece a fraction of its travel (8-11-2026); the Alt-arrow keys are a shortcut. Distinct from a move made on purpose, which changes the **cell** or **Layer** where it is dropped.
_Avoid_: a nudge that stands a pouch in a neighbour of its own Layer; reading offsets into anything but the drawing

**Natural settle**:
A display-and-fit pass between layout and fit: where each pouch stands front-to-back in its **Section**, read by both views and the **Loft** arithmetic. **True size** (Ivan, 9-11-2026): a pouch stands at its own measured length (the **Dimension registry** at the **Size**), centred on its **cell**, or where a fine offset put it — kept inside its **Section**, and, where a neighbouring cell of its **Layer** is free, clear of the occupied one. It is never cut to its cell (a Size M cell is 110 mm; most pouches are longer) and never spreads past its length into an empty one, so the drawn width : length is the one measured. Stuffed, not layered (Ivan, 9-11-2026): pouches at one height in neighbouring cells never lie over each other. Where they overlap as each stands on its own, they are pushed apart end to end where the **Section** has room; where it has none, they are pressed shorter against each other, wall to wall, each giving in proportion to its length (a **Neck support**, firm, gives none while a pouch still can), and the fit marks those cells *compressed* and says how much shorter. A pouch placed by hand holds where it was put; its neighbours make room. A pouch stands in (counts towards the **Loft** of) its own column and any it covers half of. The pillow's protector walls the three **Sections** and nothing else, so settle never crosses a Section and applies to every pillow **Size**; a product whose sub-sections are physically walled cuts a pouch to its cell. It writes nothing: the **Placement** rows, the pack list, the fingerprint and **Promote** grouping are untouched.
_Avoid_: rewriting a **Placement**'s cell because it settled; cutting a pouch to its cell to make it fit, or spreading it past its length (both drew a ratio nobody measured, 9-11-2026); crossing a **Section** wall or a **Layer**; dynamic physics (gravity, sag between Layers) — settle is static and per plane (the **Soft cut** draws the physics, after settle, without changing it)

**Size membership** (Filling Templates):
The set of size keys a **Filling Template** serves, stored in `bom_template_keys` and the single authority for "does this recipe apply here". `bom_templates.key` survives as the **primary** key and is kept in step with the canonically-first member by the one writer that changes membership, so it is always a real member — a partial answer, never a divergent one. At least one size is required; a template serving none would be invisible in every list with no way back. Editing a shared recipe edits it for every size it serves, so the editor warns and offers a per-size copy (the **Fork**) rather than letting a size diverge by accident. Deleting is likewise not scoped to the size on screen. Past **Results** are unaffected either way: a **Filling configuration** is a snapshot, so a build already assigned keeps the mix it was built with.
_Avoid_: reading `bom_templates.key` as the scope (it is only the primary — filtering on it hides every template shared in from another size); a template with an empty membership; treating **Size membership** as a tier scope (Filling Templates have never carried **Tier**)

**Default Filling Template**:
The baseline filling mix for one Configure product card (e.g. Basic Size S, Premium Size M, Bolster medium). Stored on that **Composed sellable**, not on a warehouse preset name. Any template whose **Size membership** covers the card's size is eligible, including one authored at another size. Shown as a hint at assignment; the operator must actively confirm or override. Changing assigned size×tier (or length) on a **Result** clears any filling selection and reloads the hint for the new product card.

**Customer preference**:
Shopper-chosen **Item**s on a customisation preview. **Mpillow** (full/basic): cover and case only. **Mbolster**: case only (`bolster_case`) — no cover category in inventory or Configure for bolsters. When exactly one eligible case is available to choose, the preview auto-selects it. Protector (`pillow_protector` / `bolster_protector`) is owned on the **Composed sellable** BOM, not a preference.
_Avoid_: showing a Cover Style picker on mbolster-config; treating bolster protector as a shopper choice

**Add-on**:
An accessory (or optional extra) line at item **MSRP**, chosen during customisation, and charged on top of the pillow's MSRP — an Ear Comfort Pad adds its own price. Preview cards use the **Item**’s primary **Media Asset** image (not **Product Visualize** overlays), or, when that size has none, its family’s — another size of the same (category, name). Offered by size, and by answer: an Ear Comfort Pad only to a shopper who answered yes to ear discomfort during side sleep; every other Add-on, Cervical Neck Support included, always. **Staff** are offered every one. A selected Add-on is never final on the shopper’s say-so: the pillow advisor reviews each against the shopper’s measurements before the build is made and decides whether it goes in, and the preview tells the shopper so as soon as they pick one.
_Avoid_: promising a picked Add-on will ship; gating an Add-on on an answer in the hold route (the advisor’s review is the gate, the preview only declutters)

**Service**:
A priced act of labour Mpillow performs that consumes no inventory. Exactly three: Measurement (Premium), Measurement (Basic) and Re-adjustment, keyed `measurement_premium` / `measurement_basic` / `readjustment`. Priced in **Costings** (`service_prices`) and never an **Item**; a fourth is a migration plus a rule in code, never a row an operator invents (ADR 0024).
_Avoid_: an **Item** with a "service" category; an **Add-on**; "product"

**Service fee**:
The amount charged for a **Service** on a **Result** or an **Order**: the **Service**'s MSRP in **Costings**, never typed by **Staff** and never taken from a client. On an **Order** it is its own line (`order_items.kind = 'service'`) — never shipped, never stock-deducted, never returnable through RMA, outside the commission base and the free-shipping threshold, inside the taxable base.
_Avoid_: "fee" alone in money-ledger context (`order_payments.type = 'fee'` is Stripe's dispute fee — a cost to us, not a charge to the customer); "surcharge"

**Measurement service**:
**Staff** measuring a customer for a customisation. Charged automatically when the **Result**'s `measured_by_type = 'staff'`, at the rate for its **Tier** (`assigned_tier ?? suggested_tier`): Premium → Measurement (Premium), Basic → Measurement (Basic). **Mbolster** carries no measurement fee, whoever measured (owner, 2026-10-13); on a **Paired build** the fee is the Mpillow's, and stays its own row on every step, the Mbolster's included. Self-measurement online is free. Derived on every repricing from who measured — never stored as its own flag.
_Avoid_: a customer-ticked option in the configurator; treating the "Have us measure you" link as the charge (the link books the visit; the charge follows who measured); "customisation charge"

**Authorization hold**:
An uncaptured Stripe payment for the ballpark total (composed sellable **MSRP** + preference/add-on **MSRP**s − a **Discount code**'s amount + shipping + tax). Card details are taken; charge happens only on Accept (or via top-up if the final total exceeds the hold).

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

**Language preference** (appointments):
The language a guest would like their **Appointment** in — `english`, `mandarin` or `none` (No preference) — picked on the booking form for both Customisation and Re-adjustment. Staff read it as a `Language preference: …` line in the calendar event description and try to assign someone comfortable with it; the form says "we'll try our best", never a guarantee. Lives only on the event: a **Customisation appointment** has no row, and a paid **Re-adjustment appointment** carries it to the webhook in its Checkout Session metadata. `none` writes no line.
_Avoid_: "language" alone (the site **locale** is a separate, per-visit UI setting); promising a staff match

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
The one authentication page, `/account/login`, with two tabs (ADR 0041). **Customer**, the default: signing in and signing up are one step (Google, or an emailed link and 6-digit code; no password), and the first sign-in makes the **Customer** at once, with a box, ticked by default, that records `sign_in` **Marketing consent**. **Staff**: for the **Admin Panel** only; it never makes a Customer or records consent, and an email not on the team is signed out again. An Admin Panel destination opens the Staff tab. The **Partner Hub** keeps its own single form. Which tab was used decides what the sign-in does, not who the person is.
_Avoid_: a separate sign-up page or a second confirm email (the link or code is the confirmation); a separate Staff login URL (it is a tab on the same page); "magic link" in customer-facing copy ("sign-in link")

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
One entry in the code catalog (`lib/auth/permissions.ts`): an **Admin Panel** page (one sidebar entry, its URL and every API behind it) or a **Telegram action**. A **Role** either has it or does not; there is no per-member override, and no view-only level except on Customers, where `customers` is seeing the page and `customers-edit` is making changes (ADR 0028 i). Some pages require another (Page Builder, Blogs, Partners and Products pick images, so they require Media); ticking one ticks its requirements.
_Avoid_: "scope"; a key that gates several pages (the catalog is one key per page); hiding a page in the sidebar as the only protection — its URL and APIs refuse too

**Owner**:
The built-in **Role** that can grant or remove Owner. There is always at least one active Owner; the last one cannot be demoted or deactivated. A bootstrap-allowlisted email that signs in with no **Member** row is provisioned as Owner.
_Avoid_: using Owner for day-to-day access — **Admin** has every page too

**Staff profile**:
A named person who works under a **Member** (`mp_staff`). A **Result** is "measured by" a Staff profile, and a **Telegram link** belongs to one. A profile cannot sign in and never has more access than its Member. Archived, never deleted, so historical attribution survives; archived profiles drop out of pickers but keep their name on old **Results**. On a shared login, the person at the device can pick who they are "working as", which defaults new Results' measured-by and names them in the Audit Log — attribution, never authorisation. A personal login (one live profile) never sees that picker: its one profile is who measured the Results it creates. A **Member** customising on the configurator is always Staff, whatever customer account the same login also has: a shared login nobody at the device has picked on is asked who's measuring on the start screen before the Draft exists.
_Avoid_: "staff member" (ambiguous with **Staff**); treating a profile as a login

**Telegram link**:
A **Staff profile**'s bound Telegram user id (redeemed with a one-time `/link` code) plus the **Telegram actions** granted to it (reply to Google reviews, moderate **Shop reviews**, write the **Store reply** on them, answer customer messages). Effective access = the Member's **Role** permissions ∩ the link's granted actions, and only while the profile and the **Member** are both active — deactivating a login silences every Telegram account under it.
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
A shopper's record (`customers` row), created at checkout, at **Sign in**, by the Shopify import, whenever someone gives an email in a customisation (the first question, *Save without purchasing*, the hold; ticked box or not, ADR 0051), when someone leaves the marketing email box ticked on a booking (PRD-campaign-audiences slice 02), by **Staff** from a **Result**'s Customer panel (ADR 0051), or at the first **Sign in** on the Customer tab, which is also the sign-up (slice 03; owner decision 6; ADR 0041). One email, one Customer: an email that matches a Customer never creates another, and the shopper's own save never changes the one it matches (Staff may fill an empty mobile). One who has bought nothing is a *Lead*. A Customer always has an email; a mobile is encouraged, never required (owner, 2026-11-15). It **has an account** once a **Sign in** is bound to it (`auth_user_id`). Menu pill → **Profile**; logout lives in account UI, not the landing Menu.
_Avoid_: conflating with **Customer preference** (cover/case choices only)

**Order**:
A paid platform sale in our DB (post Accept + capture when a hold existed). `paid_at` is Stripe's time for the payment, not when our webhook or Accept ran. Analytics counts an **Order** as a **Sale** once Stripe has charged it. Unpaid checkouts are outside realized margin.
_Avoid_: calling a held **Result** an **Order**; using `created_at` for Analytics sold-margin windows

**Sale**:
An **Order** Stripe has charged: its money ledger (`order_payments`, written only from Stripe events and the Accept capture) holds a `charge`. Dated by its latest charge's `occurred_at`, Stripe's own time for the money (an event's `created`, or a capture's balance transaction), so an **Order** paid in two parts, a **Balance payment** then the hold's capture, is sold when Stripe holds the whole price. Analytics tracks this site's Sales only (2026-10-29, ADR 0036); a payment that lands on a closed **Order** waits for **Staff** to refund or reinstate it.
_Avoid_: dating a Sale by `created_at`, by when our webhook ran, or by Accept time; counting a Shopify sale; an Analytics channel toggle

**Staff order**:
An **Order** **Staff** put together for one **Customer** from their Customer page (**Create order**, permission `orders`; ADR 0048): **Variant**s at the price the shop charges and **Service**s at their **Costings** MSRP, in quantities Staff choose and amounts they never type, with an optional **Discount code** taken off the goods only. Handed over at a studio (stored as a **Self-collect** address, no charge) or delivered by a delivery **Shipping method** priced as checkout prices it; a service-only order is at the studio. Never a pillow or bolster: a customised build is a **Result**. Created `pending` with its total fixed, and paid by the customer through its **Payment link**; Stripe's charge makes it a **Sale** through the same webhook branch as a shop Order, which confirms it, deducts its stock and sends the receipt. Told apart from a shop Order by its `order_payment_links` row.
_Avoid_: "manual order" or "draft order" (Shopify's words; it is a real **Order** from the start, only unpaid); a price or total from the browser; points or a **Referral** on it; selling a customised pillow this way

**Payment link**:
Our own URL for paying a **Staff order** from the customer's own device, `/{lang}/pay/{token}`: a uuid token in the service-role-only `order_payment_links` (one per Order), valid 7 days and renewed by each resend. The page shows what is in the order and its total; **Pay** opens Stripe's hosted Checkout for exactly that total, reusing an open session, or making a new one-hour session that only one request can install on the Order. Stock is checked again first. A Checkout that lapses unpaid leaves the Order and link as they were; the daily job cancels the Order once its link has expired unpaid. Sent by the **Payment request** email, or copied for WhatsApp.
_Avoid_: "Stripe Payment Link" (Stripe's `buy.stripe.com` product, deliberately not used: ADR 0048); emailing a Checkout Session URL (it dies within a day, a PayNow QR within an hour); "invoice"; the **Result access token** (that proves who owns a Result; this token only lets its holder see and pay one Order)

**Payment request**:
The email that sends a **Staff order**'s **Payment link**: what is in the order, its total, the Staff note if any, a **Pay** button and when the link stops working. Sent when the order is made (Staff untick it to send the link another way) and on **Resend** from the Order page; transactional, its words editable under Email templates.
_Avoid_: "invoice email"; the *Payment reminder* (`results.balance_due`, which is about a **Result**)

**Checkout code**:
The one optional code a shopper types at checkout — on shop checkout, in the cart, and on the customisation contact step: a partner's referral code (a **Referral**) or a **Discount code**, in the same field, one per order (ADR 0033). The server decides which: a code a partner holds is a referral code, otherwise one a coupon has is a discount code. Either reads "active" once accepted; a referral changes no price unless Staff pass that partner's unused pool on as a **Partner customer discount** (ADR 0034), and a discount takes its amount off the total shown at once. A code that is neither, or a discount code this order cannot use, never blocks the shopper. A coupon may never be saved under a partner's code.
_Avoid_: two code fields; "coupon field" or "referral field" for it; a price the browser worked out being charged (checkout and the hold price the order again)

**Discount code**:
A coupon (Settings → Discounts) entered as a **Checkout code**: a percentage or fixed amount off the goods, or free shipping. On a **Result** it is checked once, at hold, and the Result keeps its terms (`coupon_terms`); every repricing takes them off the goods priced then, never off **Service fees**, shipping or tax. On a **Paired build** the Mpillow carries it. A live Result holding a code counts as one of its uses until Accept, where its **Order** records it and the coupon's use is counted.
_Avoid_: re-reading the coupon at Accept (an edit or expiry after the hold never moves an authorised price); "voucher" (the retired Welcome-back voucher); a discount on a Service fee

**Shopify order mirror**:
Durable DB finance facts for Shopify paid sales (orders, lines, refunds, sync cursor). Shopify Admin API is ingest-only (webhook + catch-up). Analytics no longer reads it (2026-10-29): it tracks this site's **Sales** only, so the ingest feeds nothing. Shopify sales take no stock: the Shopify sales queue that once committed them to inventory was removed (2026-10-27).
_Avoid_: deducting stock for a Shopify sale; treating live API list price × qty as P&L truth; building new features on Shopify — it is ad hoc and not on the roadmap: no linking Shopify orders to **Customers**, no syncing prices to Shopify, no mapping its products (owner, 2026-10-13). Shopify customers are imported once (ADR 0029); their orders stay unlinked.

**Others**:
Unmapped or uncosted **Shopify order mirror** lines: COGS is unknown until Staff fixes mapping or **Costings** and re-resolve graduates the line. Freeze-at-sale: healthy already-costed lines are not rewritten on every Costings edit. Not read by Analytics since 2026-10-29.
_Avoid_: dropping unmapped lines from the mirror

## Shopify customer migration (ADR 0029)

**Migrated customer**:
A **Customer** whose row was created or enriched from the Shopify customer export. It carries one `migrated_customers` row: Shopify customer id, Shopify-era order count and spend, Shopify tags and note, the consent snapshot, the **Import batch** and `claimed_at`. Readable by the service role only.
_Avoid_: "imported account" or "migrated account" — no login moved, and Shopify credentials never leave Shopify; until it is **Claimed**, a Migrated customer is a row, not an account; writing Shopify-era figures into `customers.total_orders` / `total_spent` — those are platform-derived and recomputed by `updateCustomerStats`

**Claim**:
The first **Sign in**, after import, by the person who owns a **Migrated customer**'s email. `linkCustomerToAuthUser` binds `auth_user_id` as it would for any customer row. The Claim stamps `claimed_at` and grants the **Claim bonus** (ADR 0030), both in one transaction and both exactly once.
_Avoid_: "invite" or "activation" — nothing is created in `auth.users` before the person signs in, and no Supabase invite is sent

**Claim link**:
The per-customer link in a campaign email, `/account/welcome?c=<token>`. The token is opaque; only its hash is stored. It prefills the email on the welcome page and attributes the click.
_Avoid_: "magic link" — a Claim link never signs anyone in; proof of the email is always the **Sign in** itself

**Marketing consent**:
Whether a **Customer** agreed to marketing email, stored as `subscribed | not_subscribed | unsubscribed` with its **Consent source** and timestamp. Every change is appended to `customer_consent_events`. Two defaults subscribe someone nobody has asked, and never anyone who unsubscribed (owner, 2026-10-31; ADR 0039): every **Migrated customer** not on Shopify's unsubscribed list, and anyone who leaves the box ticked where they give their email (checkout, a customisation's contact step, a booking, **Sign in**), or signs up in the footer.
_Avoid_: inferring consent from having an account, a past **Order**, or a **Claim**; treating Shopify's "no" as `unsubscribed` — it may mean "never asked", which is why Shopify's unsubscribed list is exported separately

**Consent source**:
What set a **Customer**'s **Marketing consent**, stored with it and on each event: `shopify_import` (the export's *yes*), `import_default` (subscribed because they were imported), `shopify_unsubscribed` (on Shopify's unsubscribed list), `checkout` (the box at checkout, ticked by default), `customisation` (the same box on a customisation's contact step: Mpillow, Basic, Mbolster, a Paired build's Mpillow, an Assisted customisation), `appointment` (the same box on booking a customisation or a re-adjustment), `sign_in` (the same box on **Sign in**'s Customer tab), `newsletter` (*Get our emails* in the site footer, confirmed by the sign-in link or code), `account` (the customer, from their Profile), `unsubscribe_link`, `complaint`, `support` (Staff, at the customer's request, unsubscribe only). Only `account` re-subscribes someone who unsubscribed.
_Avoid_: "list" or "signup source"; reading `import_default`, `checkout`, `customisation`, `appointment` or `sign_in` as the customer's own choice

**Import batch**:
One import that wrote to the database, run from **Admin Panel** → Customers → Import from Shopify. It records the file's name and SHA-256, the counts by outcome, the **Staff** who ran it, and when. It is the unit of reconciliation, of resume, and of undo.
_Avoid_: "upload" — the file itself is never uploaded or stored; the browser reads it and sends rows

**Account status**:
Whether a **Customer** row is bound to a login: *Signed up* (since `account_linked_at`) or *No account*. It is derived from `auth_user_id` in the Customer overview (`admin_customer_overview`), never stored as text. It applies to every **Customer**, not only Migrated ones. For a **Migrated customer**, *Signed up* and **Claimed** usually coincide. They differ when the person already had an account before the import: that Customer is *Signed up* at once, and is **Claimed** at their next **Sign in**.
_Avoid_: "registered", "member" (a **Member** is **Staff**) or "active" for this; reading *Signed up* as **Claimed**

## Google Form fittings (ADR 0042)

**Fitting record**:
One in-store fitting from before this platform, as the old Google Form recorded it, linked to a **Customer** (`customer_fittings`). It keeps every answer the form had: the four measurements in inches (A shoulder length, B neck to back, C head to back, D neck length), the recommended pillow size, the configuration type (e.g. `T12`) and profile side (e.g. `M-LN`), the sleep and health answers, who serviced them (a **Staff profile** when the name matches one), notes, and the Drive photos, previewed on the Customer page and never copied. Readable by the service role only. Shown to **Staff** holding `customers`, and to the **Customer** on their own Profile in the same card, without the Drive photos (ADR 0042 h).
With a Shopify-era order on the **Migrated customer** row, the latest one dates their latest Shopify-era **Purchase** for the **Lifecycle stage** (ADR 0042 m).
_Avoid_: calling it a **Result** (it never had a hold, a build or a payment), an **Order** or a **Purchase** (it dates a Shopify-era one; it is never counted as one); writing its answers onto `customers` (the customer can read that row); "measurement" alone (a **Measurement service** is the fee)

**Fitting import**:
One run of **Admin Panel** → Customers → Import fittings: the owner's Google Form CSV, read in the browser and sent a chunk of rows at a time, like an **Import batch**. One person's visits all land on one **Customer**, each its own **Fitting record** (ADR 0042 c). A row attaches to the **Customer** with its email. Under an email nobody has, it attaches to the one Customer with the same mobile and name, or creates one. A row with no email attaches to the one **Customer** with its mobile, or the one of several with the same name, or is skipped and listed. Rows with an email go first, so a mobile-only visit finds the Customer another visit creates. Importing the same file twice creates nothing, and Undo removes the batch's **Fitting records** and the Customers it created that nobody has signed in to or referenced since.
_Avoid_: "upload" (the file is never uploaded or stored); creating a phone-only **Customer**

**Pillow on record**:
The pillow a **Customer** has, drawn in the x-ray on their Customer page: a size and a **Filling Template** (ADR 0042 j). A **Staff** link (`customer_pillows`, one per Customer, set under `customers-edit`) wins. Without one it is read from their latest **Fitting record** that names a configuration type: the form's `T12` is the template named `Type-12`, a profile side ending `-SN` its `(Short Neck)` variant, and the fitting's size picks among them by **Size membership**. Worked out on every read and never stored. When no template is exactly that, the nearest is drawn (another size's, or the other neck's) and the card says what it gave up. A link's or a fitting's template is drawn as it is now. Between the two comes the latest pillow bought here, drawn as its order line froze it at Accept. At a **Re-adjustment** visit, **Staff** holding `customers-edit` press **Re-adjust** beside Change pillow and change its fillings in the **X-ray editor**: what they leave in it is saved on the Staff link (`customer_pillows.filling_placements`) with the template it came from, and drawn from then on instead of the template as it is now, until Change pillow or removing the link replaces it (ADR 0042 l). It is still not a build: no stock moves and no price changes. The **Customer** sees it on their Profile, read-only and without anything Staff-only, once something says they bought it: a pillow bought here they still have, a Staff link, or a **Fitting record** together with a Shopify-era order (ADR 0042 k).
_Avoid_: calling it a **Result**, a build or a **Filling configuration** (it is not a Result and reaches no money path or stock; a pillow bought here is drawn from its order's snapshot, never changed — a Re-adjustment writes its mix on the link, not on the order); storing the fitting's match; reading the form's codes as anything but template names; showing it on the Profile to someone nothing says bought one

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
ANDs multiple branches (e.g. three measurement ranges must all match) — or, set to **any**, fires on the first branch that does (e.g. "not stomach" = side, back or mixed). Use **any** for a disjunction that feeds an AND; parallel branches into a terminal still OR on their own (ADR 0027).

**Terminal**:
A leaf that resolves the evaluation: **Size output** (size or bolster length), **Template output** (a **Filling Template** scoped to the resolved size — either one size, or **by size**: one template per size, the resolved size picking the slot, so the branches before it need not split by size; with no slot for that size it has not fired, ADR 0027), **Tier suggestion** (advisory copy only — never changes the sold product), or **Flow route** (upsell/cross-sell to another flow via the **Upsell card**).
_Avoid_: a Template output pointing across sizes; threading size through Combines only to reach per-size Template outputs (use one by size); Tier suggestion mutating the held product or amount

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

**Staff refund** (ADR 0038):
Money Staff send back from the order screen through Stripe: everything left, chosen lines (each at its share of what the customer paid) and the shipping, or a typed amount, always with a reason. *Charged in error* and *Duplicate charge* correct a charge and need nothing back; *Customer returned it* on a **Result** Order needs it shipped and back in person.
_Avoid_: "refund request" (the customer's ask on a Result Order); "return" for a charge correction, where nothing comes back

**Status event**:
An append-only `rma_status_events` row (`from_status`, `to_status`, `actor`, `reason`) — the customer-visible **Return** timeline. Distinct from the staff-only `admin_audit_log` entry written alongside it.
_Avoid_: mutating `rma_requests.status` without appending an event (status is a cache of the latest event)

**Return window**:
The eligibility period, `site_settings.rma_return_window_days` (default **30**), measured from `orders.delivered_at`. Only delivered orders within the window are returnable.
_Avoid_: measuring the window from order/ship date

## Reviews (PRD-google-review-replies)

**Google review**:
A review of the business on Google Maps, kept as a `google_reviews` row keyed by its resource name. Our public reply goes on Google Maps. Read through the Google Business Profile API, or, until Google approves that API, through the Places API once a week (`source` `places`, ADR 0035): Google's five most relevant reviews only, answered on Google Maps by hand, and deleted 30 days after they are stored.
_Avoid_: the Places API testimonials on the landing page (`lib/google/places-reviews.ts` — Google's top five, read once a week, read-only, never stored)

**Shop review**:
A review a signed-in **Customer** leaves on a **Storefront product** (`product_reviews`). Only a signed-in **Customer** can write one (no purchase needed), and its byline is that **Customer**'s name ("Jane D."), never typed in. Starts `pending`; a **Shop moderator** approves it onto the product page or rejects it. It may carry our **Store reply**.
_Avoid_: "product review" when the source matters on a Telegram card — the card says SHOP REVIEW; a review form for visitors who are not signed in

**Store reply**:
Our public reply to a **Shop review** (`product_reviews.store_reply`), shown under it on the product page while the review is approved. Set by replying to the review's **Review card** in Telegram (unless the reply is a **Team note**), on a pending or approved review, by someone allowed Reply to shop reviews; it goes up at once, with no draft or Post step. Replying again replaces it; Remove reply on the card takes it down.
_Avoid_: a Claude draft for it (Google replies only); naming who on the team wrote it on the storefront

**Review card**:
The Telegram message in the measurements group (`MP_CONFIG_TELEGRAM_CHAT_ID`) for one **Google review** or **Shop review**. Its first line names the source. A Google card carries Claude's suggested reply and Post / Redraft / Skip; a review manager's reply to the card replaces the draft (unless it is a **Team note**), and nothing reaches Google until someone taps Post on the version they are looking at. A card for a review read through the Places API has Open on Google Maps / Mark replied / Skip instead: the reply is pasted on Google Maps, and Mark replied records the draft on screen as what was posted. A shop card has Approve / Reject while pending; a reply to it sets the **Store reply**, after which it also has Remove reply.
_Avoid_: auto-posting a draft; a card that keeps its buttons after someone acted

**Reply type**:
Which kind of reply a **Google review** gets, chosen from its star rating in code (`lib/reviews/reply-style.ts`), never by the model: **Thank-you** (4–5★), **Constructive** (3★ or no rating), **Service recovery** (1–2★ — apologise for the specific problem, own it, offer one concrete next step, and always ask them to message us on the staffed support WhatsApp; no promotion and no compensation in public). A 1–2★ **Review card** is flagged SERVICE RECOVERY so someone also follows up with the customer personally. When the rating later moves into another type — after we answered, skipped, or never carded it — the review **reopens** as a fresh card whose reply replaces the one on Google.
_Avoid_: thanking or selling under a 1–2★ review; promising refunds or freebies in a public reply; giving the automated appointment WhatsApp line in a reply

**Telegram operator**:
Retired name for a **Telegram link** (the table is still `telegram_operators`). A person may press buttons on **Review cards**, or answer **Message cards**, only through a **Telegram link** on their **Staff profile**, managed on **Users & permissions** → Telegram. Everyone in the group sees cards; only a linked profile whose **Member** is active and whose **Role** and link both grant the action (Reply to Google reviews, Moderate shop reviews, Reply to shop reviews, Answer customer messages) can act. The old **Review manager** maps to replying on Google and moderating **Shop reviews**, **Shop moderator** to moderating **Shop reviews** only; nobody has Reply to shop reviews or Answer customer messages until a role and a link are given it.
_Avoid_: a Telegram list separate from logins — access is one tree: **Member** → **Staff profile** → **Telegram link**

## Customer CRM (ADR 0028)

**Customer note**:
A dated, authored remark by **Staff** about a **Customer**, in `customer_notes`. Only the service role can read it. Notes are never edited; a correction is a new note.
_Avoid_: `customers.notes` — the **Customer** can read their own row (`0037_customer_auth.sql:14-18`), so that column is retired

**Customer timeline**:
Everything that happened with a **Customer**, newest first, merged when it is read from the tables that already record it: **Orders**, **Results**, **Re-adjustment bookings**, **Returns**, reviews, emails, **Customer notes** and **Follow-ups**. Each kind is shown only to **Staff** holding that source's **Permission**. The Customer page shows it on its **Journey** tab, as **Chapters** on a map (owner, 2026-11-15; PRD-customer-page-journey): *Journey* is that tab's name and nothing else.
_Avoid_: "activity log" or "events table" — nothing is copied; "Customer journey" for the concept (it collides with **Visitor** analytics and with **Appointment**) — say **Customer timeline** in code and documents

**Chapter**:
A run of **Customer timeline** entries that belong together: an **Order** with its delivery and its emails, a review with the request before it. Built when the Journey tab is drawn (`lib/crm/journey/chapters.ts`) and never stored. An entry joins the latest **Chapter** when it is about a record already in it, or falls within 10 days of its last main entry; reminders and marketing email never start one beside a main entry and never stretch one. **Now** is always the last: the open **Follow-ups** and the Next step. A **Chapter**'s height on the map is one of *Going well* (an order paid, a re-adjustment attended, an in-store fitting, a review of 4★ or 5★), *Needs care* (a review of 3★ or lower, a return opened, a refund asked for, an order cancelled, a re-adjustment no-show; on **Now**, an overdue **Follow-up**) or *Steady* (everything else), and *Needs care* wins.
_Avoid_: "mood", "sentiment" or "health score" (the height states a fact on record, it does not judge the customer); reading a height as the **Lifecycle stage**, which never moves on reviews, returns or notes; storing **Chapters**

**Segment**:
A named, saved set of Customers-list filters, shared by all **Staff** with `customers` and counted live. A **Segment** and the same filters in the URL always return the same **Customers**.
_Avoid_: "list" (a Segment is a query, not a frozen set of people); "audience" (that is email marketing's word for a Segment narrowed by consent)

**Purchase**:
A counted **Order** (paid, and not pending, cancelled, refunded or payment-failed) with at least one goods line. A re-adjustment fee **Order** holds only a service line, so it is never a **Purchase**. A **Migrated customer**'s Shopify-era order count is added to their **Purchases**; the latest of them is dated by their latest **Fitting record**, the in-store visit such an order almost always was, and is undated when they have no fitting (ADR 0042 m).
_Avoid_: counting every paid **Order** as a purchase (`paid_orders` does, re-adjustment fees included); counting a **Fitting record** as a **Purchase** (it only dates a Shopify-era one)

**Lifecycle stage**:
Where a **Customer** is in the funnel *Lead > New > Loyal > At risk > Lost*, one stage at a time, some with a sub-status (PRD-crm-retention-loop slice 03; owner, 2026-10-27 and 2026-10-28). Read from their **Purchases**, their attended **Re-adjustment bookings** and their **Marketing consent**, and nothing else, checked in order: *Lost* (unsubscribed, with no **Purchase** or attended booking since), *Lead* (neither yet), *At risk* (the latest of either more than 12 calendar months ago; sub-status *Lapsed* past 24), *Loyal* (2 or more **Purchases**, sub-status *Repeat purchases*; or an attended booking, *Bookings*), *New* (1 **Purchase**; sub-status *awaiting delivery*, *delivered*, or *settled* 30 days after delivery). The cut-offs are strict, as the *Last order* filter's. A Shopify-era **Purchase** is dated by the latest **Fitting record**, and counts as delivered then (ADR 0042 m); a buyer whose every **Purchase** is Shopify-era and who has no fitting has no dates: placed by count, never *At risk*. A Renew subscriber will be *Loyal · Subscriber*, checked first, when Renew exists. Computed by `customer_lifecycle_stage` and `customer_lifecycle_detail`, mirrored in `lib/crm/lifecycle-stage.ts`. Counted by stage and sub-status for the Customer lifecycle chart on the Customers page by `admin_customer_lifecycle_counts` (`lib/crm/lifecycle-summary.ts`), from the same overview, so a stage's count is what the *Stage* filter lists.
_Avoid_: storing it, or setting it by hand (it is derived when read); moving a **Customer** by reviews, ratings, returns or notes; "churned" (say *At risk*, or *Lost* once they unsubscribe); calling an attended booking a **Visit** (a browsing session)

**Follow-up**:
A dated to-do about one **Customer**, assigned to a **Staff profile**, and done or not done.
_Avoid_: "task" or "ticket" (it is not a support queue); assigning it to a **Member** or a login — a person works as a profile

**Aftercare message**:
A service message, by email and WhatsApp, about something the **Customer** bought. There are two: the **Review request**, once per Customer, 14 days after delivery; and the **Check-up reminder**, yearly, stating that the visit is paid and its fee. Email uses the transactional transport and is on unless switched off (`aftercare_email`). WhatsApp is off until the customer opts in (`aftercare_whatsapp`). Every change is recorded with who made it and how. Neither ever carries an offer.
_Avoid_: calling it marketing, or gating it on **Marketing consent** (migration PRD) — the one exception is the **Check-up reminder**, which offers a paid visit and so goes only to customers who agreed (ADR 0028 h); anything promotional belongs to `PRD-email-marketing`; an email about the free re-adjustment window (there is none, owner, 2026-10-20)

**Review request**:
The one message, by email and (when they opted in) WhatsApp, that asks a **Customer** for a **Google review**, with an unconditional *"need anything else? message us"* line. It goes once per Customer, ever, to every eligible Customer alike.
_Avoid_: choosing who is asked by satisfaction, returns or ratings, or offering anything for a review — both break Google's review policy

**Linked Google review**:
A **Google review** that **Staff** have confirmed belongs to a **Customer**. Google never says who wrote a review, so the code only suggests a match, from the name and the timing of a **Review request**.
_Avoid_: linking automatically; treating a review-link click as proof of a review

**Contact status**:
What is known about how to reach a **Customer**, each part derived from a fact: *Verified email* (they have signed in with it); *Sign-in methods* (emailed code, Google); *Valid mobile* (the number on file passes `isValidPhone`); *Replied on WhatsApp* (the number has written to our WhatsApp line, as recorded in `whatsapp_inbound`).
_Avoid_: "verified mobile" — nothing verifies a phone number by code; letting **Staff** tick "verified"

## Loyalty points (ADR 0030)

**Points**:
A **Customer**'s balance, worth S$0.01 each (100 points = S$1), spent only as money off a shop **Order**. Earned on what the customer pays for, from a one-time **Claim bonus** (a **Migrated customer**) or **Welcome bonus** (anyone else, on the **Explore page**), and, for a **Migrated customer**, once as **Past-purchase points**. Points never expire. Points cannot be cashed out, transferred, bought, or used on a **Result**, and points used are never refunded. Partners neither earn nor spend them; their reward is the partner milestone tiers.
_Avoid_: "store credit", "wallet", "cashback" (each implies cash value or a refund); "rewards" (there is no catalogue); "tier" or "member" for customers (a **Member** is **Staff**; tiers are the partners')

**Points ledger**:
The append-only record of every change to a balance (`points_ledger`): earn, Claim bonus, Milestone bonus, Past-purchase points, Welcome bonus, Flower points, spend, spend release, clawback and Staff adjustment. There is no expiry entry: points never expire (ADR 0030, 2026-10-31). The balance is the sum of the entries and is never stored on `customers`.
_Avoid_: editing or deleting an entry — a correction is a new `adjust` entry with a reason

**Pending points**:
What a paid **Order** will earn once its return window closes, 30 days after delivery. They are computed from the Order and are not in the ledger until then.
_Avoid_: letting pending points be spent, or counting them in the balance

**Claim bonus**:
1,000 points a **Migrated customer** receives once (`kind = 'claim_bonus'`), when their **Claim** falls within 3 months of the first campaign email we sent them, or of the first wave if we never emailed them. A customer who claimed before points existed receives it at their next **Sign in**.
_Avoid_: "welcome-back voucher" (deleted by ADR 0030); "sign-up bonus" (only Migrated customers get it); a calendar end date (each customer's window is their own)

**Welcome bonus**:
Points a **Customer** who is not a **Migrated customer** receives once (`kind = 'welcome_bonus'`) for claiming on the **Explore page**. Its size is the open step of a ladder the owner sets (`points_welcome_steps`): each step ends at a published time and has a limited number to give, and a step that runs out hands over to the next early. The ladder costs at most S$1,000, S$250 a step (ADR 0030, decision 21). The count shown is the ledger's, never a made-up one. A **Migrated customer** gets the **Claim bonus** instead, never both; a partner gets neither (ADR 0030, decision 18).
_Avoid_: sign-up bonus, launch voucher

**Flower points**:
1 to 3 points (`kind = 'explore_flower'`) for a flower picked on the **Explore page** by a signed-in **Customer**; a picked flower grows back for them at a random time 24 to 36 hours later (`regrows_at`), and at most 500 points (S$5) per **Customer** ever: an Easter egg, after which their flowers never give points again. Never advertised: the terms and the sign-in popup say nothing of it; only the surprise after a pick does. The database chooses the days flowers grow, how many, and the points (ADR 0030, decisions 20 and 22).

**Explore page**:
`/explore`: one screen that does not scroll, with the countdown to the launch (23:59 on 31 December 2026, Singapore time) and the claim of the **Welcome bonus** in a popup, over a scene whose sky follows the visitor's own day and night. Pressing Claim there is consent to marketing email, recorded as `explore_claim`. Until the launch, an arrival at the home page of mpillow.com or www.mpillow.com is sent here; once it has come, the page says the site is live and leads to the home page (ADR 0030, decision 23).

**Past-purchase points**:
Points a **Migrated customer** is given once (`kind = 'past_purchases'`) for what they spent on the old shop: the earn rate × their Shopify-era spend (`migrated_customers.shopify_amount_spent`), rounded down (ADR 0030, 2026-11-08). **Staff** give them in one run from Settings → Discounts → Points, after a preview of how many customers and points; a later run reaches only customers imported since. Not earned on an **Order**, so they never move a **Milestone bonus**; partners get none.
_Avoid_: "backfill" in customer-facing copy (say *points for past purchases*); writing them as `earn` (one per **Order**, and milestones count it); granting them at the **Claim** (owner, 2026-11-08: a Staff run)

**Milestone bonus**:
Points a **Customer** receives once (`kind = 'milestone_bonus'`) for each bonus milestone they reach: a number of points earned from orders, on a ladder the owner sets (`points_milestones`, at most five). Only points earned on orders count, every `earn` less every `clawback`: spending, the **Claim bonus**, Staff adjustments and Milestone bonuses neither move it nor set it back. The daily job grants it with the points that reach it; it is never taken back, and each milestone pays once. The Profile shows the ladder as a progress bar (ADR 0030 s to w).
_Avoid_: "tier", "level" or "status" (nothing changes after a milestone but the bonus); conflating it with the partner **Milestone track** (units, cash and rate bumps); counting the balance towards it

**Points expiry**:
Retired (owner, 2026-10-31; ADR 0030 amendment). Points never expire: a balance is kept however long it is between orders, no reminder is sent about it, and no date is shown beside it.
_Avoid_: an expiry date, a "use them before" reminder, or any copy that implies points lapse

## Email marketing (PRD-email-marketing, PRD-campaign-email-editor, PRD-email-funnel, ADR 0036, ADR 0054)

**Email campaign**:
A marketing email **Staff** write in **Admin Panel** → Email campaigns (`email_campaigns`): a subject, an inbox preview line and a list of **Email blocks** (`content`), written in English, with an optional **Chinese version**, sent to one **Audience** in **Waves**. A campaign written before the block editor keeps its plain-text `body` and at most one button, and its words, order and links are shown and sent as they always were (ADR 0036). Its sends are rows of the campaign ledger, `customer_campaign_sends`, under `campaign:<id>`, so no **Customer** gets the same campaign twice. Once its first Wave starts, its email and Audience are fixed; a changed email is a duplicate.
_Avoid_: "newsletter" or "blast"; sending one through the transactional mailbox (never: campaign mail goes through its own Resend subdomain); putting a **Review request** or an **Aftercare message** in one

**Email block**:
One typed part of an **Email campaign**: heading, text, buttons, image, hero, image + text, products, divider or spacer. Its type is from a list in code; **Staff** fill in its words, image, link and a few preset options, never its HTML, fonts or colours, and it is right in light and dark by itself. A campaign's blocks are stored as versioned JSON, `{ v: 1, blocks: [...] }`, checked by one schema on every write and rendered only on the server (ADR 0036). A products block holds only **Storefront product** ids: each product's name, photo and price are the shop's, read when the email is rendered (the **MSRP** Costings sets), and a product no longer **Listed** stops the send by name.
_Avoid_: "section" (a pillow filling's compartment, and the landing page's **Landing section**); "module", "row", "component"; an HTML block (there is none, on purpose)

**Starter**:
A ready-made layout: a list of **Email blocks** with **Placeholders** for its words (*Product launch*, *Care tips*…). A campaign can start from one, or have one dragged into it; either way it becomes ordinary blocks, each movable, changeable and deletable. Defined in code (`lib/email-campaigns/starters.ts`). The sign-in invitation is the one Starter with finished words, and with its **Audience**; the CRM's **Playbooks** (PRD-crm-retention-loop slice 07) are Starters that are written word for word and also choose an **Audience**.
_Avoid_: "template" (an **Email template** is the words of a platform email; a Starter is the start of a campaign); "layout" on its own (the shell's layout is code, and nobody edits it)

**Variable**:
A value the platform fills in when an email is sent, shown to **Staff** as a chip they drag or insert into the words and written `{first_name}`. In an **Email campaign** it is a recipient's detail (*First name*, *Last name*, *Points balance* while points are live, *Your pillow*: the pillow they bought last, as the shop names it) with **fallback words** for a customer who has none, set once per campaign. In an **Email template** it is that email's own data, such as `{order_number}`.
_Avoid_: "merge field", "merge tag"; "placeholder" (that is the hint text, a **Placeholder**)

**Placeholder**:
The grey hint an empty field shows (*e.g. Sleep cooler this December*). It is never saved, tested or sent; a required field still on its placeholder is empty.
_Avoid_: calling `{order_number}` a placeholder (it is a **Variable**); words typed into a field so that someone deletes them (there are none, on purpose: owner, 2026-10-29)

**Chinese version**:
A campaign's words in Simplified Chinese (the editor's 中文), for the **Customers** whose language is Chinese (`customers.locale = 'zh-CN'`). The same blocks, images, products, buttons and **Variables** as the English; only the words differ. Made with ✨ *Translate to Chinese* and edited by **Staff**. A campaign without one sends English to everyone. It is kept in the email's content (`content.translations["zh-CN"]`: its subject, preview line, the Variables' Chinese fallback words, and each block's words by block id), so the lock fixes it with the English. Each block's Chinese remembers the English it was made from: a block added in English is *not translated yet*, one whose English words changed since is *out of date* until it is translated again or kept, and either holds the wave. The layout, the links and the button targets are always the English's.
_Avoid_: "a second campaign" (it shares the campaign's **Audience**, sends and lock); "localisation"

**AI draft**:
Words Claude wrote for a campaign, from the subject and the brief **Staff** gave it, or a translation of its English. Written into the editor as one change Staff keep, change or undo; never saved or sent until Staff press Save and Send. Blocks from it are marked *Drafted with AI* until a person edits or keeps them; the marks are saved with the email (`content.aiDrafted`), so the send checklist can count any left. Claude's smaller help with words Staff wrote themselves (subject and preview line ideas, a rewrite of one heading or text block, shown beside it) is not an AI draft: it is a suggestion Staff pick or reject, and one they pick or *Replace* with is theirs, unmarked. Claude reads only the brand's facts (`lib/ai/mpillow-facts.ts`) and Staff's words, never a **Customer**.
_Avoid_: "AI-generated email" (no email is generated without a person); calling the brief a prompt in the UI

**Audience**:
Who an **Email campaign** is for: *Imported from Shopify, not signed in yet* (every unclaimed **Migrated customer**), *everyone subscribed*, or a **Segment**, minus its **Exclusions** (*Leave out people in…*, PRD-campaign-audiences slice 06). The **Rest period** and the sunset rule (**Unengaged**) narrow it at every send, as consent does. Each Segment, sent to or left out, is read again when each **Wave** is planned, and one that is archived or needs review refuses the Wave by name. Whatever the choice, only `subscribed` **Customers** receive it, and nobody whose campaign email bounced or was marked as spam. The rule is checked again in SQL at the moment of each send. A Segment chosen by what the same campaign did (*got it*, *clicked it*, *got it, didn't click*) is refused as its Audience, on Save and at every Wave: everyone in it has been sent the campaign already, so it would never send (PRD-campaign-audiences slice 05). It is for a follow-up campaign.
_Avoid_: reading an Audience as the people who will receive it — **Marketing consent**, suppression, the **Rest period** and the sunset rule narrow it at every send

**Exclusion**:
A **Segment** whose **Customers** a campaign's **Audience** leaves out, up to three (`email_campaigns.exclude_segment_ids`). Read again with the Audience at every **Wave**; fixed with it once the first Wave is planned. It only ever narrows: someone in two counts once, against the first. The plan says how many each one left out.
_Avoid_: "suppression list" (suppression is bounces and spam reports, for every campaign); "blocklist"; using one to reach anyone

**Rest period**:
How long after one marketing email a **Customer** receives no other, and how many they may receive in 30 days (owner, 2026-10-31: 7 days, at most 4; a points-expiry reminder counts). Checked in the claim rule, like consent. A Customer inside it is *rested*: skipped, not failed, with no ledger row, so a later **Wave** reaches them; the plan says when they are next eligible. Transactional and aftercare email never count.
_Avoid_: "frequency cap" in UI copy; "smart sending"; reading a rested Customer as failed

**Campaign click**:
The first time someone opened a site link from one campaign send, recorded on that send (`customer_campaign_sends`) from a token in the link, then stripped from the address. It shows the link came from that email, not who is holding it: emails are forwarded and link scanners click, so counts are approximate. Never used to identify a browser or merge a **Visitor** into a **Customer**.
_Avoid_: "open" (not recorded: there is no pixel); treating a click as proof of who clicked; rewriting links through Resend

**Ships to**:
Where a **Customer** is, as a two-letter country: their latest counted **Order**'s shipping country (a self-collect or re-adjustment **Order** is the studio's, Singapore), else their default address's, else the address they saved last (`ship_country` on the Customer overview; PRD-campaign-audiences slice 05). *Unknown* when none names one, as for a Shopify-era buyer with no **Order** here and no address. In-store fitting and re-adjustment are Singapore-only, so it decides which wording an email may use.
_Avoid_: taking *Unknown* for Singapore, or leaving it out silently (the Customers list says how many a Singapore or overseas filter leaves out); calling it where they live (it is where we last shipped to)

**Kept sending**:
A campaign that, after a first **Wave** a person started, runs one Wave a day by itself (at 10:00, labelled *Daily, 1 Nov*) to people who have joined its **Audience** since, up to its daily cap, inside Resend's daily room less a reserve of 30, the pause rule and the **Rest period**, until paused. Its email and Audience stay as the first Wave locked them; its Segments' filters stay as a person approved them, and the daily job pauses it when one changes (PRD-campaign-audiences slice 10). Chained onto the daily job; no new cron.
_Avoid_: "automation", "flow", "drip" (each suggests branching or content changes it does not have); reading it as a way to change an email after sending

**Bought after a campaign**:
A **Customer** sent an **Email campaign** who made a **Purchase** (never a re-adjustment fee) paid within 30 days after it was sent them; its total is net of refunds, and *after a click* when paid after their first **Campaign click** (PRD-campaign-audiences slice 11; retention metric M22). Counted on the campaign's Results tab, by the **Lifecycle stage** they had when sent (kept on the send, since the stage moves), with every rate over people sent and a dash when nobody was.
_Avoid_: "conversions" or "revenue from email" (people buy for many reasons; only a **Holdout** measures what the email added); rates over opens

**Holdout**:
The 10% of the people a **Kept sending** campaign would send to that it keeps back while its holdout is on, chosen by a hash of the Customer id (the same people every time, and for every campaign holding out). Each is recorded on the ledger as *held out*: never sent that campaign, by the daily job or any later **Wave**, even once the holdout is off; not counted against Resend's room, the cap or the **Rest period**. Their 30-day purchase rate is set beside that of the people sent in the same weeks. Offered from 500 people sent (owner decision 5; slice 11).
_Avoid_: "control group" in UI copy; reading a held-out Customer as unsubscribed or suppressed (they get every other campaign)

**Unengaged**:
A subscribed **Customer** the sunset rule leaves out of campaigns: an *At risk · Lapsed* customer, or a *Lead* who has been a Customer for over 12 months, who clicked none of their last 6 campaigns (owner, 2026-10-31; PRD-campaign-audiences slice 12). Nobody sent fewer than 6 is Unengaged. A Lead's 12 months count from when they became a Customer here (an imported Customer's from the import: the export has no sign-up date). Derived, never stored: a click or a purchase ends it at once. A Customers filter (*Engagement*), so it can be seen and saved; a campaign leaves it out unless it ticks *Include unengaged* (a win-back), and the plan says how many it left out.
_Avoid_: reading it as a **Lifecycle stage** or as consent (they can still be emailed, and still unsubscribe); "inactive", "dormant"

**Email template**:
The words of one email the platform sends (an order confirmation, a return update, a customisation notice…): its subject, inbox preview line, heading, messages and button labels, with **Variables** such as `{order_number}`. Owner and Admin edit them on **Admin Panel** → Email templates (`email_template_copy`); the layout, the data (items, amounts, addresses, codes, links) and the footer stay in code. An unedited email sends its original words, and any failure to read an edit falls back to them.
_Avoid_: "template" for the layout or design (that is fixed); calling an **Email campaign** a template (each campaign is written once, on its own page)

**Wave**:
One run of an **Email campaign** to the next *n* eligible **Customers**, buyers first, started by **Staff** and sent from the open page a batch at a time. The next Wave is held while the last one, of any campaign email, had over 2% bounces or 0.1% spam reports, until Staff resume it.
_Avoid_: "batch" for the whole run (a batch is one request inside a Wave); scheduling (there is none yet)

**Email funnel**:
The page that lays every email the platform sends by itself along the **Lifecycle stages** (**Admin Panel** → Email campaigns → Funnel, `/settings/campaigns/funnel`; PRD-email-funnel, ADR 0054; owner, 2026-11-18). For each stage: the **Segments** that cut it, its **Email flow**, and what each email did for the people who were at that stage when it reached them. It reads what is set up and stores nothing; it sends nothing. Its stages are the **Lifecycle stage**'s five, so it starts at *Lead*: a **Visitor** who has given no email is not on it. *Lost* is sent no marketing email; service emails about an order still go.
_Avoid_: "marketing funnel" for the **Visitor** journey (that is Analytics, per **Visit**); a second list of stages for email; reading a stage's count as who will be emailed (consent, suppression, the **Rest period** and the sunset rule narrow it at each send)

**Funnel step**:
One email in a stage of the **Email funnel**: an **Automatic email**, or an **Email campaign** sent to a **Segment** of that stage (a **Playbook** started, or one Staff wrote). The designed steps are a list in code (`lib/email-funnel/programme.ts`). A campaign's stage is read from its Segment's `stage` filter, and a Playbook's step is *set up* when a live campaign's Segment has the Playbook's filters; neither is stored. Each is *Service* or *Marketing*, by the consent it reads.
_Avoid_: storing a campaign's step or stage; "node", "action" (a builder's words: nothing is built on the page)

**Email flow**:
The picture, for one **Lifecycle stage**, of its **Funnel steps** in order: who enters, what each email waits for, what state it is in (*On*, *Not set up*, *Keeps sending*, *Paused*), and what ends it. A follow-up hangs under the campaign its Segment reads (*got it*, *clicked it*, *got it, didn't click*), and the **Rest period** is drawn between two marketing emails. Drawn when the page is read, never stored or edited there.
_Avoid_: reading it as a flow builder or a branching automation (a step with two emails is two campaigns); "flow", "automation" or "drip" for **Kept sending** itself, as before; "journey" (the Customer page's tab, and Analytics)

**Automatic email**:
An email the platform sends by itself, with words fixed in an **Email template**: the three draft reminders (ADR 0050), the **Review request** and the **Check-up reminder** (**Aftercare messages**), and the order, return and quote emails. On the **Email funnel** each is a **Funnel step** of the stage its trigger falls in, marked *Service* (sent whatever the **Marketing consent**) or *Marketing* (draft reminders and the Check-up reminder read it). It shows only the outcome it already records: a review link opened, a booking after a check-up, a Draft finished after a reminder.
_Avoid_: calling a **Kept sending** campaign one (Staff wrote it, and started it); "transactional" for all of them (draft reminders and the Check-up reminder read consent); "system email" in UI copy

## Customer messages (PRD-social-inbox)

**Customer message**:
A direct message someone sends Mpillow on Facebook Messenger, Instagram or TikTok, stored in `social_messages` under one `social_conversations` row per person per platform. The sender need not be a **Customer** (no account, no order) — anyone who writes.
_Avoid_: "chat" or "lead" for the stored row; mixing these with WhatsApp (the staffed WhatsApp line is answered in the Business app, and the Cloud API number only sends appointment reminders)

**Message card**:
The Telegram message in the measurements group for one inbound **Customer message**, headed `💬 FACEBOOK MESSAGE`, `💬 INSTAGRAM DM` or `💬 TIKTOK DM` and the person's name, threaded under their previous card. A reply to it (or to the bot's `📤 Sent` / `↪️ Answered in` notes under it) from someone allowed to **Answer customer messages** is sent to that person on that platform.
_Avoid_: calling it a **Review card** — those carry buttons and a draft; a Message card is answered by replying

**Team note**:
A reply under a **Message card** or a Google **Review card** that starts with `//`. It stays in the group: never sent to the customer, and never a review's draft.

**Reply window**:
How long after a person's last **Customer message** the platform accepts our reply through the API: 24 hours on Facebook and Instagram (7 days with Meta's Human Agent permission). Past it the bot refuses and says to answer from the platform's own app. TikTok has no time limit; it caps the number of messages instead (up to 10 in a new chat's first 48 hours, 3 once the person has been quiet for 48 hours, until they write again) and its refusal is passed on in words.
_Avoid_: retrying a refused reply from Telegram — the platform will refuse it too

**Echo**:
A message our own account sent, reported back by the platform. The echo of a reply sent from Telegram is matched and ignored; one sent from Meta Business Suite, the Instagram app or TikTok is recorded and noted under the card as `↪️ Answered in …`. TikTok's automatic messages (welcome message, suggested questions, keyword replies) are not echoes a person sent and are dropped.

## Shipping (ADR 0020, ADR 0022, ADR 0031, ADR 0043, ADR 0044)

**Shipping method**:
A row in `shipping_methods` a shopper picks at checkout (e.g. Standard, Express), scoped to `countries`. Its **Rate source** decides how it is priced; `free_above` and free-shipping coupons apply to either source. Edited in Settings → Shipping.
_Avoid_: "courier" (a method may be served by different couriers per address)

**Delivery time**:
What a shopper is told a **Shipping method** takes. The text Staff set on the method (`estimated_days`, e.g. "About 2 weeks"), in the shopper's language or else English; when there is none, a live method's courier transit window plus handling days. Shown the same on checkout, the configurators and the delivery checker (ADR 0043).
_Avoid_: showing the courier's window over Staff's text; "estimated days" in copy

**Delivery country**:
A country at least one active **Shipping method** lists. Checkout and the delivery checker offer exactly these, so adding a country to a method is what offers it; there is no other list. Countries come from the country catalog (`lib/shipping/countries.ts`): name, region, the main city a quote sends when the shopper has given none (and, in the countries where Easyship needs a state, the state the postal code is in: `lib/shipping/states.ts`), and a sample postal code, or none where the country has no postal codes (Hong Kong, the UAE), in which case the postal code is optional.
_Avoid_: a country list hardcoded in a page; "shipping zone" (methods list countries, not zones)

**Courier coverage**:
Whether the **Courier account** gets at least one courier rate for a country, checked live in Settings → Shipping → Coverage by quoting one boxed item to the country's main city. Shown, never stored: it answers which countries are safe to add to a live method, and each checkout still quotes its own address.
_Avoid_: treating a covered country as offered (only a method's `countries` offers it); a stored coverage table

**Rate source**:
How a **Shipping method** is priced: `flat` (its `base_rate`, the same for every address in its countries) or `easyship` (a **Live rate**, the default for new methods). A live method's `base_rate` is never charged: checkout and the customisation flows both quote couriers, and a Result keeps its **Result shipping rate**.
_Avoid_: "fallback rate" — a live method with no quote is hidden, not priced flat (ADR 0022)

**Live rate**:
The price of an Easyship **Shipping method** for one cart to one postal code: Easyship's courier price for the courier the method's strategy picks (`cheapest`, `fastest`, `best_value`, or one pinned **Courier service**), plus the method's markup, rounded up to its increment. Quoted by the server from the **Variants** in the database — never from a client price — and cached as a **Rate quote**.
_Avoid_: treating it as a stored price on the method; showing a live rate the checkout route would not charge

**Result shipping rate**:
The **Live rate** a customisation was quoted for its address when its shipping was chosen (hold, finish, or a Staff re-configure that changed the method or postal code), stored on the Result as `shipping_rate`, before `free_above`. Every later repricing charges it, so assign and accept ask for the figure the customer saw. A Paired build's is quoted for both boxes on the anchor (ADR 0032). Null for a flat method, Self-collect, or a companion: those charge `base_rate`.
_Avoid_: re-quoting couriers at assign or accept; charging a live method's `base_rate` on a Result

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
One Easyship service (e.g. "Ninja Van Standard"), identified by its Easyship id. The one a shopper paid for at checkout is recorded with the **Order shipment**. An **Order** made from a **Result** records none, so its label is made with the one its method's strategy picks from today's rates (ADR 0043, ADR 0044). Staff may choose another when they create a label by hand.

**Order shipment**:
An **Order**'s Easyship shipment in `order_shipments` (one per order): the **Courier service** chosen at checkout and what it was quoted at, the label, and what the label cost. Server-only — what a courier costs us is never on `orders`, which customers read. The courier's name and its latest tracking status are on `orders`, because customers see those.
_Avoid_: putting carrier cost or label URLs on `orders`

**Label**:
The courier's shipping label for an **Order**'s box: a PDF with the courier's barcode and tracking number, which Staff print and stick on the parcel. The courier issues it only when its fee is paid, so making a label charges the Easyship account. Made automatically when the Order is paid, on the customer's **Courier service** (ADR 0044); Staff **Create label** by hand only when that did not happen, and the Order's timeline says why. Making it does not ship the Order: the courier's first scan does. A full refund cancels it while the parcel is still here.
_Avoid_: "buy a label" in Staff-facing copy (Staff create and print labels; the fee is the courier account's); treating a label as "shipped"

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
- Analytics is retrospective P&L over this site's **Sales** only, dated by Stripe's time for the money, in Singapore calendar months. Margin % is gross margin over costed revenue; a sale with no cost is reported as uncosted, never as $0 cost (ADR 0036). On-hand stock value KPIs (inventory at cost, potential MSRP revenue, unrealized margin, weighted margin %) live on **Costings** as-of-now, not on Analytics.
- A platform **Order** line's COGS is frozen at sale from the stock it took: the Items its sale deducts, fillings included.
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
> **Domain expert:** "**Product Visualize** on the Products page — pick a **Media Asset** per cover/case **Item**. The Your Custom Mpillow preview shows that overlay when the shopper selects the option: the case's, since the case is what the pillow wears, unless the shopper switches on **Show on pillow** beside Cover Style to see the cover instead."
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
> **Domain expert:** "No — Analytics does not read Shopify at all. It tracks this site's **Sales**, dated by Stripe. On-hand stock value belongs on **Costings**, not Analytics."
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
The login identity of a partner business: a `partner_users` row (mirroring the `admin_users` pattern) linking an auth user to a `type='partner'` **Location** row in the `partners` table. Approved self-serve signup creates/claims that Location row with the logo, write-up and website from the **Partner application**, and lists it on `/our-partners` at once unless Staff keep it hidden in the approve dialog (ADR 0052). Portal profile edits (company name, logo, write-up, website, locations) write to the **same row** that powers `/our-partners` and appointment booking, and to that row's branch rows for the partner's other clinics (ADR 0037) — one aggregate, one CRUD path. Edits apply **immediately** (hub and `/our-partners` both reflect them); Staff are notified and can one-click hide (`visible=false`) or revert — no draft/published split in v1. Logo guidelines (square, min dimensions, format) are shown at upload. Online-only referrers are rows with no address that never get booked.
_Avoid_: a separate partner-profile table that can drift from the **Location** row; "partner" alone when you mean the login identity vs the business row

**Partner application**:
The self-serve signup submission: the 8-field questionnaire — company name · ACRA UEN · business website (or main social page) · business category (physio / chiro / TCM / wellness / retail / other) · contact person name · contact mobile (WhatsApp) · business email (prefilled from sign-in) · "How do you plan to introduce Mpillow to your clients?" (free text, the reject-signal question, seen only by Staff) — plus the public **listing** they want on `/our-partners`: a write-up of what the practice does (required) and a logo (optional, uploaded with the application) — plus recorded agreement to the partner terms. Verification is Staff eyeballing ACRA/website manually (no ACRA API in v1). Clinic addresses are profile settings after approval, not application fields (ADR 0052). The agreement is a **static versioned legal page** in the repo (i18n): the application records `agreed_version` + timestamp; a later terms change = new version, existing partners re-accept on next hub entry. Status machine: `pending → approved | rejected`. While `pending` the applicant may **withdraw**: the application is deleted (not a status), so joining later means applying again. Approving sets the partner's **Commission Pool** and **Partner customer discount**, issues their Promo Code (the referral code), and emails the Approval Notice stating the Promo Code, Territory and pool. "Become a Partner" (enabled only after agreeing to terms) submits the application; the applicant can sign in but sees only an "under review" screen while `pending`, with a preview of their listing and the withdraw button. **Approval gates the portal**: Staff approve → notification → full portal unlocks and the listing goes live; reject → rejected state. No referral accrual, no commissions, no `/our-partners` publishing before approval.
_Avoid_: granting portal features at agreement time; treating the agreement page as the approval; a `withdrawn` status (a withdrawn application is gone); publishing a listing before approval

**Partner sign-in**:
Partners use the same unified **Sign in** at `/account/login` (menu → login) — no separate door, no password. Methods: Google OAuth, or passwordless email where the one shared email carries **both** a 6-digit code and the magic link (form gains a code-entry step via `verifyOtp`); this upgrade applies to all roles, not a partner fork. Partner sessions have a **7-day absolute cap** enforced app-side in the partner portal guard (`last_sign_in_at` check → force re-auth); Customer/Staff session behavior unchanged.
**Backup email**: the partner may add one backup email in hub settings, verified once by OTP; it becomes a second recognised sign-in identity on the same **Partner account** — signing in with it uses the normal OTP flow and lands in the same hub. No custom recovery-code bridge.
_Avoid_: a partner-specific login page; capping the global Supabase session (it would hit Customers/Staff); idle-timeout semantics ("7 days max" is absolute); server-minted sessions for the "backup code" path

**Partner Hub**:
The partner-facing portal at `/partner` — pill label and page title "Partner Hub". Requires an approved **Partner account** (pending applicants see the under-review screen; guests are sent to **Sign in**). Home = gamified earnings/milestone dashboard and Your commission (the **Commission Pool**, the **Partner's share** picker, and what their customers get); also profile settings, backup email, and WhatsApp support CTA.
**Partner notifications**: email for application approved/rejected · "you just earned a referral" at attributed capture (the delight moment) · milestone rung reached · payout made (proof attached) · re-accept terms. Partners with WhatsApp may **opt in** to receive the same events via the existing WhatsApp Cloud API (per-partner channel preference; templates required). Cross-cutting requirement: **all** outbound utility emails (customers and partners alike) get properly styled branded HTML templates.
_Avoid_: "Partners page" (collides with `/our-partners` and the `partners_page` CMS table); `/partners` as the route; undated or unstyled notification emails

**Referral**:
A deterministic credit linking a **Customer**'s customisation/purchase to a **Partner account**. Channels: (1) the partner's unique **referral code / shareable link+QR** (stamped on the Visitor at landing, carried onto the **Result** at hold and the **Order** at capture; typeable in the one optional **Checkout code** field on the customisation contact step — mp-config and mbolster-config — and on shop checkout, checked inline against active partner codes), (2) **partner-assisted customisation** — a signed-in partner runs the customisation flow for a customer, and the partner session stamps the attribution on the Result automatically. Self-reported **Discovery source** is never attribution.
Conflicts: **one Referral per Order, never split — whoever closed the sale gets the commission.** Priority: partner-assisted session > code explicitly typed by the customer > most recent `?ref` link within the **30-day** attribution window (last-touch overwrites).
Partner-visible detail (PDPA): **partner-assisted** referrals (their own clients / walk-ins — data the partner entered) show **full customer details** for verification; **link/code** referrals show **masked identity only** (those customers never consented to sharing identity with the clinic) plus product, commission status, and release countdown. Headline hub metric = distinct customers with attributed **paid Orders**, plus an "in progress" pipeline line (attributed Results not yet captured). The Admin Panel always sees all details.
_Avoid_: "client" for the partner (ambiguous with the partner's own patients — say **Partner**); Discovery source as a commission trigger; Entry source as attribution

**Partner-assisted customisation**:
The existing configurator (mp-config / mbolster-config) launched from **Partner Hub** ("Customise for a customer") with the signed-in partner session stamping the **Referral** on the Result — same questions, same photos, no duplicated form. Differences from the guest flow: the recommendation surface shows **size only** (no **Filling Template** recommendation), **Add-on** cards and the cross-flow **Upsell card** are hidden (commission scope is pillow/bolster only), and the finish panel is co-branded — title "[Partner name] × Mpillow" with the partner's uploaded logo beside the Mpillow logo and a partner-personalised description (replacing the generic "Customize finish… optional add-ons…" copy). Keeps: cover style, case style, contact → shipping, and the **Authorization hold** — the customer enters their own card on the partner's device. This is **not** Staff assist mode: no x-ray filling editors, no admin tools.
_Avoid_: rebuilding the questionnaire inside the hub; showing filling-template recommendations to partners; add-on upsells in the partner-assisted flow; **Assisted customisation** (a **Staff** member's **Assist link**, the customer's own device, no **Authorization hold**, no **Referral** and no **Commission**)

**Commission**:
The money a **Referral** earns a partner: the partner's share of the **Commission Pool**, once per **Qualifying Sale** (an attributed **Order** holding at least one customised premium pillow), however many it holds (ADR 0034). Lifecycle: `held → released → paid | void`. Created **held** at capture (`paid_at`); **released** when the RMA **Return window** closes (30 days after `delivered_at` — the commission countdown in Partner Hub IS the return window; in-store handover sets `delivered_at` at handover). An RMA **refund** of any customised premium pillow in the order voids the order's commission; **exchange/replacement keep it** (a pillow was still sold). Released commissions accumulate toward the next payout. Scope: customised premium pillows only — never basic pillows, bolsters, add-ons, accessories, shipping, or tax. Rows written before ADR 0034 were per unit (`basis = 'unit'`) and keep their old void rule.
**Framing (compliance)**: the partner is the ACRA-registered **business entity**; commission is framed as retail/referral **margin to the clinic**, never a per-referral payment to an individual clinician (AHPC Code §5.7 — registered AHPs' recommendations must not be reward-influenced; §5.7.1 requires disclosing financial interest). The partner agreement requires patient-facing disclosure of the partnership; the co-branded assist flow doubles as that disclosure. Individual-clinician perks lean non-cash.
_Avoid_: releasing on a payment-dated clock while the return window is still open; clawback-after-release states; commission per unit or on add-ons, bolsters or basic pillows; "kickback"-shaped copy aimed at individual clinicians

**Commission Pool**:
The flat amount per **Qualifying Sale** set out in the Referral Partner Agreement's Schedule (S$50). Staff set it per partner (`partners.commission_pool`) when they approve the application and on Partner commissions → Partner terms; the partner sees it in Partner Hub but never edits it. The partner takes the pool or any lower amount they pick (**Partner's share**). What they leave is Mpillow's (ADR 0034).
_Avoid_: "commission scheme" (the retired per-unit, per-product % or $ configuration; `commission_schemes` is no longer read); a rate per unit; letting the partner change the pool

**Partner's share**:
The part of the **Commission Pool** a partner takes per **Qualifying Sale**: the whole pool unless they pick less in Partner Hub → Your commission (agreement clause 7.2). A changed pick starts the day after the next **Payout Date**. The share that applies to an order is the one in force the day the customer pays, so the hold fixes it on the **Result** (`partner_commission`) and Accept pays exactly that.
_Avoid_: Staff setting the share for the partner; a change that applies to orders already paid

**Partner customer discount**:
The part of the **Commission Pool** a partner leaves, passed to their customer as money off when Staff turn it on for that partner (`partners.customer_discount_enabled`, Admin Panel only). It applies when the customer types the partner's code in the **Checkout code** field on a customised premium pillow, comes off the goods like a **Discount code** (kept as the Result's `coupon_terms`, `fixed_amount`, with no coupon behind it), and never stacks with a typed discount code. A referral link alone gives no discount. It is Mpillow's offer (agreement clause 5.1), so the partner sees it but has no control over it.
_Avoid_: a partner-set discount (rebating, clause 5.2); a discount on a shop order, a bolster or a basic pillow; reading it as reducing the commission after the hold (the hold fixes both, and they add up to the pool)

**Qualifying Sale**:
An attributed, fully paid **Order** holding at least one customised premium pillow (a **Result** with `product_type = pillow`, tier `premium`) whose refund period has ended with no such pillow refunded (agreement clause 6.3). It earns one **Commission**. Self-purchases never qualify.
_Avoid_: counting units; treating a shop order as qualifying

**Payout Date**:
The last business day (Monday to Friday) of each month. Commission on a sale that qualified in one month is paid on the next month's Payout Date, by hand (**Payout**). Public holidays are not skipped.

**Partner self-purchase**:
A purchase made in the partner's **own signed-in account** at a partner-specific discounted rate (admin-set, like the **Commission Pool**), capped at an admin-set number of units. Distinct from earning **Commission**: self-purchase gets the better price instead, and self-purchases **never count toward the Milestone track** and are never a **Qualifying Sale** (agreement clause 5.3). A partner's own referral link used anonymously still follows the normal commission model.
_Avoid_: conflating the self-purchase discount with commission; uncapped self-purchase pricing; self-purchases moving the milestone bar

**Payout**:
How released **Commission** leaves the building: **manual only in v1** — Staff transfer via PayNow or bank using the payment details the partner uploaded in Partner Hub (PayNow QR image and/or bank account fields), then record the payout with an uploaded **proof-of-payment image**. The partner sees their accumulated released balance, payout status, and the proof attachment in the hub — full transparency. No minimum threshold (thresholds that trap small balances are a documented churn driver). Staff work payouts from a dedicated Admin Panel **Partner commissions** page (per-partner ledger: held / released / paid, countdowns, payment details, application queue nearby); the Orders table gets a partner-source **badge** on attributed rows, but money workflows never live inside Orders rows.
_Avoid_: automated disbursement rails in v1; payout minimums; undated "pending" balances anywhere in the hub

**Milestone track**:
The Partner Hub's gamified spine: a **cumulative lifetime** ladder of attributed pillow/bolster units, rungs spaced roughly geometrically (~5 / 15 / 40 / 100; exact values Admin-tunable). Progress moves **at sale** (attributed Order capture) for instant feedback; a later refund-void decrements the count. Since ADR 0034 the bar counts **Qualifying Sales**, and each rung grants an escalating **non-cash professional perk** only (tiers ratchet up, never demote): no cash bonus and no rate bump, because the agreement pays the flat **Commission Pool** and nothing else (clause 7.8). Before that, rungs also granted a one-time cash bonus and a permanent per-unit rate bump (certified-fitter site listing → demo set → co-marketing → top-tier recognition). **Endowed progress**: the bar starts with 2 units credited, with the reason stated ("launch partner bonus"). Social proof is a "top N%" percentile chip — no leaderboard. Occasional surprise gift at rung crossings is the only variable-reward element. Money is separate and always follows the **Commission** lifecycle. No periodic resets in v1.
_Avoid_: moving the bar only at commission release (kills the feedback loop); resetting progress; demoting tiers; full ranked leaderboards at this partner count; hard streaks for monthly-cadence sellers

## Marketing

**Science of Sleep**:
Retired (owner, 2026-10-27). Mpillow no longer uses this phrase or concept on any surface: copy, metadata, email or `llms.txt`. Lead with measurement-led cervical fit instead. Gift/customisation language is still a conversion tactic (CTAs, product cards), not the primary brand story.
_Avoid_: writing "Science of Sleep" anywhere; leading every surface with gift/lifestyle framing when the page's job is clinical sleep fit

**In-store fitting**:
Singapore only. Customers in other countries measure online and buy online. Copy that offers an in-store fitting says it is in Singapore, or pairs it with the online route for overseas customers.
_Avoid_: implying a store visit is available outside Singapore

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

**Email rendition**:
The copy of an image **Media Asset** that an email shows (`media_asset_renditions`, the media bucket's `email/`): a JPEG, or a PNG when the image has transparency, at most 1,200px wide, because classic Outlook shows no WebP **Hosted URL**. Made once per Asset, the first time it is placed in an **Email block**, and reused by every campaign and send; a sent email points at it for good, so its file stays when the Asset is deleted. An image with transparency sits on the email's light plate, so it reads in dark mode (PRD-campaign-email-editor slice 05).
_Avoid_: putting the **Hosted URL** in an email; "thumbnail" (it is full size for the email column)

**Drive provenance**:
The original Google Drive file id/URL kept on an Asset after a one-time import — for Open in Drive and manual re-import only. No ongoing sync with Drive.

**Used / unused**:
**Used** = currently referenced by a known consumer (landing slots, blogs, products, categories, partners, page builder, **Email campaigns**; drafts count). An **Email campaign**'s use, draft, sent or archived, also stops the Asset being deleted at all, past any "Delete anyway". Order item image snapshots do not count. **Unused** = no such reference.

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
(the landing page has no block model — a section is its smallest unit; an **Email block** is part
of an **Email campaign**); **Product section template** (the learn-more slide-in primitive, a
different catalog)

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
The full-height sheet opened from landing-page "Learn more" CTAs (Size Matters, Ambassadors, Basic Mpillow, Premium Mpillow, Cervical Neck Support, Mbolster) — the landing page's **sub pages**. Primary job: product story + route to customisation or book appointment. All six are composed from shared section templates and are editable in the Page Builder (**Slide-in section**).
_Avoid_: conflating with standalone routes like `/mbolster` or the `/mp-basic` / `/mp-config` wizards

**Product section template**:
A layout primitive reused across learn-more slide-ins. Each template accepts content props (title, description, image, items, etc.) — no product-specific copy inside the component. Agents compose slide-ins by ordering templates with i18n-backed content. Shell (header, progress, sticky CTA) is out of scope for layout redesign.
_Avoid_: one-off inline layout duplicated per slide-in file; hard-coded product copy inside templates

**Slide-in section**:
One section of a landing **sub page** — a **Learn-more slide-in** (Size Matters, Ambassadors, Basic
Mpillow, Premium Mpillow, Cervical Neck Support, Mbolster) — as the Page Builder edits it: a
**Product slide section config** entry, named by its stable `key`, plus an optional
`slide_in_sections` row of Staff overrides (position, visibility, and `content` — copy per locale
as a whole record, media shared by both). The config decides which sections exist; a section with
no row renders its code default. Staff reorder, hide and edit sections but cannot add or remove
them. The sheet header (title and the line under it) is a pinned pseudo-section. Drafts, **Publish**,
Discard and **Publish snapshot** history work per sub page, as for the landing page. ADR 0046.
_Avoid_: **Landing section** (the landing page's own catalog and table); deleting a section to
hide it; editing a price here (Costings is the single source of sell price); renaming a config
`key`, which orphans its edits

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

**Agent catalog**: TypeScript types in `lib/product-slide-sections/` (source of truth) + agent playbook at `docs/marketing-page/product-slide-sections.md`. Templates are reusable code blocks; Staff reorder, hide and edit them per sub page in the Page Builder (**Slide-in section**, ADR 0046).

**Size Matters**: `press_quote` → `split_hero`(size matters) → `measure_carousel` → `split_hero`(head shapes) → `split_hero`(why unique) → `split_hero`(sleep position) → `split_hero`(configurations)

**Ambassadors**: `split_hero`(hero) → `split_hero`(all builds) → `split_hero`(ambassadors, collapsible awards) → `typed_quote` → `video_section`(split)

**Answer lede**:
A direct-answer block immediately after the page H1 (or H2 on sectioned pages). Stored as optional `seo_answer` on **Storefront product** and blog content; falls back to `seo_description` then `description`. Primary pattern for AEO/GEO fact density. Industry “TL;DR” / key-takeaways guidance maps to **Answer lede** — same field, same placement; do not add a second summary UI.
- **Home hero** (`home.hero.seoAnswer`): **28–40 words**, hard **≤4 lines** (`line-clamp-4`) — layout over the product image wins; still answer-first for extractors.
- **Other surfaces** (config shells, guides, PDP): prefer **40–60 words** (featured-snippet peak).
_Avoid_: burying the answer below fold or inside client-only modals; building a separate TL;DR / key-takeaways component; shipping a hero wall of text over the product image

**Copy fit (layout + SEO)**:
Marketing strings must fit the surface they render in — keyword intent does not excuse overflow. Hard bands for en-US **home hero**:
- **Hero H1**: **≤2 lines** → 4–8 words and ≤55 characters (`line-clamp-2`). May be a brand tagline; then Singapore / cervical / neck **must** appear in the Answer lede.
- **Hero subtitle**: optional; ≤12 words when present (omit rather than repeat the lede).
- **Hero Answer lede (`seoAnswer`)**: **≤4 lines** → 28–40 words (`line-clamp-4`).
- **Meta title** (separate from H1): 50–60 characters for SERP display; may differ from on-page H1.
- **Card / section blurbs**: ≤18 words unless the surface is a long-form slide body.
Canvas Recommended supplies keyword intent; if a Recommended string breaks a band, **compress** — do not drop required intents (Singapore / cervical / neck pain where the surface requires them). They may live in the lede when the H1 is at the 2-line cap.
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
- "placeholder" was used for both the grey hint in an empty field and `{order_number}` in an **Email template** — resolved (owner, 2026-10-29): a **Placeholder** is the hint, never saved, tested or sent; a **Variable** is what the platform fills in when the email is sent. The code's `placeholders` field (`lib/email/copy.ts`) keeps its name; what Staff read says Variable (PRD-campaign-email-editor slice 14).
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
- Orders date-range **sales** report — resolved: filter list + dashboard summary by **`paid_at`** (not `created_at`). Unpaid/pending without `paid_at` fall outside the sales window. Analytics dates a **Sale** by Stripe's charge time in the money ledger (ADR 0036).
- Analytics live Shopify API vs DB — resolved: DB-only via **Shopify order mirror**; channel toggle; gap lines = **Others**. ADR: `docs/adr/0006-analytics-db-channel-facts.md`. Superseded 2026-10-29: Analytics reads this site's **Sales** only, dated by Stripe (ADR 0036). On-hand inventory value KPIs → **Costings** (as-of-now).
- Mpillow/Mbolster “Stripe API issue” on deploy — resolved: missing **`STRIPE_SECRET_KEY`** on the deployed Vercel env (localhost had it). Operator fixed env; **no code slice** in this PRD for that failure. Still remove bolster **cover** preference requirement as a separate customise correctness slice.
- "media" / landing slot images vs **Media Asset** — slot overrides and slide-in config paths are consumers; the library record is the **Media Asset**. Hybrid refs: new attachments prefer Asset id; legacy URL strings still count toward **Used**.
- “TL;DR” / key takeaways vs **Answer lede** — resolved: same pattern; industry synonym only, no second UI.
- “FAQ” alone is ambiguous — resolved: **Global FAQ** = `/faq` catalog; **Page FAQ** = per-**FAQ surface** embed. Independent catalogs in v1.
- Marketing “ambassador” was overloaded — resolved: **Consumer ambassador** (home/Skyjin & Piggie) vs **Local Ambassador (clinical)** (`/our-partners`).
- Single “Elusive Sleeper” persona vs roadmap trio — resolved: Elusive Sleeper is the shared pain pattern; canonical audiences are **Affluent Wellness / Pain Sufferer**, **Tech Neck professional**, **Multi-generational family**.
- “How did you hear about us?” / referral / lead source — resolved: domain term is **Discovery source** (not referral; avoids partner/voucher collision). Forms settings edit option lists only — not a customization-steps CMS.
- Traffic “from” vs “how did you hear” — resolved: **Entry source** (machine, **Visit** start) ≠ **Discovery source** (self-reported on **Result**).
- Anonymous browser vs shopper account — resolved: **Visitor** until deterministic merge to email/**Customer**; **Prospect** = **Visitor** with no paid **Order**. No “Customer journey” label (collides with **Appointment**). ADR: `docs/adr/0007-first-party-journey-analytics.md`. One tab is the exception by the owner's choice (2026-11-15): the Customer page's **Journey** tab, which shows the **Customer timeline** as **Chapters**; the concept keeps its name.
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
