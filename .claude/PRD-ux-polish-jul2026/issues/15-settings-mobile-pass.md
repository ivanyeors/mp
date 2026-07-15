# Slice 15 — Full Admin Panel mobile UX pass

Type: AFK
Parent: PRD `ux-polish-jul2026` (`.claude/PRD-ux-polish-jul2026/ux-polish-jul2026-prd.md`)
Triage: needs-triage
User stories covered: 28

## What to build

Full `/settings/*` mobile usability pass: stacked layouts, touch-friendly buttons/filters, cards only where interaction needs them, tables scroll **inside** containers (not the page), Admin Menu sheet remains usable with safe-area. Document a mini-audit list in the PR (page → issue → fix). Desktop sidebar behavior preserved.

## Acceptance criteria

- [x] Priority and remaining Admin Panel routes usable at ~390px without page side-scroll.
- [x] Primary actions have adequate touch targets; no hover-only critical actions.
- [x] Admin dock Menu → settings sheet still navigates.
- [x] PR includes the mini-audit list of pages touched.

## Blocked by

- Soft: slice 12 (global overflow rules) so Settings fixes do not fight page scroll policy.

## Proof

```bash
npx tsx components/settings/settings-mobile.check.ts
npx tsx components/ui/mobile-overflow.check.ts
npx tsx lib/auth/admin-panel-menu.check.ts
```

## Mini-audit (page → issue → fix)

| Page | Issue | Fix |
|------|-------|-----|
| Admin Menu sheet | Last tiles under Close / safe-area | `pb-[calc(4rem+var(--safe-bottom))]` on scroll body; keep `mobilePreset="quick"` |
| audit-log | Wide table clipped by `overflow-hidden` | `min-w-0 overflow-x-auto` |
| media | Hover-only delete/copy/replace; tiny chips | Always visible on mobile; `min-h-11` icons/chips |
| results | Hover-only delete; wide columns | Always-visible delete `min-h-11`; hide Gender/Age/Shoulder/ID on small |
| results/[id] | Action row overflow | `flex-wrap` + `w-full sm:w-auto` |
| costings | Crowded header; filter `w-[280px]` | Stack/wrap header; `w-full sm:w-[280px]` |
| blogs | Non-stack header; clipped table; tiny icons | Stack header; `overflow-x-auto`; `min-h-11` |
| blogs/[id] | Save CTAs squeezed | Stack header; full-width CTAs on mobile |
| inventory | Non-wrap header; hover-only variant delete | Stack header; always-visible `min-h-11` delete |
| inventory/configure | Header doesn’t stack | Same stack + Save `w-full sm:w-auto` |
| products | Crowded Sync/Add bar | Stack/wrap; full-width on mobile |
| products/[id] | Hover image delete; 4-col grid | Always-visible delete; `grid-cols-2 sm:grid-cols-4` |
| categories-manager | Clipped table; tiny hits | `overflow-x-auto`; `min-h-11`; stack header |
| integrations/shopify | Filter row + dense actions | Stack filters; hide Variant ID/Price under `md:`; stack actions |
| Shopify Sales | Toolbar / 2-month calendar overflow | Stack toolbar; 1 month; clamp limit menu width |
| orders | Date inputs side-by-side | Stack; `w-full sm:w-40` |
| orders/[id] | Mp-config icons `h-7` | `min-h-11 min-w-11` |
| discounts | Non-stack header; status hidden mobile | Stack; status badge under code (`md:hidden`) |
| discounts/[id] | Small code-row icons | `min-h-11` |
| faq / page-faqs-panel | `p-1` icons; fixed select | `min-h-11`; `w-full sm:w-[280px]` |
| forms | Crowded Add/Save; tiny reorder | Stack header; `min-h-11` |
| page-builder | Crowded header; tiny controls | Stack; `min-h-11` |
| partners | Small chips/icons; live MD overflow | `min-h-11`; MDEditor `preview="edit"` |
| admins | Dense table + inline pending badge | Badge under email; fluid select; `min-w-0` card |
| staff-management | Fixed widths + UUID widen | Relax widths; hide UUID on xs |
| appointments | Header row | `flex-col gap-2 sm:flex-row` |
| analytics | Small date chips; fixed filters | `min-h-11`; `w-full sm:w-*` |
| general | Small edit/eye | `min-h-11` |
| shipping | Non-stack headers | Stack |
| customers | Pagination can overflow | `overflow-x-auto` |
| customers/[id] | Tag × hover-only | Always `opacity-100` |
| Desktop sidebar | — | Unchanged |
