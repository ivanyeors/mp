# 06 — Exclude Segments from an Audience

**Issue:** not filed
**Type:** AFK
**Status:** built 2026-10-31 (`20261031144834_email_campaign_exclusions.sql`; applied to production 2026-10-31)
**Blocked by:** none
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`, `area:email`

## Goal

An Audience can say "but not these". The demo: *Pillow owners* except *Bought in the last 14
days* and *Staff and test accounts*; *Check who it goes to* lists 31 left out by the exclusions.

## What to build

- `email_campaigns.exclude_segment_ids uuid[]` (at most 3), under the lock trigger with the
  Audience, so the first Wave fixes it.
- The editor's Audience step: *Leave out people in…*, choosing Segments.
- `readCampaignCandidates` resolves each excluded Segment through `resolveSegment` and drops those
  ids before `planCampaignWave`. An excluded Segment that is archived or needs review refuses the
  Wave by name (never widened, as `resolveSegment` already refuses).
- The plan's *who is left out, and why* gains *In "<Segment>"*.
- Works with every Audience, *Everyone subscribed* included.

## As built

- **The column** is `exclude_segment_ids uuid[]`, default empty: at most 3 and no nulls (a check),
  never the Segment the campaign is sent to (the check), each once and each an existing Segment
  when written (a trigger: a check cannot hold a subquery). The lock trigger refuses a change
  after the first Wave, with the Audience.
- **Where the ids are dropped:** in `planWave` (`lib/email-campaigns/sender.ts`), not inside
  `readCampaignCandidates`, so the plan can say how many each Segment took: the audience is read,
  then `excludeSegmentMembers` (`lib/email-campaigns/rules.ts`, pure) drops anyone a left-out
  Segment chooses, before `planCampaignWave`. Someone in two counts once, against the first.
- **Refusal by name:** the wave action reads each left-out Segment's name and wraps
  `resolveSegment`, so an archived one answers *It leaves out "Staff and test accounts", which
  cannot be used: This Segment is archived.* A Segment deleted by hand reads as *a Segment that no
  longer exists*.
- **The editor:** *Leave out people in…* under *Send to*, as chips with ×, and a picker of the
  Segments not already chosen and not the one it is sent to. Locked, the chips stay and the ×
  and picker go. The plan lists *N left out: in "Segment"* first, then the rule's reasons, and
  the send confirmation names them.
- Batches re-check consent and suppression at each send, as before; Segment membership, sent to
  or left out, is decided when the Wave is planned.

## Acceptance criteria

- [x] An exclusion can only narrow: a test proves no id is added (`excludeSegmentMembers` over
      200 drawn combinations in `lib/email-campaigns/__tests__/rules.test.ts`).
- [x] Changing exclusions after the first Wave is refused, as the Audience is
      (`supabase/tests/campaign-audiences/assert-06-exclusions.sql`).
