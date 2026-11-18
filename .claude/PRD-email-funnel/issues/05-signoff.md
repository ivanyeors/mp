# 05 — Sign-off: the owner approves the Lead Playbook's words and walks the page

**Type:** HITL
**Status:** not started
**Blocked by:** 03, 04

## For the owner

1. **Read *How your pillow is made*** (`playbook_how_its_made` in
   `lib/email-campaigns/starters.ts`). Approve it, change it, or drop it. Approved, its id goes
   into `APPROVED_PLAYBOOKS` and the funnel's Lead step reads *Not set up* instead of *Words
   waiting for the owner*.
2. **Walk the page on production**: each stage's Segments, Email flow and Results against what
   you expect to be running.
3. **Decide what runs.** Each *Not set up* Playbook: set it up, send the first Wave, turn on
   *Keep sending*; or leave it.

## Acceptance criteria

- [ ] The owner's decision on the Lead Playbook's words is recorded here with its date.
- [ ] The owner has opened every stage on production.
