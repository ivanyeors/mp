# Slice 09 — Health-fact check by a partner physiotherapist (D3)

Type: HITL
Parent: PRD `guides-content`
Triage: ready

## Rule this follows

AHPC Code of Professional Conduct 5.7.2: a registrant may take part in "educational websites sponsored by companies marketing healthcare … products". Their "participation does not occur in such a way as to appear to endorse such products, or persuade patients or members of the public to use the products", and "All potential conflicts of interest should be declared to the audience." Partner clinics earn Commission on referrals, so the conflict is declared.

## What to build

1. **Ask.** The owner asks one partner physio, using the brief in `media-plan.md` §3. They check only the health sections of each guide: causes, what the evidence shows, sleep positions, and "see a doctor" signs. They do not check the product sections, prices or claims about Mpillow.
2. **Record.** Store their tracked changes and a written OK with the date, per guide, in `.claude/PRD-guides-content/reviews/<topic>-<date>.md`. A forwarded email is enough.
3. **Credit.** Fill the guide's frontmatter `reviewer` block (name, role "Physiotherapist", clinic, relationship text, `lastReviewed`). The "About this guide" box renders:

   > Health information checked by <Name>, physiotherapist (AHPC-registered), <Clinic>. <Clinic> is an Mpillow partner clinic and earns a commission on referrals. They checked the health facts in this guide; they do not endorse any product.

4. **Keep it off the funnel.** No reviewer name or photo in ads, on product pages, in social posts or next to a button. The byline row stays "By the Mpillow fitting team".
5. **Re-check.** When a health section changes, `lastReviewed` no longer covers the new version. The check flags it until the physio re-checks or the credit is removed.

**Fallback.** If no partner will be named with the commission declared, the owner may pay an independent physio a flat fee, with the same box and "was paid a fee for this check" as the declared interest. Otherwise there is no named reviewer, and the guides stay "Mpillow fitting team".

## Acceptance criteria

- [ ] A written OK with a date is stored for each credited guide.
- [ ] JSON-LD `reviewedBy` appears only on guides with a stored OK. `pnpm checks guides` fails if a guide's frontmatter `reviewer` has no matching file in `reviews/`.
- [ ] Preview shows the credit only in "About this guide".

## Blocked by

Slices 03, 04, 05
