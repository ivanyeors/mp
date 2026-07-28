## Parent

PRD: Partner Hub — #70

## What to build

The Staff side of the **Partner application**: an Admin Panel review queue listing pending applications with every questionnaire answer (verification is Staff eyeballing ACRA/website — no ACRA API). Approve creates/claims the `type='partner'` **Location** row (`visible=false` — Staff flip visibility separately via the existing Locations CRUD) and unlocks the hub; reject sets the rejected state. Both outcomes email the applicant (plain transactional copy now; branded HTML base arrives in the notifications slice).

## Acceptance criteria

- [ ] Pending applications appear in an Admin Panel queue with all 8 answers visible
- [ ] Approve → partner row created (`visible=false`), status `approved`, applicant email sent, partner's next visit lands on the hub
- [ ] Reject → status `rejected`, applicant email sent, applicant sees rejected screen
- [ ] Queue access requires Staff (existing admin permission pattern)
- [ ] Full loop demoable: apply (from #73) → approve here → hub unlocked, with `/our-partners` unchanged until Staff flip visibility

## Blocked by

- #73
