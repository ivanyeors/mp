# Fillings live only in Filling Templates

Non-filling **Composed sellable** recipes and **Warehouse templates** must never carry filling lines. All fillings — defaults, catalogs, and operator-confirmed mixes — live exclusively in **Filling Templates** (`bom_templates.role = 'filling'`), persisted in the database and synced on every Configure save.

## Context

Configure previously let operators edit raw filling quantities on the composed sellable BOM and in warehouse presets, while the sale path already assembled builds from a separately assigned **Filling Template**. That duplicated fillings in two places: warehouse/logistics planning could disagree with what `build-assembly` actually sold and fulfilled. Operators also needed per-product-card **Default Filling Templates** as assignment hints without auto-selecting them.

## Decision

1. **Single source of truth:** Fillings exist only in Filling Templates. Composed sellable BOMs (`bom_lines`, `bolster_bom_lines`) and warehouse templates (`role = warehouse`) are non-filling only. Saves and Apply strip or reject filling-category lines.
2. **Per product card default:** Each composed sellable (pillow size×**tier**, bolster **length**) stores a nullable `default_filling_template_id` pointing at an active filling template for that product type and size/length. Assignment shows the default as a hint; the operator must actively confirm a template (dropdown starts empty).
3. **Configure UX:** Each product drawer uses **Product** and **Filling Config** tabs. Filling Config manages the size-scoped catalog; Product tab sets the default. The standalone page-level Filling Templates section is removed.
4. **Migration:** Legacy filling rows on composed sellables are seeded into active templates named `{size} - {tier} - default` (pillow) or `{length} - default` (bolster), set as defaults, then deleted from live BOMs.
5. **Assign UX:** Two sections — **Product** (non-filling, read-only) and **Filling mix** (hint, dropdown, variant/qty preview). Changing size×tier or length clears the filling pick and reloads the hint.

## Consequences

- Warehouse Apply and composed sellable saves can no longer push filling qty changes; ops edits mixes only in Filling Config.
- `build-assembly` already ignores composed BOM fillings when a template is supplied — behavior unchanged, data model now matches.
- Assign remains blocked until a filling template is explicitly selected; defaults reduce guesswork but do not skip confirmation.
- All template CRUD (warehouse and filling) continues through existing `bom_templates` / `bom_template_lines` APIs — no parallel store.

## Considered options

- **Keep fillings on warehouse BOM for stock tracking** — rejected; duplicates sale-path truth and confuses operators.
- **Auto-apply default at assign** — rejected; operators often customise mixes and must confirm consciously.
- **One default per size (shared across tiers)** — rejected; Basic and Premium may need different baseline mixes.
