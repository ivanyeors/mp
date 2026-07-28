## Parent

PRD: Partner Hub — #70

## What to build

HITL — WhatsApp channel for **Partner notifications**. Partners with WhatsApp opt in (hub settings toggle, defaulting off) to receive the same events as email — referral earned, milestone reached, payout made, terms re-accept — via the existing WhatsApp Cloud API integration. **Human-in-the-loop because each notification type needs a Meta-approved message template** (external approval latency, wording constraints) and the owner must sign off template copy and per-conversation cost.

## Acceptance criteria

- [ ] Owner signs off template wording per event; templates submitted and approved in Meta Business Manager
- [ ] Hub settings toggle stores per-partner channel preference (email always on; WhatsApp additive)
- [ ] Opted-in partner receives WhatsApp messages for the four events using their application mobile number
- [ ] Opt-out stops WhatsApp immediately without touching email
- [ ] Failures fall back silently to email-only (no partner-visible error)

## Blocked by

- #84
