# 06 — Exclude Segments from an Audience

**Issue:** not filed
**Type:** AFK
**Status:** not started
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

## Acceptance criteria

- [ ] An exclusion can only narrow: a test proves no id is added.
- [ ] Changing exclusions after the first Wave is refused, as the Audience is.
