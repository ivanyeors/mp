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

- [ ] Unit tests for the classifier (positive and negative hosts, UTM override)
- [ ] AI assistant sessions and orders shown for any range since Jul 2026
- [ ] Tooltip notes that referrer-less AI visits count as Direct (the channel is a floor)

## Blocked by

None
