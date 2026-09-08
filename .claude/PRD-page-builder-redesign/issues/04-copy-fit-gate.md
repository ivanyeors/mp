# Slice 04 — Copy-fit gate: wire the existing validator to the write path + live meters

Type: AFK
Parent: PRD `page-builder-redesign` (`.claude/PRD-page-builder-redesign/page-builder-redesign-prd.md`)
Triage: needs-triage
User stories covered: 18–21

## What to build

`CONTEXT.md` defines hard **Copy fit** bands for the home hero and calls them
non-negotiable — headline word and character caps, **Answer lede** word range, blurb caps —
plus a banned-clinical-claims list. A validator implementing exactly those bands already
exists in the repo and is already used by the marketing-copy checks.

It only ever runs over i18n literals. The string that actually ships on the homepage is the
CMS override, and that path has no validation at all: a 300-character headline, or copy
claiming to "treat" or "cure", saves cleanly and goes live.

Wire the existing validator to the write path. Do not write a second one — one gate, two
sources of copy, so the two cannot drift.

Two halves:

- **Server.** On save, validate hero copy fields against the bands and the banned-claims
  list, and reject with a message naming the field, the band, and what the submitted value
  measured. Rejection must be actionable ("headline is 71 characters, limit is 55"), not a
  generic 400.
- **Client.** Show a live character or word count against the band beside the field while
  typing, so **Staff** compress before saving rather than after being refused. The meter is
  advisory below the limit and clearly over-limit above it.

Bands are per-locale where the source defines them per-locale; where a band is defined for
`en-US` only, apply it to `en-US` and leave other locales unvalidated rather than inventing
limits for a language the source does not cover.

Demoable outcome: pasting a long headline into the hero shows the meter going over-limit
while typing, and saving it is refused with a message saying by how much.

## Acceptance criteria

- [ ] The existing marketing-copy validator is called from the section save path; no second implementation of the bands exists.
- [ ] Hero copy exceeding a **Copy fit** band is rejected on save.
- [ ] A rejection message names the field, the band and the measured value.
- [ ] Copy containing a banned clinical term is rejected on save.
- [ ] Copy inside the bands saves unchanged.
- [ ] Bands defined for `en-US` only are not applied to other locales.
- [ ] The inspector shows a live character or word count against the band for each governed field, marked clearly when over.
- [ ] Vitest covers: in-band pass, over-length headline, out-of-range lede, banned term, and that both entry points give the same verdict for the same input.
- [ ] `pnpm ci` passes.

Proof: `npx tsx --env-file=.env.local lib/landing-sections/copy-fit.check.ts` → `landing-copy-fit self-check ok`

## Blocked by

- Slice 03 (validation runs per-locale, so locale resolution lands first)
