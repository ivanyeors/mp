# Spatial filling placements; pack list derived

**Mpillow** filling recipes are spatial: each piece belongs to a **Section** (`left` | `center` | `right`) × **sub-section** (`front` | `middle` | `back`) × slot (1–5). Persist that as dedicated **Placement** rows (e.g. `filling_template_placements` and a matching **Result** snapshot). **Mbolster** uses its own spatial schema (single long compartment, no piece cap in v1) — do not reuse the Mpillow enums; the derived-pack-list rule below applies to both. Stock, COGS, and “what to pack” are always a **derived** flatten of those rows (`item_id` counts) — never a second editable filling BOM. **Warehouse templates** stay non-filling (ADR 0003); do not put fillings back on warehouse BOMs to express the pack list.

## Considered options

- **Extend `bom_template_lines`** with spatial columns — rejected for filling recipes because today’s PK `(template_id, item_id)` cannot store repeated pieces or the same item in two cells without a breaking uniqueness change that also risks warehouse/non-filling upserts.
- **JSONB 3×3 blob on the template** — rejected; weak for max-5 enforcement, analytics fingerprints, and **Promote** of **Unpromoted configurations**.
- **Warehouse BOM = “what to pack”, customisation template = “where”** as two editable filling sources — rejected; duplicates truth and reopens the ADR 0003 failure mode. Pack list is a projection of placements only.

## Consequences

- Catalog **Filling Template** create/**Promote** stays in the **Admin Panel**; **Staff assist mode** mutates a live **Filling configuration** and may snapshot placements at hold create.
- Build-assembly and inventory commit sum placement rows; UI may show both the spatial editor and a read-only pack list.
- Legacy flat `bom_template_lines` on `role = filling` templates need a migration path into placements (and a derived pack view thereafter).

## Amendment (2026-09-25, X-ray pillow UX slice 09)

"No piece cap in v1" for **Mbolster** stands as a schema statement and is retired as a product one: the cap is **physical and derived**. `fitBolster` (ADR 0019) settles the pouches into the capsule's empty ends and judges Σ widths + seams against the registry length and each pouch's thickness against the diameter, on every read, never stored. An add the bolster cannot fit even fully squeezed is refused with the numbers; a compressed pack is a working state with an amber ring; a save that carries a pack that cannot fit confirms once and never blocks. No slot number is introduced: `validateBolsterPlacements` stays uncapped, the bolster tables are unchanged, and the pack list remains the derived flatten of the rows.
