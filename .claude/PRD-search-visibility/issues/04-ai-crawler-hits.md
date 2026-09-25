# Slice 04 — AI crawler hit logging

Type: AFK
Parent: PRD `search-visibility` (`.claude/PRD-search-visibility/search-visibility-prd.md`)
Triage: needs-triage
User stories covered: 10, 11

## What to build

- `lib/analytics/ai-crawlers.ts`: user-agent → `{ bot, operator, purpose: training | search | user_fetch }`
- `proxy.ts`: on a match, fire-and-forget increment into an in-memory/edge buffer flushed to `ai_crawler_hits` daily rollups `(date, bot, path_group, hits)`. Must never await the DB on the request path.
- Path groups: home, mp-config, mbolster-config, guides, blog, shop/PDP, faq, llms.txt, other
- Tile + stacked bar by bot over time; separate count for `/llms.txt`

## Acceptance criteria

- [ ] p95 latency of `proxy.ts` unchanged within noise (measure before/after)
- [ ] Classifier tests for GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, PerplexityBot, Perplexity-User, Bingbot, Googlebot
- [ ] Browser UAs never recorded

## Blocked by

None
