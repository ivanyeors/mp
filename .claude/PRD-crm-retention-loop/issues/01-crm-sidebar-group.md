# 01 — One CRM group in the sidebar, in loop order

**Issue:** not filed
**Type:** AFK
**Status:** built on `claude/hopeful-hopper-bs4ic1`
**Blocked by:** none
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`

## Goal

Everything Staff do with a customer sits in one place, in the order a customer goes round it.
The demo: the sidebar reads *Admin Panel* (General, Documentation), then *CRM*: Customers,
Results, Orders, Returns / RMA, Email campaigns, and Email templates beneath Email campaigns.
*Store* is left with Products, Discounts and Shipping.

## What was built

- `NAV_GROUPS` (`components/settings/settings-sidebar-nav.tsx`): a *CRM* group after *Admin
  Panel*. Email templates is a child of Email campaigns, so the breadcrumb reads *Admin Panel →
  Email campaigns → Email templates* through the existing structural-parent rule
  (`settings-breadcrumbs.ts`). Its URL is unchanged (PRD decision 2).
- Clearer tooltips: Customers is *Profiles, segments, follow-ups and reviews*; Orders is
  *Payment, fulfilment and delivery*.
- `visibleItems`: a parent the role cannot open gives way to the children it can. Before, a role
  holding a child but not its parent saw the parent, and its click ended on the denied notice.
- The Results and Customers badges are one `NavBadge` map, shown on the desktop item and on the
  mobile menu's tile, which had none.
- `PERMISSION_CATALOG` (`lib/auth/permissions.ts`): the same keys move to a `CRM` group, in the
  same order, so Users & permissions → Roles lists them together. No key, href or role changes.

## Acceptance criteria

- [x] The CRM group lists Customers, Results, Orders, Returns / RMA and Email campaigns, in that
  order, with Email templates under Email campaigns.
- [x] Store no longer lists any of them.
- [x] Every CRM page's catalog entry is in the `CRM` group.
- [x] A role with `email-templates` and not `campaigns` sees Email templates as its own item.
- [x] The badges show on desktop and on the mobile tiles.

## Verify

```bash
pnpm exec vitest run components/settings lib/auth "app/[lang]/settings/email-templates" \
  "app/[lang]/settings/campaigns" "app/[lang]/settings/customers/import"
npx tsx components/settings/settings-breadcrumbs.check.ts
npx tsx lib/product-builder/overlays.check.ts
```
