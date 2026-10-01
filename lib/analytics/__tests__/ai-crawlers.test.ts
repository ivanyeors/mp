import { describe, expect, it } from "vitest";
import { classifyCrawler, crawlerPathGroup, recordCrawlerHit } from "@/lib/analytics/ai-crawlers";

describe("classifyCrawler", () => {
  it.each([
    ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot", "GPTBot", "training"],
    ["Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)", "OAI-SearchBot", "ai_search"],
    ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot", "ChatGPT-User", "user_fetch"],
    ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)", "ClaudeBot", "training"],
    ["Mozilla/5.0 (compatible; Claude-User/1.0; +Claude-User@anthropic.com)", "Claude-User", "user_fetch"],
    ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)", "PerplexityBot", "ai_search"],
    ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)", "Perplexity-User", "user_fetch"],
    ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "Googlebot", "search_engine"],
    ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.1938.76 Safari/537.36", "Bingbot", "search_engine"],
  ])("%s → %s", (ua, bot, purpose) => {
    expect(classifyCrawler(ua)).toMatchObject({ bot, purpose });
  });

  it("ignores ordinary browsers and empty user agents", () => {
    expect(
      classifyCrawler("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"),
    ).toBeNull();
    expect(classifyCrawler(null)).toBeNull();
    expect(classifyCrawler("")).toBeNull();
  });
});

describe("crawlerPathGroup", () => {
  it.each([
    ["/", "home"],
    ["/en-US", "home"],
    ["/zh-CN/", "home"],
    ["/llms.txt", "llms.txt"],
    ["/robots.txt", "robots.txt"],
    ["/sitemap.xml", "sitemap"],
    ["/en-US/mp-config", "mp-config"],
    ["/en-US/mbolster-config", "mbolster-config"],
    ["/en-US/guides/neck-pain-pillow-singapore", "guides"],
    ["/en-US/blog/how-to-choose-the-best-pillow-in-singapore", "blog"],
    ["/en-US/shop", "shop"],
    ["/en-US/faq", "faq"],
    ["/en-US/our-partners", "other"],
    ["/en-US/blogger", "other"],
  ])("%s → %s", (path, group) => {
    expect(crawlerPathGroup(path)).toBe(group);
  });
});

describe("recordCrawlerHit", () => {
  const crawler = { bot: "GPTBot", operator: "OpenAI", purpose: "training" as const };

  it("increments the rollup for the page group", async () => {
    const calls: unknown[] = [];
    await recordCrawlerHit({ rpc: async (fn, args) => (calls.push([fn, args]), { error: null }) }, crawler, "/en-US/blog/x");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(["record_ai_crawler_hit", expect.objectContaining({ p_bot: "GPTBot", p_path_group: "blog" })]);
  });

  it("never throws, whatever the database does", async () => {
    await expect(recordCrawlerHit({ rpc: async () => ({ error: { message: "boom" } }) }, crawler, "/")).resolves.toBeUndefined();
    await expect(
      recordCrawlerHit({ rpc: () => Promise.reject(new Error("network")) }, crawler, "/"),
    ).resolves.toBeUndefined();
  });
});
