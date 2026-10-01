# Slice 03 — AI referral channel + channel mix + conversion join

Type: AFK
Parent: PRD `search-visibility` (`.claude/PRD-search-visibility/search-visibility-prd.md`)
Triage: needs-triage
User stories covered: 8, 9, 16

## What to build

- `lib/analytics/ai-referrers.ts`: a single table of AI assistant referrer hosts (chatgpt.com, chat.openai.com, perplexity.ai, gemini.google.com, copilot.microsoft.com, edgeservices.bing.com, claude.ai, chat.deepseek.com, grok.com, meta.ai, …) plus `utm_source=chatgpt.com`
- Channel classifier over `analytics_visits` (Organic search, AI assistant, Direct, Referral, Paid, Social); classify at read time so history back to Jul 2026 is covered
- Stacked-area channel mix over time in the visibility section
- Funnel table per channel: visits → mp-config start → Result submitted → Order (reuse `lib/analytics/journey/aggregates.ts`)

## Acceptance criteria

- [x] Unit tests for the classifier (positive and negative hosts, UTM override)
- [x] AI assistant sessions and orders shown for any range since Jul 2026
- [x] Footnote states that referrer-less AI visits count as Direct (the channel is a floor)

## Blocked by

None

## Implementation notes

- The funnel is visits → configurator visit (page view on mp-config / mbolster-config) → paid Order (`converted_order_id`, last touch). Visits do not link to **Results**, so a "Result submitted" step needs that link first; it is left out, not faked.
- Visits are dated by Singapore calendar day.
- The chart uses its own validated 5-colour palette. The site's `--chart-*` tokens fail as a categorical set: chart-4 and chart-5 differ by only ΔE 7.4.
