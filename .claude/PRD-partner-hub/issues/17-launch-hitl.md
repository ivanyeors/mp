## Parent

PRD: Partner Hub — #70

## What to build

HITL launch gate — the owner decisions and live verification no agent can do:

1. **Launch values** (Admin-tunable, set before go-live): rung unit counts, per-rung bonus amounts and rate-bump sizes, default Commission scheme values, self-purchase discount + cap defaults, logo guideline numbers.
2. **Agreement legal copy**: owner/lawyer-authored partner agreement including the mandatory **patient-facing disclosure clause** (AHPC §5.7/§5.7.1 compliance posture per ADR 0015) — replaces the placeholder from the application slice; version recorded.
3. **Deploy + migrations**: push additive migrations (`supabase db push` goes straight to prod — verify additive safety first), deploy, verify env (email transport, WhatsApp when #86 lands).
4. **Live QA**: full journey on real devices — apply → approve → share link → referred purchase → assisted customisation → commission countdown → payout with proof → milestone crossing. Verify `/our-partners` unchanged for existing partners and `delivered_at` is set on in-store handover.

## Acceptance criteria

- [ ] All launch values entered and sanity-checked against margin
- [ ] Final agreement text live, disclosure clause included, version bumped and recorded
- [ ] Migrations pushed ahead of deploy with zero impact on the running app; deploy green
- [ ] End-to-end live journey verified on desktop + mobile, including one real PayNow payout with proof visible to the partner
- [ ] Existing partner rows render unchanged on `/our-partners`; booking picker unaffected

## Blocked by

- #71, #72, #73, #74, #75, #76, #77, #78, #79, #80, #81, #82, #83, #84, #85, #86
