## Parent

PRD: Partner Hub — #70

## What to build

The applicant side of the **Partner application**, end to end. A signed-in non-partner can reach an application flow: the 8-field questionnaire (company name · ACRA UEN · business website/social · business category physio/chiro/TCM/wellness/retail/other · contact person name · contact mobile · business email prefilled from sign-in · "How do you plan to introduce Mpillow to your clients?" free text), then the **static versioned agreement page** (repo i18n legal copy with placeholder text until the owner supplies final wording). Disagreeing keeps "Become a Partner" disabled; agreeing enables it. Submission records the questionnaire, `agreed_version` + timestamp, and sets status `pending` — the applicant then sees the "under review" screen on every hub entry; `rejected` shows the rejected state. If the agreement version changes after approval, the partner is prompted to re-accept on next hub entry before proceeding.

## Acceptance criteria

- [ ] Full applicant loop demoable: sign in → questionnaire → agreement → Become a Partner (disabled until agree) → pending "under review" screen
- [ ] All 8 fields validated (UEN/mobile format sanity, required fields); business email prefilled
- [ ] Application stores answers + `agreed_version` + timestamp on the partner identity row
- [ ] Rejected status renders the rejected screen; approved proceeds to hub shell
- [ ] Bumping the agreement version forces an approved partner through re-accept before the hub renders
- [ ] No approval UI in this slice (admin queue is the next slice) — status flipped manually to demo

## Blocked by

- #71
