# PRD: Staff assist mode, spatial fillings & x-ray editor

Status: Draft (needs-triage)
Source: Grill-with-docs session Jul 19 2026 (Your Custom Mpillow usability/visual redesign)
ADRs: `docs/adr/0008-spatial-filling-placements.md` (placements = where; pack list derived), `docs/adr/0009-xray-filling-visuals.md` (visual guardrails), `docs/adr/0003-fillings-only-in-filling-templates.md` (warehouse stays non-filling), `docs/adr/0005-pre-order-authorization-hold.md` (Pre-order; waiting copy amended)
Glossary: `CONTEXT.md` — **Staff assist mode**, **Section**, **sub-section**, **cell**, **Placement**, **Filling Template**, **Filling configuration**, **Unpromoted configuration**, **Promote**, **X-ray filling editor**, **Filling visual**, **Product Builder**, **Configure product page**, **Filling Config tab**, **Default Filling Template**, **Customer preference**, **Add-on**, **Result**, **Pre-order**

## Problem Statement

In-store customisation happens on a shared device, but the "Your Custom Mpillow" preview offers no way for Staff to adjust the build with the customer on the spot: fillings are invisible, size×tier is fixed by the recommendation, and the only filling controls live in the Admin Panel after the hold. Fillings are also modeled as a flat item×qty list, while the physical Mpillow is built spatially — three Sections (left/center/right), each with front/middle/back sub-sections — so neither Staff nor production records capture *where* pieces go. Cover/case pickers are text-only (no visual of the actual product on the silhouette), add-ons are name+price rows with no imagery, and popular in-store mixes are lost because nothing tracks which configurations get used.

## Solution

1. **Staff assist mode** on the customisation previews (`/mp-config`, `/mp-basic`, `/mbolster-config`): when a **Staff** session is signed in on the shared in-store device, the left column gains an **X-ray filling editor** (hover the pillow's three **Sections**, click to dive into **sub-sections**, place inventory filling pieces) plus a size×**tier** control. The right column keeps the unchanged shopper inputs. Guests see today's flow untouched.
2. **Spatial filling model**: Mpillow recipes become nine **cells** (**Section** × **sub-section**), each holding up to 5 inventory-linked pieces. **Placement** rows are the "where" source of truth; the flat pack list, stock, and COGS are always derived. Mbolster gets its own schema (one long compartment, no cap in v1).
3. **Template lifecycle**: assist loads and mutates size-scoped **Filling Templates** for the live session; catalog create/**Promote** stays in the Admin Panel. Every used **Filling configuration** is snapshotted on the **Result** and fingerprinted; the **Filling Config tab** ranks **Unpromoted configurations** per product card and size for one-click **Promote**.
4. **Product Builder** (new Admin Panel page under Landing Site): map cover/case **Items** to **Media Asset** overlays shown on the silhouette, and edit **Filling visual** colors. Add-ons become image cards (image from the **Item**'s primary Media Asset), with selected add-ons previewed under the pillow.
5. **Configure product page**: product cards open a full breadcrumbed page (replacing the slide-in drawer), hosting the Product tab, the spatial Filling Config editor, and the unpromoted ranking.

## User Stories

### Staff assist mode (in-store)

1. As in-store Staff, I want configuration controls to appear on the "Your Custom Mpillow" page when I am signed in, so that I can help the customer change the build on the spot.
2. As in-store Staff, I want the whole session to run on my shared device without a separate customer sign-in, so that in-store customisation stays simple.
3. As a guest shopper, I want the preview unchanged when no Staff session exists, so that the normal online flow is unaffected.
4. As in-store Staff, I want to change size×tier on the preview, so that the recommendation can be corrected live during fitting.
5. As in-store Staff, when I change size×tier, I want current placements cleared only after a confirm dialog and the new size's **Default Filling Template** loaded as the starting mix, so that I never lose work accidentally and mixes always match the size.
6. As in-store Staff, when I change size, I want size-dependent cover/case/add-on selections re-checked — auto-cleared when the Item is not offered for that size, kept with out-of-stock/**Pre-order** signals when offered but stock is 0 — so that no silently invalid selection reaches the hold.
7. As in-store Staff, I want to load any active size-scoped **Filling Template** into the session, so that I can start from a known mix instead of scratch.
8. As in-store Staff, I want to add and remove filling pieces per **cell** (starting at one slot, up to 5), so that I can fine-tune the mix per sub-section.
9. As in-store Staff, I want every piece chosen from inventory filling **Items** only, so that each build maps to real stock.
10. As in-store Staff, I want the session mix written to the **Result** as a full spatial snapshot at hold create, so that production sees exactly what we agreed in-store.
11. As in-store Staff, I must not be able to create or promote catalog **Filling Templates** from the configurator, so that the catalog stays curated in the Admin Panel.

### X-ray filling editor

12. As in-store Staff, I want an x-ray view of the pillow showing the fillings inside the silhouette, so that the customer sees what they are buying.
13. As in-store Staff, I want hovering the pillow to highlight the three **Sections**, so that the editable regions are discoverable.
14. As in-store Staff, I want clicking a **Section** to dive into its **sub-sections**, so that I can edit specific cells.
15. As a shopper, I want filling shapes that look fluid and conform to the pillow silhouette with no boxy cropping edges, so that the visual feels designed, not broken.
16. As a shopper, I want multiple pieces in one cell to render compressed but individually distinct (two pouches read as two), so that I can count what is inside.
17. As in-store Staff, I want identical placements to always render identically, so that I can compare the x-ray against the physical build.
18. As in-store Staff, I want smooth shape morphs when a filling type is swapped, so that the in-store demo feels polished.

### Result snapshot & records

19. As an operator, I want guest **Results** to carry a null filling snapshot until I assign, so that "fillings not yet chosen" is explicit.
20. As an operator, I want `filling_template_id` kept only while the snapshot exactly matches the catalog template — cleared immediately on any diverging edit — so that "matches template X" claims are never stale.
21. As an operator, I want post-hold filling revisions to happen on the Admin Panel **Result** page (upgraded to the spatial editor), so that changes flow through the existing review path the shopper then Accepts or Declines.
22. As a Customer, I want to review the final build and Accept or Decline it, so that I stay in control of the purchase.
23. As the business, I want the **Filling configuration** snapshot retained on both Accept and Decline, so that records and analytics keep every used mix.
24. As the business, I want Stripe capture to happen only on Accept (when a hold exists) and never on Decline, so that money handling is unchanged.
25. As warehouse staff, I want a derived flat pack list (item × count) from the snapshot, so that I know what fillings to pull.
26. As warehouse staff, I want the spatial placement breakdown, so that I know where each piece goes in the build.
27. As the business, I want stock committed from the flattened snapshot when the order is approved, so that inventory stays in sync with what was actually built.

### Filling analytics & Promote

28. As an operator, I want every used **Filling configuration** fingerprinted and counted, so that popular in-store mixes surface as data.
29. As an operator, I want a ranked **Unpromoted configuration** list segmented per product card and size inside the **Filling Config tab**, so that I can prioritise the most-used mixes.
30. As an operator, I want a **Promote** action that turns an unpromoted configuration into a named catalog **Filling Template** in place, so that winners become permanent templates.
31. As an operator, I want to create and edit templates spatially in Configure (nine cells, per-cell pieces, derived BOM view), so that catalog recipes carry placement information.

### Configure & Product Builder

32. As an operator, I want product cards in Configure to open a full page with breadcrumbs instead of a slide-in drawer, so that deep editing has room and navigation context.
33. As an operator, I want a **Product Builder** page under Landing Site, so that configurator presentation config has one home.
34. As an operator, I want to link cover/case **Items** to overlay **Media Assets** (with optional fit) in Product Builder, so that the preview shows the real product on the silhouette.
35. As a shopper, I want choosing a different cover/case to immediately swap the linked overlay on the pillow visual, so that my choice is visible.
36. As an operator, I want to view the filling-type → shape/color mapping and edit the **color** per filling Item in Product Builder, so that x-ray colors stay on brand without a deploy.
37. As the business, I want filling shape defaults to live in a code config map, so that shapes cannot be misconfigured in store.

### Add-ons

38. As a shopper, I want add-on options shown as smaller cards with product images, so that I can see what each add-on looks like.
39. As a shopper, I want images of my *selected* add-ons to appear on the left under the pillow, so that I see they are part of my build.
40. As a mobile shopper, I want those selected add-on previews stacked vertically, so that the layout stays usable.

### Scope extensions

41. As in-store Staff, I want the same assist mode and x-ray effect on **Mbolster** (one long compartment, own schema, no piece cap in v1), so that bolster fittings work the same way.
42. As in-store Staff, I want assist to work identically on `/mp-basic`, so that Basic-tier fittings use the same surface.
43. As a shopper hitting **Pre-order**, I want the waiting copy to say Staff will reach out shortly via WhatsApp, so that expectations are set without a fake ETA. *(Already shipped during the grill: `preOrderWaitingCopy` + self-check updated.)*

## Implementation Decisions

### Domain & data model

- **Section** = `left | center | right`; **sub-section** = `front | middle | back` (ids match the existing LLM model API — `front`, not `top`; LLM integration itself is out of scope). Section × sub-section = nine **cells** on Mpillow.
- A **cell** holds an ordered list of pieces; each persisted row is one piece (qty 1); the same Item may repeat; **max 5 pieces per cell** (v1 cap); empty cells allowed; UI starts at one slot and adds.
- **Placement** rows (template placements table + a matching Result snapshot copy) are the sole "where" truth. The flat pack list / stock / COGS view is always **derived** by flattening `item_id` counts across cells — never a second editable filling BOM. **Warehouse templates stay non-filling** (ADR 0003/0008).
- **Mbolster has its own spatial schema**: single long compartment, **no piece cap** in v1, no reuse of the Mpillow enums. Same inventory Items; same derived-pack-list rule.
- Legacy flat `bom_template_lines` on `role = filling` templates remain valid until a template is first edited spatially; the pack list falls back to flat lines when no placements exist. No big-bang data migration.
- Every filling line references an inventory **Item** — no free-text shapes.
- Fillings continue to affect COGS/fulfillment only, never sell price.

### Snapshot lifecycle

- **Result** stores a full spatial **Filling configuration** snapshot: written at hold create when Staff assist supplied a mix; null for guest holds until Admin Panel assign writes it.
- Optional `filling_template_id` stored only while the snapshot exactly matches the catalog template; any diverging edit clears it immediately.
- Post-hold edits happen only in the Admin Panel (no Result-reopen assist in v1). Accept and Decline both retain the snapshot for records; Stripe capture only on Accept. Money path unchanged: hold → Result → assign → Accept → capture → Order.
- Changing assigned size×tier (assist or assign) clears placements (confirm dialog in assist) and loads the new product card's **Default Filling Template** as the starting mix.

### Staff assist mode

- Gate = existing **Staff** check (`admin_users` / bootstrap allowlist) on the same storefront session; no separate login, no co-browse, no multi-device sync.
- Applies to `/mp-config`, `/mp-basic`, and `/mbolster-config` (one shared preview surface; tier/product only scopes what loads).
- Layout: **left** = silhouette + cover/case overlay + selected add-on preview images + x-ray editor (+ size×tier control); **right** = unchanged shopper inputs (cover, case, add-on selection, contact, discovery source, shipping, hold CTA). Add-on *selection* never moves left.
- Size-change eligibility rule: not offered for new size → auto-clear; offered but stock 0 → keep with existing out-of-stock/**Pre-order** signals.

### X-ray filling editor (ADR 0009 guardrails are binding)

- Layered interactive SVG from the designer's export: silhouette path + per-cell boundary paths become `clipPath` regions; nested clipping (silhouette ∩ cell) makes shapes conform — **never rect/bounding-box crops**.
- One fluid path asset per filling type, inlined and tagged by item subtype, colored via CSS variables.
- Deterministic slot layout for 1–5 pieces per cell; compression keeps each piece's outline distinct (gooey merge rejected as default).
- `flubber` is the **only new dependency** (installed when the editor slice is built) for prepared path morphs; fall back to crossfade on degenerate pairs; target 60fps on a mid-range tablet. Hover/dive transitions via already-installed `framer-motion`/`gsap`. No WebGL, no physics engine, no generated blobs in v1.
- Hover highlights the three Sections; click dives into a Section's sub-sections for editing. Guests never see the editor.

### Analytics & Promote

- Fingerprint = normalized hash of the spatial snapshot; recorded whenever a snapshot is written.
- Ranked **Unpromoted configuration** list lives inside Configure → **Filling Config tab**, segmented per product card and size (same scope as the promote target). **Promote** creates a named catalog template in place. No separate Analytics surface in v1.

### Configure & Product Builder

- Configure product cards open a full **Configure product page** with breadcrumbs (e.g. Configure / Premium Mpillow / Size M), replacing the drawer; hosts Product tab + spatial Filling Config tab + ranking.
- **Product Builder** is a new Admin Panel page under Landing Site: maps cover/case Items → overlay **Media Assets** (+ optional fit transform), and exposes the **Filling visual** mapping with editable color. Shape defaults stay in a code config map (option C: code now, migrate shape editing only if churn demands). Assets come from the existing **Media Asset Library** — no parallel upload silo.
- Add-on card images come from the **Item**'s primary Media Asset (needs an item → media link), not Product Builder.

## Testing Decisions

- Tests assert **external behavior** (inputs → outputs, persisted rows, rendered signals), never implementation internals.
- Per the ponytail rule, every non-trivial module leaves one runnable check. Prior art: vitest suites in `lib/filling-templates/__tests__/` and `lib/results/__tests__/`; `*.check.ts` self-checks like `lib/configurator/pre-order-trigger.check.ts` (run via `npx tsx`).
- Modules that get vitest coverage: spatial fillings core (cell validation, cap, flatten, exact-match, fingerprint), x-ray layout engine (deterministic slots), snapshot lifecycle (write timing, divergence clearing, Accept/Decline retention), unpromoted ranking + Promote, size-change eligibility rules.
- Wiring (assist gating, SVG mounting, Product Builder page, Configure page routing) gets `*.check.ts` self-checks asserting mount points, gating, and API contracts.

## Out of Scope

- LLM model API integration for filling recommendations (ids aligned — `front` — but no LLM work now).
- Shopper-facing filling editing: guests never edit fillings; assist is Staff-only.
- Result-reopen assist after hold (post-hold edits stay in the Admin Panel).
- "Save as template" from the configurator; template create/Promote is Admin Panel only.
- Numeric Pre-order ETA or per-SKU wait estimates; WhatsApp *automation* (copy promises manual outreach; restock notice stays email).
- WebGL/3D cutaway, physics engines, generated blob shapes, gooey-merged rendering.
- Bolster sub-section anatomy beyond one compartment; bolster piece caps.
- Editing filling *shapes* in Product Builder (colors only in v1).
- Changes to landing pages, page builder, or `landing_sections`.
- A separate ops queue for Pre-order; changes to hold/capture money mechanics.

## Further Notes

- Brand language: **Mpillow** / **Mbolster** in all UI copy; "admin" in product copy is **Staff**.
- The designer-exported SVG (silhouette + 9 cell boundary paths + per-filling fluid shapes) is a prerequisite asset for the x-ray slices; the section mockups from the grill session are the reference (`~/.cursor/projects/Volumes-Crucial-SSD-2TB-Projects-mp/assets/image-b4ddd1cf…png`, `image-1a9a0539…png`, `image-d18e24b1…png`).
- The **Rules Engine** PRD (`.claude/PRD-rules-engine/`) builds on this PRD: soft dependency on slice 01 (Template outputs reference Filling Templates, legacy-flat or spatial), hard dependency on slice 07 only for its read-only x-ray preview upgrade. Product Builder (slice 10) hosts its entry point. Recommendation records never alter this PRD's snapshot lifecycle.
- Pre-order WhatsApp waiting copy already shipped during the grill session (code + self-check verified) — recorded here for completeness, not a slice.
