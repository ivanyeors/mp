/**
 * AI crawler detection by user agent (slice 04, PRD-search-visibility).
 *
 * Crawling precedes citation: a rise in OAI-SearchBot / PerplexityBot fetches is
 * the earliest sign a page is entering AI answers. User agents are not verified
 * against published IP ranges, so treat counts as indicative; spoofed bots are
 * rare on a small site and would inflate, not hide, activity.
 */

export type CrawlerPurpose = "training" | "ai_search" | "user_fetch" | "search_engine";

export type Crawler = { bot: string; operator: string; purpose: CrawlerPurpose };

/** Lower-cased UA substring → crawler. More specific tokens first. */
const CRAWLERS: [token: string, crawler: Crawler][] = [
  ["oai-searchbot", { bot: "OAI-SearchBot", operator: "OpenAI", purpose: "ai_search" }],
  ["chatgpt-user", { bot: "ChatGPT-User", operator: "OpenAI", purpose: "user_fetch" }],
  ["gptbot", { bot: "GPTBot", operator: "OpenAI", purpose: "training" }],
  ["claude-searchbot", { bot: "Claude-SearchBot", operator: "Anthropic", purpose: "ai_search" }],
  ["claude-user", { bot: "Claude-User", operator: "Anthropic", purpose: "user_fetch" }],
  ["claudebot", { bot: "ClaudeBot", operator: "Anthropic", purpose: "training" }],
  ["anthropic-ai", { bot: "anthropic-ai", operator: "Anthropic", purpose: "training" }],
  ["perplexity-user", { bot: "Perplexity-User", operator: "Perplexity", purpose: "user_fetch" }],
  ["perplexitybot", { bot: "PerplexityBot", operator: "Perplexity", purpose: "ai_search" }],
  ["mistralai-user", { bot: "MistralAI-User", operator: "Mistral", purpose: "user_fetch" }],
  ["duckassistbot", { bot: "DuckAssistBot", operator: "DuckDuckGo", purpose: "ai_search" }],
  ["meta-externalfetcher", { bot: "Meta-ExternalFetcher", operator: "Meta", purpose: "user_fetch" }],
  ["meta-externalagent", { bot: "Meta-ExternalAgent", operator: "Meta", purpose: "training" }],
  ["bytespider", { bot: "Bytespider", operator: "ByteDance", purpose: "training" }],
  ["ccbot", { bot: "CCBot", operator: "Common Crawl", purpose: "training" }],
  ["amazonbot", { bot: "Amazonbot", operator: "Amazon", purpose: "ai_search" }],
  ["applebot", { bot: "Applebot", operator: "Apple", purpose: "search_engine" }],
  ["cohere-ai", { bot: "cohere-ai", operator: "Cohere", purpose: "training" }],
  ["youbot", { bot: "YouBot", operator: "You.com", purpose: "ai_search" }],
  // Classic search engines, recorded for comparison.
  ["googlebot", { bot: "Googlebot", operator: "Google", purpose: "search_engine" }],
  ["bingbot", { bot: "Bingbot", operator: "Microsoft", purpose: "search_engine" }],
];

const BY_BOT = new Map(CRAWLERS.map(([, c]) => [c.bot, c]));

export function classifyCrawler(userAgent: string | null | undefined): Crawler | null {
  const ua = userAgent?.toLowerCase();
  if (!ua) return null;
  return CRAWLERS.find(([token]) => ua.includes(token))?.[1] ?? null;
}

export function crawlerByName(bot: string): Crawler | null {
  return BY_BOT.get(bot) ?? null;
}

/** Coarse page groups, so the table stays small and the dashboard readable. */
export function crawlerPathGroup(pathname: string): string {
  const p = pathname.replace(/^\/(en-US|zh-CN)(?=\/|$)/, "") || "/";
  if (p === "/") return "home";
  if (p === "/llms.txt" || p.startsWith("/llms")) return "llms.txt";
  if (p === "/robots.txt") return "robots.txt";
  if (p.startsWith("/sitemap")) return "sitemap";
  for (const group of ["mp-config", "mbolster-config", "guides", "blog", "shop", "faq"]) {
    if (p === `/${group}` || p.startsWith(`/${group}/`)) return group;
  }
  if (p.startsWith("/products")) return "shop";
  return "other";
}

/** Calendar date in Singapore (UTC+8, no DST). */
function singaporeToday(now = Date.now()): string {
  return new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);
}

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
};

/**
 * Count one hit. Never throws: analytics must not be able to break a page, and
 * this runs after the response anyway.
 */
export async function recordCrawlerHit(client: RpcClient, crawler: Crawler, pathname: string): Promise<void> {
  try {
    const { error } = await client.rpc("record_ai_crawler_hit", {
      p_date: singaporeToday(),
      p_bot: crawler.bot,
      p_path_group: crawlerPathGroup(pathname),
    });
    if (error) warnOnce(error.message);
  } catch (e) {
    warnOnce(e instanceof Error ? e.message : String(e));
  }
}

let warned = false;
/** Once per process: a missing migration would otherwise log on every bot hit. */
function warnOnce(message: string) {
  if (warned) return;
  warned = true;
  console.warn("[ai-crawlers] record failed (further failures silenced):", message);
}
