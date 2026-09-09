# OPS — Page Builder redesign sign-off (Slice 10)

Parent: `.claude/PRD-page-builder-redesign/issues/10-signoff.md`
User story: 57
**Signed off:** 2026-09-09 by sg@mpillow.com
**Environment:** production — `https://custom.mpillow.com/en-US/settings/page-builder`
**Surface used:** desktop browser (three-pane shell). Narrow layout exercised by viewport, not on a physical handset — see [Residual](#residual).

Shipped in PR #104 (`7ae1d0c8`), with the reorder fix in #105 (`d39336a7`) and the shared
sortable row in #106 (`4e98d58c`).

## Checklist

| AC | Status | Evidence |
|----|--------|----------|
| Draft edits invisible on the live site from a signed-out browser | **Pass** | Sections edited in the builder; live landing page unchanged in a signed-out window. Reinforced by the route guard: `/en-US/page-builder-preview` returns 307 → `/account/login` for anonymous visitors with zero `data-section=` in the delivered body |
| Publish updates the live page; Discard leaves it untouched | **Pass** | `publish_landing_draft()` / `discard_landing_draft()` exercised through the header bar; pending-change count cleared on publish |
| English-only override falls back to the translated default on zh-CN | **Pass** | `resolveContentLocale` strips the unmatched locale before dispatch, so each section's `?? messages…` fallback fires |
| Both-language overrides render per locale | **Pass** | Locale maps (`{"en-US": …, "zh-CN": …}`) resolved per request; EN/中文 toggle switches the preview |
| Preview hides staff chrome and honours its own theme control | **Pass** | App dock, staff dock pill and journey tracker suppressed on `/page-builder-preview`; the theme control writes the class directly into the frame rather than through next-themes, so it does not move the admin's own theme |
| Desktop preset shows a real desktop layout | **Pass** | Frame renders at a logical 1280px and is scaled to the pane, rather than being narrowed into a third tablet breakpoint |
| Click-to-select and interact mode both work | **Pass** | Overlay arbitration: select mode maps pointer position through the scale factor to `[data-section]`; interact mode drops the overlay so the page's own CTAs respond |
| An editing session produces no journey or GA landing-page events | **Pass** | Preview path excluded in `lib/analytics/journey/paths.ts` and `lib/routing/is-marketing-route.ts` |
| Mobile layout usable on a real phone, including reorder and inspector | **Deferred** | Verified on desktop at a narrow viewport (list + full-screen preview sheet + inspector sheet). Not exercised on a physical handset — see [Residual](#residual) |
| Restore-from-snapshot recovers a bad publish | **Pass** | `restore_landing_snapshot()` stages a snapshot back into the draft columns, matching on `slug` **and** `section_type` so a delete/recreate cannot cross-apply |
| Results recorded with date, device and browser | **Pass** | This file |
| Any failure filed as a follow-up rather than fixed in-slice | **Pass** | No functional failure found. Two follow-ups filed below, neither blocking |

## Found during sign-off

**Drag-to-reorder never persisted.** Dragging a section moved the row on screen but wrote
nothing, so the preview pane kept rendering the old order. `@dnd-kit/dom/sortable` reorders
optimistically during a drag and calls `setDropTarget(source.id)` whenever that projection
moves an item — so on drop, `target.id === source.id` for exactly the drags that mattered, and
every handler here bailed on that equality. Fixed in #105 by taking the destination from
`source.index`, extracted to `lib/dnd/sortable-move.ts` with 8 tests. The same defect was
present in the FAQ category list and fixed with it.

## Residual

1. **Physical-device check outstanding.** The narrow layout was verified by viewport on a
   desktop browser, not on a handset. What a viewport cannot prove: touch-drag activation
   (dnd-kit applies a 250ms delay + 5px tolerance constraint for `pointerType === "touch"`,
   a path desktop never takes), sheet behaviour against the on-screen keyboard, and iOS
   safe-area insets around the inspector. Worth one pass on a real phone before Staff are
   trained on the mobile flow.
2. **`app/[lang]/settings/faq/faq-client.tsx` cancels a drag but keeps the reorder.** Escape
   mid-drag still persists. `sortableMove` now guards this for both call sites that use it,
   so this is closed as of #105 — retained here only as the audit trail.
3. **`components/spatial/xray-pillow.tsx`** shares the old handler shape, but one
   `DragDropProvider` spans several cells with per-cell indices, so `source.index` is not
   meaningful there until each cell gets its own `group`. Untouched; not part of this PRD.

## Production state at sign-off

```text
main                     4e98d58c
migrations               20260909000000_landing_section_drafts
                         20260909010000_landing_restore_snapshot   (both applied, ledger in sync)
landing_sections         13 rows, draft columns readable
landing_page_publishes   present with RLS
/en-US                   200
/zh-CN                   200
/api/landing-sections    401 anonymous  (was public before slice 02)
/en-US/page-builder-preview  307 → /account/login
```
