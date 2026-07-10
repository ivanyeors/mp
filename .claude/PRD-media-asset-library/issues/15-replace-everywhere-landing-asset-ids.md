# Slice 15 — Replace-everywhere + dual-write Asset ids on landing slots

Type: AFK
Parent: PRD `media-asset-library` (`.claude/PRD-media-asset-library/media-asset-library-prd.md`)
Triage: needs-triage
User stories covered: 40–42
Modules: 5, 9

## What to build

**Scope 3** — extend bulk replace and landing slot tracking.

- Evolve existing replace API: swap old hosted_url → new hosted_url across blogs, landing settings, products, categories, partners, page builder (not order snapshots).
- Optional: swap by Asset id when consumers store ids.
- Landing slot UI: when assigning hero/section image, persist `media_asset_id` alongside url in site_settings (new key suffix or JSON value shape — document migration).
- Replace-everywhere action on Asset detail: pick replacement Asset, run bulk update, refresh usage.

## Acceptance criteria

- [ ] Replace updates references in all listed consumer types.
- [ ] Landing slots store Asset id + url on save.
- [ ] Usage resolver reflects new attachments after replace.
- [ ] Order item snapshots unchanged by replace.

## Blocked by

- Slice 10 — Usage resolver (`10-usage-resolver-v1.md`)
- Slice 12 — Picker roll-out (`12-asset-picker-rollout.md`)
