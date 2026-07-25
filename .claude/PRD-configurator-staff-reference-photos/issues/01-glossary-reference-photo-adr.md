# 01 — Glossary + ADR: Reference photo, Sizing photo, Customisation session

Labels: `needs-triage`

## Parent

[PRD — Staff reference-photo upload for the customisation forms](../configurator-staff-reference-photos-prd.md)

## What to build

Establish the shared language and the hard-to-reverse decisions the rest of the PRD depends
on, so the storage model and the bolster session approach are signed off before code.

- Add a **Reference photo** term to `CONTEXT.md`: staff-uploaded imagery attached to a
  **Customisation session**, stored in `config_upload`. `_Avoid_`: conflating with the
  customer **Sizing photo**.
- Add / amend a **Sizing photo** term: the customer's front/side photos
  (`mp_config_response_photos`, data URLs, Telegram). Cross-link to **Reference photo**.
- Add a **Customisation session** term: the id reference photos hang off — the **Mpillow**
  `responseId`, or the **Mbolster** session UUID that is reused as `responseId` at hold, so
  the **Result** id equals the session id for both products.
- Write an ADR recording the two decisions: (1) reference photos are stored in the `media`
  bucket but **bypass the Media Asset library / DAM** (privacy + clutter) vs. reusing
  `ingestImageAsset`; (2) one shared `session_id` where **Mbolster** reuses `responseId` vs.
  giving bolster its own response record or adding a join column. Note the privacy nuance
  (public bucket, unguessable URL, not DAM-listed).

## Acceptance criteria

- [ ] `CONTEXT.md` defines **Reference photo**, **Sizing photo**, and **Customisation session**, cross-linked
- [ ] The customer **Sizing photo** entry makes clear it is a separate, untouched feature
- [ ] `docs/adr/00NN-config-reference-photos.md` exists recording the DAM-bypass and shared-`session_id` trade-offs
- [ ] Human sign-off on the terminology and the ADR (HITL)

## Blocked by

None - can start immediately
