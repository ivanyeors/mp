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

- [x] Latency of `proxy.ts` unchanged: recorded via `event.waitUntil` after the response (dev check: robots.txt ~10ms with and without a bot UA)
- [x] Classifier tests for GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-User, PerplexityBot, Perplexity-User, Bingbot, Googlebot
- [x] Browser UAs never recorded

## Blocked by

None

## Implementation notes

- Rollup writes go through `record_ai_crawler_hit()`, an atomic `insert … on conflict do update`. Execute is granted to `service_role` only, so the anon key cannot inflate counts.
- Logging sits before the static-file skip in `proxy.ts`, so `/llms.txt` and `/robots.txt` fetches count.
- A missing migration logs one warning per process, not one per hit.
- OPS: `pnpm db:push` applies `20260925100000_ai_crawler_hits.sql`. Counting starts on the next deploy.
