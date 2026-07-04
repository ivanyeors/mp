# PRD: Configure Product / Filling Config Tabs, Default Filling Templates, Assign Preview

Status: Draft (needs-triage)
Source: Grill-with-docs session (Jul 2026) + ADR `docs/adr/0003-fillings-only-in-filling-templates.md`

## Problem Statement

Configure today mixes three concerns on one page and inside each product drawer:

- **Composed sellable** BOM editing includes a raw **Fillings** section (item + qty) that the sale path ignores once a **Filling Template** is assigned.
- **Filling Templates** live in a separate bottom section, forcing operators to re-select product type and size after already opening a product card.
- **Warehouse templates** can still include filling lines, creating a second fillings source that does not match what `build-assembly` sells or what inventory should deduct.
- There is no per-product-card **Default Filling Template**; operators get no structured hint at assignment beyond an empty dropdown.
- The assignment screen does not preview the **complete product** (non-filling recipe + filling mix) in a way that supports quick operator confirmation.

Operators need one place per product card to maintain the non-filling recipe and the filling catalog, with defaults stored in the database, and an assignment workflow that surfaces both halves before they confirm.

## Solution

From the operator's perspective:

1. Opening any product card in **Configure** (e.g. Basic Size S, Premium Size M, Bolster medium) shows two tabs: **Product** (non-filling BOM + default filling picker) and **Filling Config** (filling-only catalog for that product type and size/length only).
2. **Fillings never appear** on the Product tab or in warehouse templates. All filling mixes are created, edited, activated, and stored as **Filling Templates** in the database (`bom_templates` + `bom_template_lines`).
3. Each product card stores its own **Default Filling Template** in the database. At assignment, the UI shows that default as a hint with a variant/qty preview, but the operator must actively select a template before Save.
4. The assignment screen shows two sections — **Product** (non-filling lines for the chosen size×tier or length) and **Filling mix** (hint, dropdown, preview). Changing size, tier, or length clears the filling selection and reloads both sections.
5. Legacy filling rows on composed sellables are migrated into seeded templates (`S - basic - default`, etc.), set as defaults, then removed from live BOMs.

## User Stories

1. As an operator, I want each product card in Configure to have **Product** and **Filling Config** tabs, so that I configure a sellable in one place without scrolling to a separate page section.
2. As an operator, I want the **Filling Config** tab to show only mixes for that product type and size/length, so that bolster drawers never show pillow mixes and vice versa.
3. As an operator, I want the **Product** tab to edit only non-filling lines (cover, case, protector, packaging, etc.), so that fillings have a single source of truth.
4. As an operator, I want to pick a **Default Filling Template** on each product card (Basic Size S separate from Premium Size S), so that each sellable has a baseline mix stored in the database.
5. As an operator, I want every Filling Template save to persist to the database immediately, so that catalog changes are never lost and assignment always reads current data.
6. As an operator, I want to create, rename, activate, and deactivate multiple filling mixes per size, so that I can offer soft/firm/clinical variants without editing code.
7. As an operator, I want warehouse templates to exclude fillings, so that Apply never duplicates filling qty alongside Filling Templates.
8. As an operator, I want saving a warehouse template with filling lines to be rejected, so that mistakes are caught at save time.
9. As an operator, I want Apply-to-active-BOM to update only non-filling lines, so that warehouse presets and filling catalogs stay independent.
10. As an operator assigning a **Result**, I want a **Product** section showing non-filling lines for the selected size×tier or length, so that I see protector/packaging context before confirming.
11. As an operator assigning a **Result**, I want a **Filling mix** section with variant and qty preview, so that I can verify the mix quickly without opening Configure.
12. As an operator assigning a **Result**, I want the suggested default filling mix shown as a hint when size×tier or length is selected, so that I know the baseline without it being auto-selected.
13. As an operator assigning a **Result**, I must actively select a filling template before Save, so that every order has an explicit operator confirmation.
14. As an operator assigning a **Result**, I want the filling dropdown to clear when I change size, tier, or length, so that I never accidentally keep a wrong-size mix.
15. As an operator assigning a **Result**, I want both Product and Filling sections to update when size or tier changes, so that the preview always matches the composed sellable I am confirming.
16. As inventory ops, I want sold builds to use only the operator-confirmed **Filling Template** plus non-filling composed lines, so that COGS and inventory deduction add up correctly for logistics.
17. As inventory ops, I want legacy filling rows migrated into Filling Templates and removed from composed BOMs, so that existing recipes are not lost during the transition.
18. As inventory ops, I want migrated templates named `{size} - {tier} - default` (pillow) or `{length} - default` (bolster) and active immediately, so that assignment keeps working after deploy.
19. As a customer, I still do not pick fillings during customisation, so that clinical decisions stay with operators.
20. As a developer, I want an ADR recording the fillings-only-in-templates split, so that future changes do not reintroduce duplicate filling sources.
21. As a developer, I want deep modules for default validation and filling preview formatting, so that Configure and assign UIs share one tested rules layer.
22. As finance/ops, I want filling choices to affect COGS/fulfillment only, not MSRP, so that pricing stays in Costings.
23. As an operator, I want the old standalone **Filling Templates** section at the bottom of Configure removed, so that the page matches the per-product drawer model.
24. As an operator, I want saving the Product tab to persist both non-filling BOM lines and the default filling template id to the database, so that card state is always durable.
25. As an operator, I want saving a Filling Config mix to persist template name, notes, active flag, and lines to the database, so that the catalog is authoritative.
26. As an operator on bolster Configure, I want the same tab model and default behavior per length (short/medium/long), so that bolster ops match pillow ops.
27. As an operator, I want inactive filling templates hidden from the assignment dropdown, so that retired mixes cannot be sold.
28. As an operator, I want the default hint to show "No default configured" when a product card has no default, so that I know Configure needs attention.
29. As a developer, I want assignment APIs to return enough data for Product and Filling previews without extra round-trips, so that the assign screen stays responsive.
30. As inventory ops, I want `build-assembly` to continue ignoring any stray filling rows left on composed BOMs after migration, so that the sale path is safe during rollout.

## Implementation Decisions

### ADR

- **`docs/adr/0003-fillings-only-in-filling-templates.md`** — accepted; governs this PRD.

### Domain language

- Use terms from root `CONTEXT.md`: **Composed sellable**, **Filling Template**, **Default Filling Template**, **Warehouse template**, **Product tab**, **Filling Config tab**, **Complete product** (at assign).
- Update `CONTEXT.md` as part of delivery (partially done in grill session).

### Schema

- Add `default_filling_template_id` (nullable FK → `bom_templates.id`, `ON DELETE SET NULL`) to `pillow_products`.
- Add `bolster_length_config` (or equivalent) keyed by bolster length (`short` | `medium` | `long`) with `default_filling_template_id` — bolsters have no `pillow_products` row today.
- FK must reference `bom_templates` where `role = 'filling'`, with matching `kind` + `key` (enforced in application layer; optional DB check constraint if practical).
- No change to `bom_templates` / `bom_template_lines` shape — all template saves continue there.

### Deep modules (small surface, testable)

| Module | Responsibility |
|--------|----------------|
| **`filling-templates`** (extend) | Existing validate + filter; add `validateDefaultFillingTemplate(template, productCard)` — role, kind, key, active |
| **`filling-preview`** (new) | Given template lines + item metadata, return compact `{ variant, qty }[]` for UI; pure, no I/O |
| **`composed-sellable`** (extend) | Load composed sellable + `default_filling_template_id` for a product card key |
| **`build-assembly`** (unchanged) | Already strips composed fillings when template supplied; add regression test post-migration |
| **`bom-sanitizer`** (new, optional) | `stripFillingLines(lines)` used by save/apply paths — single place for non-filling enforcement |

Prefer extending `filling-templates` over scattering validation in route handlers.

### Configure UI

- Refactor `Configure` product drawers (pillow basic, pillow premium, bolster) to **Sheet** with tabs: **Product** | **Filling Config**.
- **Product tab:** existing non-filling editors (remove `Fillings` `DynamicPartSection`); warehouse template load/save/apply (non-filling only); **Default Filling Template** dropdown scoped to this card's size/length catalog.
- **Filling Config tab:** move catalog CRUD from page-bottom section; scoped to drawer product type + size/length; all operations via existing templates API (`role=filling`).
- Remove standalone **Filling Templates** section from page bottom.
- Every save (product BOM, default id, template create/update/delete) writes to Supabase via existing API routes — no local-only state as source of truth.

### Templates API

- **Warehouse** (`role=warehouse`): reject lines where item category is `filling` on POST/PUT.
- **Filling** (`role=filling`): unchanged — filling-only validation already exists.
- **Composed sellable save** (`configure/save`, `persistProductBom`): strip filling lines before upsert to `bom_lines` / `bolster_bom_lines`.
- **Apply** (`templates/apply`): strip filling lines from template payload before writing live BOM (defense in depth).
- **New/extended endpoints** as needed: read/write `default_filling_template_id` per product card (may be part of existing save payload).

### Assign UI (`settings/results/[id]`)

- Two collapsible sections after size×tier/length pickers:
  - **Product:** non-filling BOM lines from `loadComposedSellable` (read-only summary).
  - **Filling mix:** default hint (name + `filling-preview` lines), empty dropdown, preview updates on selection.
- On size/tier/length change: clear `fillingTemplateId`, reload catalog + default hint + product section.
- Save assignment unchanged in lifecycle rules — still requires explicit `fillingTemplateId`.
- Optional: lightweight API addition returning default template id + preview for assigned product card key.

### Migration (C then A)

1. For each active `pillow_products` row with filling lines in `bom_lines`: create `bom_templates` row `role=filling`, `kind=pillow`, `key=size`, name `{size} - {tier} - default`, copy filling lines to `bom_template_lines`, set `default_filling_template_id`, mark active.
2. For each bolster length with filling lines in `bolster_bom_lines`: create template named `{length} - default`, set default on `bolster_length_config`.
3. Delete all `bom_lines` / `bolster_bom_lines` rows where item category is `filling`.
4. Idempotent migration script preferred (skip if template name already exists for kind+key).

### Out of scope for this PRD

- Auto-applying default at assign (operator must confirm).
- Customer-facing filling pickers.
- Changing MSRP / Costings pricing rules.
- LLM `proposed_filling_template_id` integration.
- Stock reservation on hold.
- mp-maker legacy path changes.
- Configure readiness badges / hard gates when default is missing.

## Testing Decisions

**What makes a good test here:** assert externally visible behavior — API reject/accept, DB state after save, preview output shape, assign gating — not React component internals.

| Module | Test | Prior art |
|--------|------|-----------|
| `filling-templates` | `validateDefaultFillingTemplate` accepts/rejects wrong kind/key/role/inactive | `lib/filling-templates` existing tests |
| `filling-preview` | variant+qty formatting from lines + items | `lib/build-assembly/__tests__` |
| `bom-sanitizer` / save paths | warehouse save rejects fillings; composed save strips fillings | `lib/results/__tests__/slice-12-no-hardcoded-fillings.test.ts` |
| Migration | after migrate, no filling category in `bom_lines`; defaults set | migration smoke test or script self-check |
| `build-assembly` | composed BOM with stray fillings + template → only template fillings in output | `lib/build-assembly/__tests__/build-assembly.test.ts` |
| Assign lifecycle | still requires explicit template id | `lib/result-lifecycle/__tests__/slice-06-assign.test.ts` |

**UI tests:** not required for v1; API/module tests prove rules. Manual test plan on Configure tabs + assign preview in slice 06.

## Further Notes

- This PRD **supersedes the UX half** of slice 02's "bottom section" Filling Templates layout; slice 02's data model (`role=filling`) remains valid.
- Slice 12 (retire hardcoded fillings) is done; this work completes the **Configure/warehouse** side of the same architectural split.
- Premium pillow **linen/fibrecool** warehouse variant scoping is unchanged; default filling remains per size×tier (not per linen/fibrecool).
- All template and default persistence must go through Supabase (existing admin client + API routes) — no `localStorage` as authoritative store for templates (bolster localStorage cache may be removed as part of sync hardening).
