# Known issues

Confirmed defects that are deliberately **not** fixed yet, with enough detail to
act on without re-deriving them. An entry leaves here by being fixed or by
becoming a PRD under `.claude/`.

---

## The pillow half of the shopper x-ray never returns a Filling Template

**Where:** `lib/shop/customization-llm.ts` → `getBomTemplates(kind, size)`
**Callers:** `app/api/shop/customize/route.ts` (pillow branch),
`app/api/mp-basic/recommend/route.ts`
**Status:** open, pre-existing (predates ADR 0018), owner: Ivan

`getBomTemplates` filters `.eq("kind", "pillow").eq("key", size).eq("pillow_kind", kind)`
with `kind ∈ {basic, premium}`. A **Filling Template** always has
`pillow_kind = null` — set explicitly at
`app/[lang]/settings/inventory/configure/templates/route.ts` and
`configure/unpromoted/route.ts`, because Filling Templates carry no **Tier**
(CONTEXT.md). So that predicate can never match one, and the query returns
**warehouse** templates instead.

Both callers then read `filling_template_placements` for the returned ids, to
render the recommended mix in the shopper's read-only x-ray. Placements exist
only for `role = 'filling'` rows (`20260724000000_backfill_filling_placements.sql`),
so the join returns nothing and the pillow x-ray renders empty.

Two readings, unresolved:

1. **Dead code.** The pillow x-ray was never wired up, and the `pillow_kind`
   filter is a leftover from when this read warehouse BOMs.
2. **A real bug.** It is meant to read Filling Templates, in which case it also
   needs the ADR 0018 treatment — scope by **Size membership**
   (`templateIdsForKey`), not by `key`, or a recipe shared across sizes shows on
   its primary size only.

The bolster half of the same endpoint (`app/api/shop/customize/route.ts`, the
`role = 'filling'` query) does exactly what reading (2) describes, which makes
(2) the more likely intent — but the pillow branch has no equivalent, so this is
a product call, not a mechanical fix.

**If you fix it:** drop `.eq("pillow_kind", kind)`, add `.eq("role", "filling")`,
and scope by membership via `templateIdsForKey` from
`lib/filling-templates/membership.ts`. Add the call site to the reader list in
`lib/filling-templates/membership.check.ts` so it cannot regress.
