# PRD: Partner Hub — self-serve partner program (signup, referrals, commissions, gamified milestones)

Status: Draft (needs-triage)
Source: grill-with-docs session 2026-07-28 (business owner + product design). Domain decisions captured in `CONTEXT.md` → "Partner portal" section.
ADRs: `docs/adr/0015-partner-referral-attribution-commission.md` (money model), `docs/adr/0012-locations-unified-partner-model.md` (partners table = Location aggregate).
Research: incentive-psychology brief (goal-gradient, endowed progress, no-demotion tiers, no leaderboards; AHPC §5.7 clinician-ethics constraint) — conclusions baked into the Milestone track glossary entry and ADR 0015.

## Problem Statement

Mpillow's clinical partners (physios, chiros, TCM, wellness studios) already send customers our way, but the relationship is invisible and manual. A clinic that wants to partner with us has to email back and forth; once "partnered", they are a CMS row Staff maintain by hand. Partners have no way to see what their referrals earned, no reason to push for the next sale, and no self-serve way to update their own public profile. On our side, Staff have no attribution trail (who closed which sale?), no commission ledger, and no payout workflow — everything would be spreadsheets and trust. Interested partners can't sign up on their own, and existing partners can't see or grow their earnings.

## Solution

A self-serve **Partner Hub** at `/partner`, entered through the same storefront Sign in. A prospective partner applies with a short questionnaire, agrees to a versioned partner agreement, and waits for Staff approval. Once approved, the hub opens on a gamified **Milestone track** — a lifetime progress bar of pillows/bolsters sold, with rungs that grant cash bonuses, permanent rate bumps, and professional perks. Partners earn attributed sales three ways: sharing their unique referral link/QR, customers typing their code, or running a co-branded **partner-assisted customisation** for a client in their clinic. Every attributed sale shows a dated commission countdown (the return window); released money accumulates and Staff pay it out manually via PayNow/bank with an uploaded proof-of-payment the partner can see. Staff manage applications, per-partner commission schemes, and payouts from a dedicated Admin Panel page. The program is framed as retail/referral margin to the clinic entity with mandatory patient disclosure (AHPC-compliant), never a per-referral kickback to an individual clinician.

## User Stories

### Application & approval
1. As an interested clinic owner, I want to apply as a partner from the website on my own, so that I don't need an email back-and-forth to join.
2. As an applicant, I want a short questionnaire (company name, ACRA UEN, website/social, business category, contact person, WhatsApp mobile, business email, how I plan to introduce Mpillow), so that applying takes minutes.
3. As an applicant, I want to read the partner agreement and explicitly agree, so that I know the terms before committing; if I disagree, the "Become a Partner" button stays disabled.
4. As an applicant, I want to sign in with Google or an email code before applying, so that my application is tied to an account I can return with.
5. As an applicant with a pending application, I want an "under review" screen when I sign in, so that I know my status without emailing support.
6. As Staff, I want an application review queue in the Admin Panel showing every questionnaire answer, so that I can approve or reject with full context.
7. As Staff, I want approve/reject actions to notify the applicant by email, so that outcomes are communicated without manual mail.
8. As a rejected applicant, I want to see a rejected state when I sign in, so that I'm not left guessing.
9. As the business owner, I want the agreement to be a static versioned legal page with the agreed version + timestamp recorded on each application, so that I can prove which terms any partner accepted.
10. As the business owner, I want changed terms to force existing partners to re-accept the new version on next hub entry, so that everyone is always on current terms.

### Sign in & session
11. As a partner, I want to sign in through the same menu → Sign in flow as everyone else, so that there is one familiar door.
12. As a partner, I want passwordless email sign-in where the email contains both a 6-digit code and a magic link, so that I can enter the code on the device I'm already on.
13. As any user (customer, staff, partner), I want the upgraded code+link email, so that cross-device sign-in stops being awkward.
14. As a partner, I want my session to last up to 7 days before I must sign in again, so that security and convenience are balanced; the cap applies only to partner surfaces.
15. As a partner, I want to add one backup email (verified once by OTP), so that I can still sign in with the backup address when I lose access to my main inbox and land in the same account.
16. As a signed-in partner, I want the storefront menu pill to say "Partner Hub" and route to `/partner`, so that my surface is one tap away.
17. As a partner who is also a customer, I want to still reach `/account` and my orders directly, so that partnering doesn't lock me out of my purchase history (pill precedence Staff > Partner > Customer; access additive).

### Hub dashboard (gamified home)
18. As a partner, I want the first thing I see to be my milestone progress bar with "X pillows to your next reward", so that the next goal is always concrete (goal-gradient).
19. As a partner, I want my bar to start with 2 units credited labelled "launch partner bonus", so that I begin with visible progress and a stated reason (endowed progress).
20. As a partner, I want rungs (~5/15/40/100 lifetime units) that each grant a one-time bonus + a permanent per-unit rate bump + a professional perk, so that each milestone is a sprint with a lasting payoff.
21. As a partner, I want my tier to never drop, so that earned status feels safe (ratchet, no demotion).
22. As a partner, I want to see total commission earned, held vs released vs paid, so that my money position is always clear.
23. As a partner, I want each held commission to show the exact release date and amount ("releases 14 Aug — return window"), so that pending money is a countdown, not a mystery.
24. As a partner, I want to see the number of distinct customers I've referred (paid) plus an "in progress" pipeline line, so that momentum is visible before money lands.
25. As a partner, I want a "top N%" percentile chip instead of a leaderboard, so that I get social proof without being ranked against much bigger clinics.
26. As a partner, I want progress to move the moment an attributed sale is paid, so that feedback is instant; a refund later decrements it honestly.
27. As a partner, I want an occasional surprise gift when I cross a rung, so that there's delight without gambling on my actual commission.

### Referrals
28. As a partner, I want a unique referral code and shareable link + QR, so that I can post it on my social channels and print it in my clinic.
29. As a customer who clicked a partner link, I want the credit to survive for 30 days, so that my physio still gets credit when I decide next week.
30. As a customer, I want an optional "Partner / referral code" field on the customisation contact step and shop checkout, so that I can credit my clinic even if I arrived directly.
31. As a partner, I want attribution to go to whoever closed the sale — assisted session beats typed code beats last link — with no splits, so that credit matches reality.
32. As a partner, I want to see full customer details for referrals I entered myself (my own clients/walk-ins), so that I can verify my records.
33. As a customer referred by a link, I want my identity masked in the partner's hub, so that a business I only clicked a link from never sees my contact details (PDPA).
34. As Staff, I want to see all referral details unmasked in the Admin Panel, so that disputes can be resolved.

### Partner-assisted customisation
35. As a partner, I want a "Customise for a customer" button in my hub that opens the normal mp-config/mbolster-config flow with my attribution stamped, so that I never re-enter data into a second form.
36. As a partner running an assisted flow, I want the finish panel co-branded "[My clinic] × Mpillow" with my uploaded logo, so that my client sees our partnership (and the disclosure is made).
37. As a partner running an assisted flow, I want size recommendation only — no filling-template recommendation, no add-on cards, no cross-flow upsell — so that the flow stays focused on the commissionable pillow/bolster.
38. As a customer in a partner's clinic, I want to enter my own card for the authorization hold on the partner's device, so that my payment stays mine.

### Self-purchase
39. As a partner, I want to buy pillows in my own signed-in account at my negotiated partner rate, capped at a set number of units, so that I can stock demo/resale pillows affordably.
40. As the business owner, I want self-purchases excluded from milestone units, so that no one buys their way to a permanent rate bump.

### Profile & settings
41. As a partner, I want to edit my company name, logo, location, and write-up in hub settings, so that my public presence stays current; edits go live immediately and Staff are notified with one-click hide/revert.
42. As a partner, I want logo upload guidelines shown at upload (square, minimum size, format), so that my logo looks right on /our-partners and the co-branded flow.
43. As a partner, I want to upload my PayNow QR and/or bank details, so that payouts reach me without back-and-forth.
44. As a partner, I want a support entry that opens WhatsApp to Mpillow, so that help is one tap away.

### Payouts
45. As a partner, I want my accumulated released balance always visible, so that I know what's owed.
46. As Staff, I want a dedicated Admin "Partner commissions" page with a per-partner ledger (held/released/paid, countdowns, payment details incl. PayNow QR), so that payouts are worked from one place.
47. As Staff, I want to record a payout with an uploaded proof-of-payment image, so that the transfer is documented.
48. As a partner, I want to see payout status and the proof image in my hub, so that payment is fully transparent.
49. As a small partner, I want no minimum payout threshold, so that my first sale still pays out.
50. As Staff, I want a partner-source badge on attributed Orders rows, so that partner sales are recognisable in the normal Orders view without money workflows living there.

### Commission engine (behind the scenes)
51. As the business owner, I want a per-partner commission scheme (flat $ or % base, per product type, default + overrides) editable only in the Admin Panel, so that negotiated agreements are configurable and private.
52. As the business owner, I want commissions created held at capture, released exactly when the RMA return window closes (30 days after delivery, in-store handover counts as delivery), so that released money is irrevocable by construction.
53. As the business owner, I want an RMA refund to void that item's commission while exchange/replacement keep it, so that only reversed sales reverse money.
54. As the business owner, I want commission scoped to pillow/bolster units only — never add-ons, shipping, or tax — so that the program pays for what partners actually sell.

### Notifications
55. As a partner, I want emails for approval/rejection, "you just earned a referral", milestone reached, payout made (with proof), and terms re-acceptance, so that the program talks to me at the moments that matter.
56. As a partner with WhatsApp, I want to opt in to the same notifications via WhatsApp, so that they arrive where I live.
57. As any recipient of Mpillow utility email (customer or partner), I want properly styled branded HTML emails, so that every transactional touch looks professional.

### Compliance
58. As the business owner, I want the program framed as retail/referral margin to the ACRA-registered clinic entity with a patient-disclosure clause in the agreement, so that registered AHP partners stay compliant with AHPC §5.7/§5.7.1.
59. As a registered physio partner, I want the co-branded assist flow to double as patient-facing disclosure, so that compliance happens in the flow, not in fine print.

## Implementation Decisions

- **Identity**: a `partner_users` table (mirroring the `admin_users` pattern) links auth users to a `type='partner'` row in the existing `partners` table — the Location aggregate from ADR 0012. One aggregate: hub profile edits write to the same row that powers `/our-partners`, the booking picker, and `Result.location_id`. Approved signup creates the row with `visible=false` until Staff flip it.
- **Roles**: role resolution stays post-session at the shared Sign in. Dock pill precedence Staff > Partner > Customer; access is additive. Partner surfaces guarded by a partner context helper (mirrors the admin guard), which also enforces the 7-day absolute session cap via last-sign-in check — no change to global Supabase session settings.
- **Auth**: the shared passwordless email upgrades to carry both a 6-digit OTP code and the magic link (one template, `verifyOtp` code path added to the shared login form). Google OAuth unchanged. Backup email = a second verified sign-in identity mapped to the same Partner account; no custom recovery bridge, no server-minted sessions.
- **Application**: 8-field questionnaire + static versioned agreement page (repo i18n legal copy); `agreed_version` + timestamp recorded. Status machine `pending → approved | rejected` in a partner-application module. Manual ACRA/website verification by Staff; no ACRA API.
- **Attribution (ADR 0015)**: one Referral per Order, never split. Priority: partner-assisted session > typed code > most recent `?ref` link within 30 days (last-touch). The referral stamp rides the existing first-party journey rail on the Visitor, is carried onto the Result at hold and the Order at capture. Typed-code fields live on the customisation contact step (both configurators) and shop checkout, validated inline against active partner codes.
- **Commission ledger (ADR 0015)**: `held → released → paid | void`; created at capture; released when the RMA Return window closes (30 days after `delivered_at`; in-store handover sets `delivered_at`); RMA refund voids the item's commission, exchange/replacement keep it. Scope: pillow/bolster units only. Per-partner Commission scheme (flat $ or % base, per product, default + override) edited only in the Admin Panel. Partner self-purchase = capped admin-set discount in the partner's own account; earns no commission and no milestone credit.
- **Milestone track**: pure computation from unit events — credit at capture, decrement on void, endowed +2 with stated reason, geometric rungs (~5/15/40/100, admin-tunable), each rung = one-time bonus + permanent rate bump (ratchet) + non-cash perk; percentile chip, no leaderboards, no streaks, no resets.
- **Payouts**: manual only. Staff work a dedicated Admin "Partner commissions" page (ledger, payment details incl. PayNow QR image, application queue nearby); payout rows record amount/date/method plus a Staff-uploaded proof-of-payment image that the partner sees in the hub. No minimum threshold. Orders table gets a partner-source badge only.
- **Partner-assisted customisation**: the existing configurators launched from the hub with partner context — no duplicated form. Size-only recommendation (no filling-template surface), add-ons and cross-flow upsell hidden, co-branded finish panel with partner logo. Customer enters their own card for the Authorization hold. Explicitly not Staff assist mode: no x-ray editors.
- **Storage**: PayNow QR and proof-of-payment images go to private storage (service-role access; not the Media Asset DAM), following the reference-photos precedent. Partner logos continue through the existing partners-row media path.
- **Email**: partner notification set rides the existing transport layer; a shared styled-HTML base template is introduced and applied to all outbound utility email (customers and partners). WhatsApp notifications are per-partner opt-in via the existing Cloud API integration (template approvals required).
- **Compliance framing**: all partner-facing copy says margin/partner program to the business entity; agreement carries the patient-disclosure clause. No per-referral payment language aimed at individuals.

## Testing Decisions

- Tests assert **external behavior only** — inputs → outcomes on the module's public interface (state transitions, resolved attributions, computed balances, rung crossings), never internal storage shapes or call order.
- Modules under test (all five deep lib modules): partner-auth (context resolution, role precedence, 7-day cap, backup-email identity), referrals (code validation, precedence resolution, 30-day window, last-touch overwrite), commissions (lifecycle transitions, release clock vs return window, refund-void vs exchange-keep, scheme resolution, payout accumulation), milestones (credit/decrement, endowed start, rung detection, ratchet), partner-application (status machine, agreement versioning, re-accept trigger).
- Prior art: the RMA pure `canTransition` suites and the locations/booking lib suites (vitest, `lib/**/__tests__`).
- **Process rule (owner directive): test suites are authored by a separate agent from the one that implements the module** — implementation and tests must not share an author, so tests encode the spec, not the implementation's assumptions.

## Out of Scope

- Automated disbursement rails (PayNow corporate API / PSP integration) — payouts stay manual with proof.
- ACRA API verification — Staff eyeball UEN/website in v1.
- Leaderboards, streaks, periodic/resetting challenges, points-with-expiry — rejected by research; time-boxed challenges may layer on later.
- Split/multi-partner commission on one Order.
- A two-track (cash vs non-cash) program structure — one program, clinic-margin framed.
- Draft/published moderation for partner profile edits — edits go live with Staff notify + revert.
- Partner access to Staff assist mode, x-ray filling editors, or filling-template recommendations.
- Multi-seat partner accounts (multiple team logins per clinic) — one identity + one backup email in v1.
- CMS editing of the partner agreement — static versioned legal page only.
- Commission on add-ons, accessories, shipping, or tax.

## Further Notes

- **AHPC constraint is load-bearing**: registered allied health professionals must not have product recommendations influenced by rewards (§5.7) and must disclose financial interest (§5.7.1). The clinic-margin framing + mandatory disclosure clause is the design's compliance posture; legal copy for the agreement needs owner/lawyer authoring and must include that clause.
- **Open launch values** (admin-tunable; needed before go-live, not before build): exact rung unit counts, bonus amounts, rate-bump sizes, default commission scheme values, self-purchase discount + cap defaults, logo guideline numbers.
- Incentive-psychology research (Kivetz goal-gradient; Nunes & Drèze endowed progress; Wagner no-demotion; leaderboard demotivation at small N) is summarised in the Milestone track glossary entry — the dashboard should always show "X to next reward" and never show undated pending money.
- Migrations follow the repo's additive, prod-safe convention (`supabase db push` goes straight to prod; no staging) — all new tables/columns must be invisible to deployed code until the feature deploys.
