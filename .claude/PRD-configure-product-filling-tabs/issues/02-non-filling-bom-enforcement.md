# Slice 02 — Non-filling-only warehouse + composed BOM enforcement

Type: AFK
Parent: PRD `configure-product-filling-tabs` (`.claude/PRD-configure-product-filling-tabs/configure-product-filling-tabs-prd.md`)
Triage: needs-triage
User stories covered: 7, 8, 9, 30

## What to build

Enforce ADR 0003 at every write path: fillings never persist on composed sellable BOMs or warehouse templates.

- **`bom-sanitizer`** (or inline in routes): `stripFillingLines(lines, categories)` — pure helper.
- Templates API: **warehouse** POST/PUT returns 400 if any line item category is `filling`.
- Templates **Apply** route: strip filling lines before upserting to `bom_lines` / `bolster_bom_lines` (defense in depth).
- Configure **save** paths (`persistProductBom`, bolster save): strip filling lines before DB upsert.
- Filling template (`role=filling`) validation unchanged.

## Acceptance criteria

- [ ] Saving a warehouse template with a filling line is rejected with a clear error.
- [ ] Saving a composed sellable BOM silently drops (or rejects) filling lines — no filling rows written to `bom_lines` / `bolster_bom_lines`.
- [ ] Apply of a legacy warehouse template that still contains filling lines does not write fillings to live BOM.
- [ ] Filling template save still accepts filling-only lines.
- [ ] `build-assembly` regression test: composed BOM with stray fillings + assigned template → output fillings only from template.
- [ ] Module/route behavior tests (not UI).

## Blocked by

- Slice 01 (schema + vocabulary stable)
