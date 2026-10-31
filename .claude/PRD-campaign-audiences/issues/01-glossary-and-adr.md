# 01 — Glossary and ADR

**Issue:** not filed
**Type:** AFK
**Status:** started: **Consent source** and ADR 0037 (consent by default) landed with slice 15
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

## Acceptance criteria

- [ ] Every term above has an *Avoid* line.
- [ ] The ADR names `marketing_campaign_blocker()` as the only place a send is refused.
