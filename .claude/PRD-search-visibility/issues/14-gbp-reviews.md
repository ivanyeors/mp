# Slice 14 — Google Business Profile + post-visit review requests

Type: AFK + OPS
Parent: PRD `search-visibility` (`.claude/PRD-search-visibility/search-visibility-prd.md`)
Triage: needs-triage
User stories covered: 35, 36

## What to build

- OPS: claim/verify GBP for each **Location**; consistent name/address/phone; categories, hours, photos, products; link to `custom.mpillow.com`
- AFK: after an appointment is completed or an Order is delivered, send one review request (WhatsApp/email, reusing the existing senders) with the GBP review link; at most once per customer; opt-out respected
- `LocalBusiness` JSON-LD per location page matching GBP data

## Acceptance criteria

- [ ] Review request sent at most once per customer
- [ ] No incentive offered for reviews (Google policy)
- [ ] JSON-LD NAP matches GBP exactly

## Blocked by

None
