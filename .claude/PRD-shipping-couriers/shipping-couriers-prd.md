# Shipping › Couriers — PRD

**Status:** planned 2026-10-03, nothing built.

## Problem

Shipping config is split across two pages that share the `shipping` permission:

| Page | Tabs | Store |
|---|---|---|
| Store › Shipping (`settings/shipping`) | Methods · Easyship (env status, live-rates switch, ship-from, package profiles, customs, test quote) | `shipping_settings` via `/api/shop/shipping/settings` |
| Integration › Easyship (`settings/integrations/easyship`) | Tracking · Addresses · Boxes · Shipping rules · Webhook | `api_configs[slug=easyship]` via `/api/settings/easyship` |

1. **Duplicate truth.** Ship-from address vs default sender address; package profiles vs custom boxes. Rating reads the first copy, while ADR 0021 (settings source of truth) says it should consume the doc.
2. **Brand leakage.** The provider name is in nav, tabs, badges, method options and buttons.
3. **False "fallback".** Flat methods aren't tied to any provider, so they are not a fallback. The only real fallback is a live method charging its `base_rate` during an outage, and that goes.

## Decisions

- One nav entry, **Store › Shipping**. Courier config lives in a nested page, **Shipping › Couriers** (`/settings/shipping/couriers`), with automatic breadcrumbs. `/settings/integrations/easyship` redirects there.
- **No fallback.** A live method with no quote (outage, currency mismatch, missing token) is hidden. The global "Live rates for shoppers" switch is deleted, and flat methods are ordinary methods.
- **Live is the default** for new methods: the form default and the `rate_source` column default. Existing rows are untouched.
- **One model.** Rating and labels read the synced doc's default sender address and boxes. The `shipping_settings.origin_address`, `packages` and `easyship_enabled` columns are dropped.
- **Brand rule.** "Easyship" stays only where staff act outside the app: env var names and "in your Easyship dashboard" steps.

## Target IA

```
Admin Panel › Shipping
  Methods list  +  Couriers card (Connected · Production · n boxes · Manage →)
Admin Panel › Shipping › Couriers
  Header: Import · Sync now · Save & sync
  Tabs: Connection | Addresses | Boxes | Rules | Tracking | Webhook
```

## Slices

See `issues/README.md`.

| # | Slice | Type |
|---|---|---|
| 01 | Couriers page, nav, redirect, brand copy | AFK |
| 02 | No fallback; live is the default | AFK |
| 03 | One sender address | AFK |
| 04 | One box list | AFK |
| 05 | Drop dead columns + docs | AFK |
| 06 | Prod sign-off | HITL |

## Out of scope

- Multi-provider support: the provider stays implicit, with no provider picker.
- Rewriting existing flat methods to live.
- Changes to the sync reconciler (`lib/easyship/sync.ts`).

## Risks

- Hiding live methods means checkout can show **no** shipping option if every active method is live and the provider is down. Slice 02 adds a warning on the Methods page when no active flat method exists.
- The doc's address limits are tighter (company ≤27, contact ≤22, line ≤35). The slice 03 seed must truncate and flag.
- Two ADRs are numbered 0020. Slice 02 renumbers one.
