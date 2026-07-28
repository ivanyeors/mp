## Parent

PRD: Partner Hub — #70

## What to build

The partner identity spine, end to end: a signed-in user recognised as a **Partner account** can open a guarded `/partner` **Partner Hub** shell, and the storefront menu pill routes them there. Additive migration for `partner_users` (auth link, FK to the `type='partner'` row in the `partners` table per ADR 0012, application status, agreed version, questionnaire payload, backup email slot). A partner context/guard module mirroring the admin guard resolves the role post-session, enforces the **7-day absolute session cap** (force re-auth when `last_sign_in_at` is stale), and exposes precedence **Staff > Partner > Customer** for the dock pill — access stays additive (a Partner who is also a Customer can still open `/account`). Hub shell renders a placeholder dashboard for `approved` partners only; `pending`/`rejected` render their status screens (full application flow arrives in a later slice — seed a partner row by hand to demo).

## Acceptance criteria

- [ ] Migration is additive/prod-safe (invisible to deployed code) following the expand pattern of ADR 0012
- [ ] Seeded approved partner signs in → menu pill reads "Partner Hub" → `/partner` renders the shell
- [ ] Customer/guest hitting `/partner` is redirected to Sign in / storefront; Staff pill still wins over Partner
- [ ] Session older than 7 days at the partner guard forces a fresh sign-in (Customer/Staff surfaces unaffected)
- [ ] Partner who is also a Customer can still open `/account` directly
- [ ] No test-suite authoring in this slice (spec tests land via the independent-agent test slice)

## Blocked by

None - can start immediately
