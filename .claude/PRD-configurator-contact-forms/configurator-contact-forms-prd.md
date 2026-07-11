# PRD: Configurator Contact + Discovery Source

Status: Draft (needs-triage)
Source: Grill-with-docs session (Jul 2026) + plan `configurator_contact_forms_3b914bba`

## Problem Statement

Visitors completing online customisation (Mpillow full/basic and Mbolster) authorize payment with **email and shipping only**. Ops cannot reliably call or WhatsApp them, and marketing cannot answer “how did customers find us?” from **Results**.

Operators also need to change the “how did you hear about us?” answer list without a deploy. Today every configurator question and option list is hardcoded in the wizard clients — there is no Settings surface for form option catalogs. A full step/field CMS would be overkill; the immediate need is one editable bilingual list plus required contact fields on the preview step.

## Solution

From the **visitor’s** perspective: on the preview / checkout step, before authorize or in-store save, they must provide email, mobile, and answer **“How did you hear about us?”** (Discovery source). Choosing Other requires a short free-text explanation. The contact block is clearer and consistent across pillow and bolster.

From the **operator’s** perspective: under **Landing Site → Forms**, they manage Discovery source options with en-US / zh-CN locale tabs — add, edit labels, reorder, archive. Other is always available as a fixed system option. On **Results** detail they see phone and Discovery source next to email.

From the **developer’s** perspective: a deep **Discovery source catalog** in `site_settings`, validation helpers, shared preview contact fields, Result columns + hold/in-store persistence, glossary term **Discovery source** — without building a customization-steps form builder.

## User Stories

### Domain and glossary

1. As a developer, I want **Discovery source** defined in `CONTEXT.md`, so that agents and operators do not call it “referral” (which collides with partner/voucher language).
2. As a developer, I want Discovery source kept distinct from **Customer preference** and **Add-on**, so that marketing attribution is not confused with product build choices.
3. As a developer, I want Forms settings documented as option-list editing only (not step CMS), so that scope stays honest.

### Visitor — contact capture

4. As a visitor on Mpillow full config preview, I want a required email field, so that I can receive Result / payment follow-up.
5. As a visitor on Mpillow full config preview, I want a required mobile field, so that ops can contact me by phone or WhatsApp.
6. As a visitor on Mpillow basic config preview, I want the same required email and mobile, so that basic is not a second-class path.
7. As a visitor on Mbolster config preview, I want the same required email and mobile, so that bolster purchases are reachable.
8. As a visitor entering mobile, I want Singapore-friendly validation (local 8-digit or +65), so that invalid numbers are caught before authorize.
9. As a signed-in visitor with a saved email, I want email prefilled when that already works today, so that I am not forced to retype it.
10. As a visitor who leaves email empty and tries to authorize, I want a clear field error, so that I know what to fix.
11. As a visitor who leaves mobile empty or invalid and tries to authorize, I want a clear field error, so that I am not blocked only by a toast.

### Visitor — Discovery source

12. As a visitor on preview, I want a required select labeled **“How did you hear about us?”**, so that the question is brand-level and works for pillow and bolster.
13. As a visitor, I want Discovery source options loaded from Settings (active options only), so that ops can change the list without a deploy.
14. As a visitor on a zh-CN locale route, I want option labels in zh-CN when provided, so that the select matches the rest of the page language.
15. As a visitor who has not chosen a Discovery source, I want authorize blocked with a field error, so that attribution is not skipped.
16. As a visitor who selects Other, I want a free-text field to appear, so that I can explain how I found the brand.
17. As a visitor who selects Other and leaves free text empty, I want authorize blocked, so that empty “Other” answers do not pollute analytics.
18. As a visitor who selects a non-Other option, I want the free-text field hidden or ignored, so that I am not asked for unnecessary detail.
19. As a visitor who changes from Other to another option, I want free-text validation to clear, so that errors stay accurate.

### Visitor — in-store save

20. As a visitor or staff using **Save without purchasing** on Mpillow preview, I want email, mobile, and Discovery source still required, so that in-store Results also have contact and attribution.
21. As a visitor on Mbolster, I want the same contact + Discovery source rules on authorize, so that bolster and pillow stay aligned (bolster has no separate in-store save path beyond hold).

### Visitor — UX polish (preview contact block only)

22. As a visitor on preview, I want contact fields grouped clearly (Contact vs How you found us), so that the checkout block is scannable.
23. As a visitor on mobile preview, I want comfortable spacing and labels for email, mobile, and Discovery source, so that the new fields do not feel bolted on.
24. As a visitor on Mpillow and Mbolster, I want the same contact block component, so that the two products feel consistent.
25. As a visitor on earlier wizard steps (welcome, measurements, customize), I want those steps unchanged in this PRD, so that scope stays on preview contact only.

### Operator — Forms settings

26. As a marketing operator, I want a **Forms** item under Landing Site in Settings, so that I can find form option editing next to Page Builder / FAQ.
27. As a marketing operator, I want Forms gated by page-builder permission, so that access matches other Landing Site tools.
28. As a marketing operator, I want to manage the Discovery source option list on Forms, so that I control “how did you hear about us?” answers.
29. As a marketing operator, I want en-US and zh-CN locale tabs for each option label, so that bilingual labels are editable from day one.
30. As a marketing operator, I want to add a new Discovery source option, so that new channels can be tracked without engineering.
31. As a marketing operator, I want to edit an option’s labels, so that copy can be refined.
32. As a marketing operator, I want to reorder options, so that the most common channels appear first.
33. As a marketing operator, I want to archive (soft-hide) an option, so that it stops appearing for new visitors but old Results still resolve.
34. As a marketing operator, I want Other to be a fixed system option that I cannot delete, so that free-text capture always remains available.
35. As a marketing operator, I want Other to stay last in the visitor select, so that the list reads naturally.
36. As a marketing operator, I want sensible seed defaults on first load, so that I can edit the list later rather than starting from empty.
37. As a marketing operator without page-builder permission, I want Forms denied, so that RBAC stays consistent.

### Operator — Results

38. As an ops user on Results detail, I want to see customer phone next to email, so that I can call or WhatsApp without digging in JSON.
39. As an ops user on Results detail, I want to see Discovery source (resolved label) and Other free text when present, so that attribution is visible at assignment time.
40. As an ops user on Results list, I do not require Discovery source columns in this PRD, so that list UI stays unchanged unless needed later.
41. As an analytics user, I do not require a Discovery source breakdown chart in this PRD, so that analytics can follow in a later slice.

### Persistence and APIs

42. As a developer, I want `customer_phone`, `discovery_source`, and `discovery_source_other` on the Result (`mp_config_responses`), so that contact and attribution are queryable columns.
43. As a developer, I want Authorization hold to require and persist phone + Discovery source (+ Other text when needed), so that paid online Results are complete.
44. As a developer, I want in-store save / finalize paths to require and persist the same fields, so that review-only Results match online completeness.
45. As a developer, I want Discovery source options stored in `site_settings` as structured JSON, so that we reuse the existing keyed-config pattern.
46. As a developer, I want a public read of active Discovery source options for the configurator, so that visitors do not need admin auth.
47. As a developer, I want admin GET/PUT for the Forms catalog gated by page-builder, so that Settings can mutate safely.
48. As a developer, I want submit to reject unknown or archived Discovery source ids, so that stale clients cannot write invalid attribution.
49. As a developer, I want phone normalized with the existing Singapore-friendly helper before store, so that WhatsApp and ops see E.164-ish values when possible.

### Quality

50. As a developer, I want automated checks for Discovery source catalog behavior (seed, Other lock, archive), so that settings regressions fail fast.
51. As a developer, I want automated checks for Discovery source validation (required + Other free text), so that hold/in-store rules do not drift.
52. As a QA tester, I want to verify preview authorize and in-store save on mp-config, mp-basic, and mbolster-config, so that all purchase paths collect contact + Discovery source.

## Implementation Decisions

### Approved design decisions (grill session)

| Decision | Resolution |
|----------|------------|
| Form editor scope | Option lists only — not a full customization-steps CMS |
| Field placement | Preview / checkout step (not early name step) |
| Required fields | Email, mobile, Discovery source all required |
| Other | Fixed system option; free text required when selected |
| Flows | mp-config, mp-basic, mbolster-config, and Mpillow Save without purchasing |
| Visual scope | Preview contact-block polish only |
| Question label | “How did you hear about us?” |
| Settings home | Landing Site → Forms (page-builder permission) |
| Option locales | en-US / zh-CN tabs from day one |
| Ops visibility | Results detail in this PRD; analytics later |
| Domain term | **Discovery source** (not referral) |

### Modules

| Module | Responsibility |
|--------|----------------|
| **Discovery source catalog** | Load/save bilingual option list from `site_settings`; seed defaults; enforce fixed `other`; archive vs delete; resolve id → label for admin and Results |
| **Discovery source validation** | Pure rules: required source id; if `other` then free text required (min length); reject inactive/unknown ids |
| **Forms settings (Landing Site)** | `/settings/forms` UI: locale tabs, add/edit/reorder/archive; page-builder gate |
| **Preview contact fields** | Shared UI: email, mobile, Discovery source select, conditional Other text; grouped polish |
| **Result contact persistence** | Columns on Result; hold + in-store write path; phone via existing normalize helper |
| **Results detail contact** | Staff display of phone + Discovery source (+ Other) next to email |
| **Domain glossary** | Add **Discovery source** to `CONTEXT.md` |

### Technical clarifications

1. **Stable option ids** — store `discovery_source` as the option `id` (slug), not the display label, so label edits do not break history.
2. **Archive, don’t hard-delete** — archived options are inactive for new selects; Results detail still resolves labels from the full catalog (including archived).
3. **Other is system** — id `other` (or equivalent) cannot be removed; always sorted last for visitors.
4. **Seed defaults** — ship a small starter list (e.g. Instagram, Google, Friend/family, Clinic/partner, Walk-in, Other); ops edits afterward.
5. **Phone** — reuse existing Singapore-friendly normalize; allow well-formed non-SG E.164 when the helper already does.
6. **No step CMS** — gender/age/BP and measurement steps remain code-defined; Forms only owns Discovery source options in this PRD.
7. **Shared component** — one preview contact block used by Mpillow and Mbolster clients to avoid drift.

### Schema / API

- Migration on `mp_config_responses`: `customer_phone text`, `discovery_source text`, `discovery_source_other text`.
- `site_settings` key holding Discovery source catalog JSON: ordered options with `id`, `labels` (`en-US`, `zh-CN`), `active`, optional `system`.
- Admin API: GET/PUT Forms / Discovery source catalog (`page-builder`).
- Public API: GET active options for configurator.
- Extend Authorization hold body: `phone`, `discoverySource`, `discoverySourceOther`; persist alongside `customer_email`.
- In-store save/finalize: same required fields and persistence.

## Testing Decisions

### What makes a good test

- Test external behavior of catalog and validation helpers (seed shape, Other lock, archive filtering, required/Other free-text rules, reject unknown ids) — not React snapshots or Tailwind layout.
- Do not unit-test Results detail markup or Forms drag-reorder chrome in JSDOM.

### Modules to test

| Module | Automated? | Rationale |
|--------|------------|-----------|
| Discovery source catalog | **Yes** | Seed / Other lock / archive — high regression risk |
| Discovery source validation | **Yes** | Hold and in-store gate — high regression risk |
| Forms settings UI | **No** | Visual/admin; staging QA |
| Preview contact fields | **No** | Visual; staging QA |
| Results detail contact | **No** | Visual; staging QA |
| Domain glossary | **No** | Doc-only |

### Prior art

- Co-located `*.check.ts` assert demos (configurator mobile UX, settings FAQ checks).
- `site_settings` load/save patterns for appointments and SLA.
- `normalizePhone` in appointments phone helper for SG numbers.

## Out of Scope

- Full customization-steps form builder (add/remove/reorder wizard steps or field types)
- Editing other configurator option lists (gender, age, blood pressure, bed firmness, sleep position, etc.)
- Discovery source analytics breakdown charts
- Results list columns / filters for Discovery source
- Broader wizard visual redesign beyond the preview contact block
- Collecting phone/Discovery source on shop cart checkout or appointments booking iframe
- Writing phone onto `customers` / `orders` tables beyond the Result (unless a thin existing path already updates customer email similarly — do not expand CRM sync in this PRD)
- mp-maker / shop PillowCustomizer legacy flows

## Further Notes

- Vertical slices will live in `.claude/PRD-configurator-contact-forms/issues/`.
- Prefer the minimum Forms UI that edits one catalog well; do not invent a multi-form registry until a second option list is needed.
- When resolving labels on Results detail, prefer catalog lookup by id with a fallback to the raw id if the option was removed from storage entirely.
