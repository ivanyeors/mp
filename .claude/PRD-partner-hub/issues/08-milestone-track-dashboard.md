## Parent

PRD: Partner Hub — #70

## What to build

The **Milestone track** — the gamified spine the partner sees first on the hub, end to end. A pure milestones module computes progress from unit events: credit at attributed capture, decrement on refund-void, **endowed +2 start** with the stated reason ("launch partner bonus"), geometric rungs (~5/15/40/100, admin-tunable values), tier **ratchet** (never demotes). Each rung grants a one-time cash bonus + a permanent per-unit rate bump (feeding the Commission scheme) + a non-cash perk label. Dashboard UI: progress bar with "X pillows to your next reward" (goal-gradient framing), current tier + perks, a "top N%" percentile chip (no leaderboard), and a surprise-gift note at rung crossings. Self-purchases never move the bar.

## Acceptance criteria

- [ ] Attributed capture moves the bar immediately; refund-void decrements honestly
- [ ] New partner starts at 2 units with the reason displayed
- [ ] Rung crossing surfaces bonus + rate bump + perk; the rate bump applies to subsequent commissions; tier never drops afterward
- [ ] Bar always states units-to-next-rung; percentile chip renders; no ranked list anywhere
- [ ] Rung values/bonuses editable from the Admin Partner commissions surface
- [ ] Self-purchase units are excluded from the count

## Blocked by

- #77
