# Slice 01 — Spatial placements: schema + core lib + template API round-trip

Type: AFK
Parent: PRD `staff-assist-spatial-fillings` (`.claude/PRD-staff-assist-spatial-fillings/staff-assist-spatial-fillings-prd.md`)
Triage: needs-triage
User stories covered: 8, 9, 25, 26, 31 (foundations)

## What to build

Thin end-to-end path: a **Filling Template** can persist and return spatial **Placements**, with the flat pack list derived — per ADR 0008.

- Migrations: pillow placement rows (`template × section × sub_section × slot(1–5) × item_id`, qty always 1), Mbolster's own placement schema (single compartment, no cap), and matching **Result** snapshot tables (copy shape, not FK-only)
- Pure lib `lib/spatial-fillings/`: cell address validation (Section `left|center|right`, sub-section `front|middle|back`), max-5-per-cell cap, inventory-linked-only guard, flatten → pack list (`item_id × count`), exact-match test against a catalog template, snapshot fingerprint hash
- Template GET/PUT API reads/writes placements; templates without placements stay valid legacy-flat (pack list falls back to `bom_template_lines`); no big-bang migration
- Vitest for the pure lib (prior art: `lib/filling-templates/__tests__/`)

## Acceptance criteria

- [ ] A filling template can round-trip nine cells of placements through the API, same item repeated up to 5× in one cell
- [ ] 6th piece in a cell and non-inventory items are rejected
- [ ] Pack list is derived from placements when present, legacy flat lines otherwise — never independently editable
- [ ] Warehouse (`role = warehouse`) templates still reject filling lines (ADR 0003 unchanged)
- [ ] Fingerprint is stable across placement orderings that are semantically identical, different across different mixes

## Blocked by

None — can start immediately.
