import { describe, expect, it } from "vitest";
import { buildCrawlerActivity } from "@/lib/analytics/crawler-activity";

describe("buildCrawlerActivity", () => {
  const rows = [
    { date: "2026-09-22", bot: "GPTBot", path_group: "blog", hits: 5 },
    { date: "2026-09-22", bot: "GPTBot", path_group: "llms.txt", hits: 1 },
    { date: "2026-09-23", bot: "OAI-SearchBot", path_group: "mp-config", hits: 3 },
    { date: "2026-09-23", bot: "Googlebot", path_group: "home", hits: 40 },
    { date: "2026-09-15", bot: "GPTBot", path_group: "blog", hits: 2 }, // previous period
  ];
  const a = buildCrawlerActivity({
    rows,
    from: "2026-09-22",
    to: "2026-09-24",
    previousFrom: "2026-09-19",
    granularity: "day",
  });

  it("charts AI crawlers only, leaving search engines out of the line", () => {
    expect(a.buckets).toEqual([
      { start: "2026-09-22", value: 6, partial: false },
      { start: "2026-09-23", value: 3, partial: false },
      { start: "2026-09-24", value: 0, partial: true },
    ]);
    expect(a.aiHits).toBe(9);
    expect(a.previousAiHits).toBe(0); // 09-15 is before previousFrom
    expect(a.llmsTxtHits).toBe(1);
  });

  it("lists every bot, search engines included, with top page groups", () => {
    expect(a.bots.map((b) => b.bot)).toEqual(["Googlebot", "GPTBot", "OAI-SearchBot"]);
    const gpt = a.bots.find((b) => b.bot === "GPTBot")!;
    expect(gpt).toMatchObject({ operator: "OpenAI", purpose: "training", hits: 6 });
    expect(gpt.topPaths[0]).toEqual({ pathGroup: "blog", hits: 5 });
  });
});
