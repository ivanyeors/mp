## Parent

PRD: Partner Hub — #70

## What to build

Vitest spec suites for the money modules — **authored by an agent that did not implement them** (owner directive: implementation and tests never share an author; tests encode ADR 0015 and the glossary, not the implementation's assumptions). Modules: **referrals** (code validation, precedence assist > typed > last link, 30-day window boundary, last-touch overwrite, one-referral-per-Order), **commissions** (lifecycle `held → released → paid | void`, release derived from `delivered_at` + return window, refund-void vs exchange/replacement-keep, scheme resolution default vs override, pillow/bolster-only scope, payout accumulation), **milestones** (credit at capture, decrement on void, endowed +2, rung detection at boundaries, ratchet no-demotion, self-purchase exclusion). External behavior only; prior art: RMA `canTransition` suites.

## Acceptance criteria

- [ ] Suites written from ADR 0015/CONTEXT.md by a different agent than the implementers of #74/#77/#79
- [ ] Referrals: every precedence pairing, window edge (day 30 vs 31), overwrite, and invalid-code path covered
- [ ] Commissions: every legal/illegal transition, release-date derivation, all three RMA resolutions, scope exclusions covered
- [ ] Milestones: rung boundaries, void decrement across a rung (tier must not demote), endowed start, self-purchase exclusion covered
- [ ] No implementation internals asserted; full vitest run green

## Blocked by

- #74, #77, #79
