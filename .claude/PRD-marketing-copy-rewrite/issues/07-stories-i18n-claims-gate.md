# Slice 07 — Stories chrome → i18n + claim/SEO self-check

Type: AFK
Parent: PRD `marketing-copy-rewrite` (`.claude/PRD-marketing-copy-rewrite/marketing-copy-rewrite-prd.md`)
Triage: needs-triage
User stories covered: 33, 38–39

## What to build

- Move Stories section hardcoded EN title/subtitle into en-US i18n with Science of Sleep / Singapore customers / neck comfort framing per canvas.
- Add a small claims/SEO self-check (assert style, prior art `lib/seo/seo.check.ts`) over rewritten SEO-flagged strings: banned clinical verbs absent; hero Answer lede length band; sample Singapore/cervical intent present; llms.txt still contains Science of Sleep (regression).

## Acceptance criteria

- [ ] Stories title/subtitle come from i18n messages (en-US).
- [ ] Self-check script fails if treat/cure/prescribe/rehab appear in gated string list.
- [ ] Self-check fails if hero seoAnswer leaves the ~60–120 word band.
- [ ] Self-check confirms llms index still includes Science of Sleep.
- [ ] Check is runnable locally (e.g. `tsx …check.ts`) without a new test framework.

## Blocked by

- Slice 01 — Hero + Affluent Pain home stack
- Slice 02 — Neck Pains + Cervical Tech Neck section
- Slice 03 — Mbolster Families weave
