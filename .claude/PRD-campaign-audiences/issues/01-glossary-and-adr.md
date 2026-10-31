# 01 — Glossary and ADR

**Issue:** not filed
**Type:** AFK
**Status:** **built** (2026-10-31). **Consent source** and ADR 0037 landed with slice 15; the
rest with slice 02's boxes
**Blocked by:** none (owner decisions settled 2026-10-31)
**Labels:** `documentation`, `needs-triage`, `P2`, `area:email`

## Goal

The words and the rule are fixed before any code, so the slices cannot drift into two meanings of
"engaged" or two places that decide who may be emailed.

## What to build

- **`CONTEXT.md`**, under *Email marketing*: **Rest period**, **Exclusion**,
  **Campaign click**, **Kept sending**, **Unengaged** (wording in the PRD's
  [Glossary](../campaign-audiences-prd.md#glossary-slice-01)); the **Audience** entry amended;
  the **Customer** entry amended: a Customer is also created by confirming the sign-up (owner
  decision 6, yes). **Consent source** is already there (ADR 0037).
- **ADR 0038 — campaign audiences read the CRM; one claim rule decides.** Records the PRD's
  decisions 1–7, the owner's answers to decisions 2–4, and that `PRD-crm-retention-loop`
  decision 6 (Playbooks are not automation) is superseded by Kept sending. ADR 0037 already
  records decision 1 (consent by default).
- `docs/data-flows/`: a short page on where Marketing consent is written (every Consent source
  and its route).

## As built

- `CONTEXT.md`, *Email marketing*: **Exclusion**, **Rest period**, **Campaign click**, **Kept
  sending**, **Unengaged**, each with an *Avoid* line. **Audience** now reads "minus its
  Exclusions; the Rest period and the sunset rule narrow it at every send, as consent does".
  **Customer** is also created by a ticked box on a customisation or a booking, and (slice 03) by
  confirming the sign-up; one who has bought nothing is a *Lead*. **Consent source** and
  **Marketing consent** name the two new boxes.
- [ADR 0038](../../../docs/adr/0038-campaign-audiences-read-the-crm.md): decisions 1 to 7, the
  owner's answers, and that it supersedes retention decision 6 for kept-sending campaigns only.
- [`docs/data-flows/marketing-consent.md`](../../../docs/data-flows/marketing-consent.md): every
  Consent source, where it is written, and what each box does.

## Acceptance criteria

- [x] Every term above has an *Avoid* line.
- [x] The ADR names `marketing_campaign_blocker()` as the only place a send is refused.
