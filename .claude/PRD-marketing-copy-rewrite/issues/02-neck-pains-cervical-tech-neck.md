# Slice 02 — Neck Pains + Cervical Tech Neck section

Type: AFK
Parent: PRD `marketing-copy-rewrite` (`.claude/PRD-marketing-copy-rewrite/marketing-copy-rewrite-prd.md`)
Triage: needs-triage
User stories covered: 16–21, 36, 41

## What to build

Tech Neck weave on existing surfaces only:

- Rewrite `home.neckPains` title/description to name sleep vs desk / screen-day overnight alignment.
- Fill `slides.cervicalNeckSupport.heroDescription` with AEO-safe cervical / screen days / Singapore copy.
- **Add** a new section inside the Cervical Neck Support learn-more slide-in: “Built for tech-neck days, recovered at night” (claim-safe support/align language). Wire via product-slide-sections config + new i18n keys.
- Confirm mobile Neck Pains still shows feel card + Learn More (layout already patched).

No new routes. No treat/cure language.

## Acceptance criteria

- [ ] Neck Pains title/description mention desk/device or tech-neck strain and path into cervical support.
- [ ] Cervical slide-in heroDescription is non-empty and claim-safe.
- [ ] New Tech Neck section renders in Cervical Neck Support learn-more between existing sections (order documented in PR).
- [ ] Banned clinical verbs (prescribe/treat/cure/rehab) absent from new copy.
- [ ] `openCervicalNeckSupportSheet` / Back footer behavior unchanged.
- [ ] Mobile Learn More path still reachable.

## Blocked by

None - can start immediately
