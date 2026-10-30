# 13 — Later: topics and "fewer emails"

**Issue:** not filed
**Type:** HITL (owner decision 7), then AFK
**Status:** specified, not scheduled
**Blocked by:** three months of unsubscribe reasons (`PRD-crm-retention-loop` slice 11)
**Labels:** `enhancement`, `needs-triage`, `P3`, `area:email`

## Goal

A customer can choose less instead of nothing. Built only if *Too many emails* or *Not relevant
to me* lead the unsubscribe reasons.

## Sketch

- **Topics**, two or three, from code: *New products*, *Care tips and guides*, *Offers*. Each
  campaign picks one. A subscribed Customer receives all by default and can turn any off on the
  Profile.
- **Fewer emails**: at most one marketing email a month, a per-Customer rest period (slice 07).
- **On the unsubscribe page**, *after* the unsubscribe has taken effect, the same choices offered
  as "or keep only…". The one-click unsubscribe (RFC 8058) stays everything, at once, with no
  page.
- The claim rule checks the topic, in SQL, as everything else.
- `CONTEXT.md`: Marketing consent gains topics; ADR amended. Counsel checks that a topic choice is
  recorded as consent per topic.
- Never Resend Topics: consent stays in our database only.
