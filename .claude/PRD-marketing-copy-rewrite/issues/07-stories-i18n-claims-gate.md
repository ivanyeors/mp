# Slice 07 — Stories chrome → i18n + claim/SEO self-check

Type: AFK
Parent: PRD `marketing-copy-rewrite` (`.claude/PRD-marketing-copy-rewrite/marketing-copy-rewrite-prd.md`)
Triage: needs-triage
User stories covered: 33, 38–39

## What to build

- Move Stories section hardcoded EN title/subtitle into en-US i18n with Science of Sleep / Singapore customers / neck comfort framing per canvas.
- Add a small claims/SEO self-check (assert style, prior art `lib/seo/seo.check.ts`) over rewritten SEO-flagged strings: banned clinical verbs absent; hero Answer lede length band; sample Singapore/cervical intent present; llms.txt still contains Science of Sleep (regression).

## Acceptance criteria

- [x] Stories title/subtitle come from i18n messages (en-US).
- [x] Self-check script fails if treat/cure/prescribe/rehab appear in gated string list.
- [x] Self-check fails if hero seoAnswer leaves the ~60–120 word band.
- [x] Self-check confirms llms index still includes Science of Sleep.
- [x] Check is runnable locally (e.g. `tsx …check.ts`) without a new test framework.

**Helper:** `lib/i18n/assert-marketing-copy-safe.ts` → `assertMarketingCopySafe`.

**Proof:** `npx tsx lib/i18n/marketing-copy-slice-07.check.ts`

## Blocked by

- Slice 01 — Hero + Affluent Pain home stack
- Slice 02 — Neck Pains + Cervical Tech Neck section
- Slice 03 — Mbolster Families weave
