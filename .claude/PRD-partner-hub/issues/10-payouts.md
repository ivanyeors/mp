## Parent

PRD: Partner Hub — #70

## What to build

**Payout**, end to end — manual only (ADR 0015). Hub settings: partner uploads PayNow QR (image, private storage — service-role access, not the Media Asset DAM, following the reference-photos precedent) and/or bank account fields. Admin: the Partner commissions page gains the payout workflow — per-partner released balance, payment details (QR rendered inline), record a payout (amount, date, method, reference) with a Staff-uploaded **proof-of-payment image**, marking the covered commissions `paid`. Hub: the partner sees accumulated released balance, payout history with status, and the proof image — full transparency. **No minimum threshold.**

## Acceptance criteria

- [ ] Partner uploads/replaces PayNow QR + bank details; images are inaccessible to the public and other partners
- [ ] Admin sees released balance + payment details per partner and records a payout with proof image
- [ ] Recording a payout flips the covered commissions to `paid`; balances update in both surfaces
- [ ] Partner sees payout history with status and can view the proof image
- [ ] A 1-unit balance is payable (no minimum)
- [ ] Payout records are immutable once created (corrections = new entry, not edits)

## Blocked by

- #77
