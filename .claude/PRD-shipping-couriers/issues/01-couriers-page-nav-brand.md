# 01 — Couriers page, nav, redirect, brand copy

Type: AFK · Labels: `needs-triage`

## Parent

`../shipping-couriers-prd.md`

## What to build

Staff manage everything about shipping from one place. Store › Shipping shows the methods list and a **Couriers** status card ("Connected · Production · 3 boxes · Manage →"). The card opens Admin Panel › Shipping › Couriers, which holds the courier account: Connection | Addresses | Boxes | Rules | Tracking | Webhook. Connection is today's Shipping › Easyship tab (env status, customs & quotes, Test a quote). For now it keeps its ship-from and packaging cards; slices 03 and 04 remove them. The Integration › Easyship nav entry is gone, and old bookmarks redirect. The provider's brand appears nowhere in the UI except env var names and "in your Easyship dashboard" steps.

Notes:
- Move `app/[lang]/settings/integrations/easyship/*` to `app/[lang]/settings/shipping/couriers/`, and move `shipping/easyship-panel.tsx` in as the Connection tab.
- Shipping page: drop the `Methods | Easyship` tabs at `shipping-client.tsx:376`.
- Redirect: add a `proxy.ts` rule like the Shopify one at L83, plus a page `redirect()` like `inventory/shopify/page.tsx:12`.
- Nav: remove `components/settings/settings-sidebar-nav.tsx:155`. Breadcrumbs come free from `buildSettingsBreadcrumbs`.
- Copy:

| Before | After |
|---|---|
| Page H1 "Easyship" | "Couriers" |
| Tab "Shipping rules" | "Rules" |
| Badge "Live · Easyship" | "Live rate" |
| Option "Live rate (Easyship)" | "Live courier rate" |
| "Best value (Easyship ranking)" | "Best value" |
| "Ship with Easyship" (order dialog) | "Buy courier label" |
| "Import from Easyship" | "Import from courier account" |
| Toasts "…synced to Easyship" | "…synced" |
| `lib/shipping/quote.ts:93` "Settings → Shipping" | "Settings → Shipping → Couriers" |

## Acceptance criteria

- [ ] `/settings/integrations/easyship` redirects to `/settings/shipping/couriers`, and the breadcrumb reads "Admin Panel › Shipping › Couriers".
- [ ] The sidebar has one shipping entry: Store › Shipping.
- [ ] The Shipping page shows the Couriers card with the live connection status, and it links to the nested page.
- [ ] Every existing courier feature (Import, Save & sync, Test a quote, all tabs) works from the new page.
- [ ] `settings-breadcrumbs.test.ts` has a case for the nested Couriers path.
- [ ] `grep -rn "Easyship" app components --include=*.tsx` hits only env-var and dashboard-step copy.
- [ ] `settings-mobile.check.ts:128` passes.

## Blocked by

None - can start immediately.
