## Parent

PRD: Partner Hub — #70

## What to build

The hub's money and referrals panel, end to end. Totals: commission **held / released / paid**, all-time earned. Every held commission shows the **exact release date** ("releases 14 Aug — return window") — never an undated pending state. Referral metrics: distinct customers with attributed **paid Orders** (headline) plus an "in progress" pipeline line (attributed Results not yet captured). Per-referral rows follow the PDPA rule: **partner-assisted** referrals show full customer details for verification; **link/code** referrals show masked identity only (e.g. "Jo… T. · j***@…") plus product, commission status, and countdown. The Admin Panel sees everything unmasked.

## Acceptance criteria

- [ ] Held/released/paid totals reconcile with the ledger for a seeded partner
- [ ] Every held row displays amount + dated release countdown; no undated "pending" anywhere
- [ ] Headline = distinct paid customers; pipeline line counts attributed uncaptured Results
- [ ] Assisted referral rows show full details; link/code rows are masked; the same Order never appears twice
- [ ] Admin commissions page shows the same rows unmasked
- [ ] Voided commissions are visibly struck/labelled, not silently removed

## Blocked by

- #77
