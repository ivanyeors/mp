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

- [x] Only approved store reviews (rating ≥ 4) and Google reviews passing the existing display filter
- [x] Shows however many on-topic matches exist (up to 4) and hides the section at zero. It never pads with off-topic reviews.

## Blocked by

None

## Implementation notes

- Keyword matching per guide topic (`lib/seo/topic-reviews.ts`, tested). Names are shortened to first name + last initial.
- The guides route renders per request, so the loader is wrapped in `unstable_cache` with a 1-hour revalidate. It fails soft: no quotes, never an error.
- Consolidated blog posts (slice 10) can reuse `getTopicReviews` once they exist.
