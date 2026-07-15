# Staging device QA — UX polish + Pre-order

Matrix: iOS Safari + Android Chrome. Mark Pass / Fail / N/A. File AFK follow-ups for Failures.

| Area | Slice | iOS | Android | Notes |
|------|-------|-----|---------|-------|
| Exit dialog no X overlap | 01 | | | |
| Mbolster FAQ close below | 02 | | | |
| Height decimal typing | 03 | | | |
| Mbolster case-only + auto-select | 04 | | | |
| Pre-order CTA + waiting section | 05 | | | |
| Result shows Pre-order after hold | 06 | | | |
| Restock email (staging trigger) | 07 | | | |
| Profile left + logo clearance | 08 | | | |
| Hero CTAs lower (mobile) | 09 | | | |
| MeasureTile image above text | 10 | | | |
| Dock visible at page end | 11 | | | |
| No page side-scroll | 12 | | | |
| Pinch-zoom locked | 13 | | | |
| Orders paid_at date range | 14 | | | |
| Settings: dock Menu → sheet navigates | 15 | | | Safe-area; last tiles reachable |
| Settings: Orders list + date filters | 15 | | | No page side-scroll; filters stack |
| Settings: Results list (delete visible) | 15 | | | Touch delete; columns not page-wide |
| Settings: Inventory / Products headers | 15 | | | Stacked actions; no hover-only delete |
| Settings: Media overlay actions | 15 | | | Actions visible without hover |
| Settings: Audit log table scroll | 15 | | | Scroll inside card, not page |

## How to sign off

1. Open staging on a real phone (or Safari Responsive Design Mode / Chrome device toolbar at ~390px as a smoke only — real devices required for Pass).
2. Walk each row; mark **Pass** / **Fail** / **N/A**.
3. For each **Fail**, open a follow-up AFK issue under this PRD (`issues/NN-….md`) with page → repro → expected; do not leave failures as vague notes only.
4. Incremental sign-off is OK as slices 01–15 land.

## Slice 16 status

- [x] Checklist document present
- [ ] iOS Safari + Android Chrome rows filled for critical paths (HITL)
- [ ] Failures filed as follow-up AFK slices (when any Fail)
