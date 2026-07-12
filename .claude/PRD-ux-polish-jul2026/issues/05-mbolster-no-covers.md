# Slice 05 — Mbolster preferences: no covers

Type: AFK
Parent: PRD `ux-polish-jul2026` (`.claude/PRD-ux-polish-jul2026/ux-polish-jul2026-prd.md`)
Triage: needs-triage
User stories covered: 7–8
PR group: **B**

## What to build

Product fact: **Mbolster does not offer covers.** Audit and align:

1. **Inventory / Configure** — what categories appear on bolster BOM / preference-capable items (`bolster_case`, protector, packaging, etc.).
2. **API** — `getAvailableBolsterComponents` / `/api/shop/customize` currently can return `covers` filtered by `category === "cover"`.
3. **Customise preview UI** — `customization-steps` always shows Cover Style; empty state says “No covers available”.

Fix so Mbolster customise only presents real Customer preferences (case). Hide or remove Cover Style for bolster when covers are not part of the product. Do not invent cover inventory to silence the empty state.

Also ensure authorize / preference line validation does not require a cover `item_id` for bolster.

Primary paths:

- `lib/shop/customization-inventory.ts` (`getAvailableBolsterComponents`, `BOLSTER_COMPONENT_CATEGORIES`)
- `app/api/shop/customize/route.ts`
- `components/shop/customization-steps.tsx`
- `app/[lang]/mbolster-config/mbolster-config-client.tsx`
- `app/[lang]/settings/inventory/configure/page.tsx` (bolster tabs)

## Acceptance criteria

- [ ] Documented audit note in the PR: what Configure offers for bolster vs pillow.
- [ ] Mbolster preview does not show a Cover Style picker when covers are not offered.
- [ ] Case (`bolster_case`) picker still works when cases exist.
- [ ] Hold / in-store save does not require `selectedCover` for bolster.
- [ ] Small automated check for bolster preference role / filter helper.

## Proof

```bash
npx tsx lib/shop/customization-inventory.bolster-prefs.check.ts
# → ok (create this thin check with the slice)
```

## Blocked by

None — foundation for honest Mbolster customise UX.
