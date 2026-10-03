# Slice 11 — Singapore pillow fit report (first-party data)

Type: HITL
Parent: PRD `search-visibility` (`.claude/PRD-search-visibility/search-visibility-prd.md`)
Triage: needs-triage
User stories covered: 29, 30, 31

## What to build

- `lib/seo-content/fit-report.ts`: aggregates over Results and `mp_config_responses` (sleep position mix, neck/shoulder pain share, chosen height/filling by sleep position, size distribution), suppressing any bucket with n < k (default k = 20)
- Page `/[lang]/guides/pillow-fit-report` (or `/research/…`): answer lede, headline stats, charts, methodology, update date, `Dataset` + `Article` JSON-LD
- Refreshed quarterly; each refresh logged as an annotation
- HITL: privacy review of fields and thresholds; copy review

## Acceptance criteria

- [ ] No bucket below k is rendered or present in page source/JSON-LD
- [ ] The methodology section states sample size and date range
- [ ] Linked from llms.txt, related guides and consolidated posts

## Blocked by

None
