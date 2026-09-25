# Slice 12 — Review-backed sections on guides and consolidated posts

Type: AFK
Parent: PRD `search-visibility` (`.claude/PRD-search-visibility/search-visibility-prd.md`)
Triage: needs-triage
User stories covered: 32

## What to build

- Server component that selects approved reviews (DB + Google Places) matching a topic tag (neck pain, side sleeper, bolster, …)
- Render 3–5 quotes with first name/initial and date on `/guides/*` and consolidated posts
- Never mark up third-party (Google) reviews as `Review` JSON-LD on our pages

## Acceptance criteria

- [ ] Only approved reviews shown
- [ ] Topic tagging falls back gracefully when fewer than 3 matches exist

## Blocked by

None
