# 01 — Glossary and ADR

**Issue:** not filed
**Type:** AFK, then HITL (the owner settles decisions 1–3 first)
**Status:** not started
**Blocked by:** owner decisions 1, 2 and 3
**Labels:** `documentation`, `needs-triage`, `P2`, `area:email`

## Goal

The words and the rule are fixed before any code, so the slices cannot drift into two meanings of
"engaged" or two places that decide who may be emailed.

## What to build

- **`CONTEXT.md`**, under *Email marketing*: **Consent source**, **Rest period**, **Exclusion**,
  **Campaign click**, **Kept sending**, **Unengaged** (wording in the PRD's
  [Glossary](../campaign-audiences-prd.md#glossary-slice-01)); the **Audience** entry amended;
  the **Customer** entry amended if owner decision 6 is yes.
- **ADR 0037 — campaign audiences read the CRM; one claim rule decides.** Records the PRD's
  decisions 1–7, the owner's answers to decisions 1–3, and that `PRD-crm-retention-loop`
  decision 6 (Playbooks are not automation) is superseded by Kept sending.
- `docs/data-flows/`: a short page on where Marketing consent is written (every Consent source
  and its route).

## Acceptance criteria

- [ ] Every term above has an *Avoid* line.
- [ ] The ADR names `marketing_campaign_blocker()` as the only place a send is refused.
