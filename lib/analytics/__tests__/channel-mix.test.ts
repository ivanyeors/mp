import { describe, expect, it } from "vitest";
import { buildChannelMix, singaporeDate, type MixVisit } from "@/lib/analytics/channel-mix";

let n = 0;
const v = (started_at: string, referrer_host: string | null, converted_order_id: string | null = null): MixVisit => ({
  id: `v${++n}`,
  started_at: `${started_at}T03:00:00Z`,
  referrer_host,
  entry_source: referrer_host ?? "Direct",
  entry_medium: null,
  converted_order_id,
});

describe("buildChannelMix", () => {
  const visits = [
    v("2026-09-22", "www.google.com"),
    v("2026-09-22", "chatgpt.com", "o1"),
    v("2026-09-23", "www.perplexity.ai"),
    v("2026-09-23", null),
    v("2026-09-24", "l.instagram.com"),
    v("2026-09-24", "honeycombers.com"),
    v("2026-09-21", "www.google.com"), // Monday before `from`: chart only
  ];
  const mix = buildChannelMix({
    visits,
    configuratorVisitIds: new Set([visits[1].id, visits[2].id]),
    orderTotals: new Map([["o1", 189]]),
    from: "2026-09-22",
    to: "2026-09-24",
    granularity: "day",
  });

  it("buckets visits by channel and folds social/paid/email into one series", () => {
    expect(mix.buckets.map((b) => b.start)).toEqual(["2026-09-22", "2026-09-23", "2026-09-24"]);
    expect(mix.buckets[0]).toMatchObject({ organic_search: 1, ai_assistant: 1 });
    expect(mix.buckets[1]).toMatchObject({ ai_assistant: 1, direct: 1 });
    expect(mix.buckets[2]).toMatchObject({ other: 1, referral: 1 });
  });

  it("builds the funnel per channel with configurator visits, orders and revenue", () => {
    const ai = mix.funnel.find((r) => r.channel === "ai_assistant")!;
    expect(ai).toEqual({ channel: "ai_assistant", visits: 2, configuratorVisits: 2, orders: 1, revenue: 189 });
    expect(mix.funnel.find((r) => r.channel === "social")!.visits).toBe(1);
    expect(mix.totalVisits).toBe(6);
  });

  it("breaks AI visits down by assistant", () => {
    expect(mix.aiSources).toEqual([
      { source: "ChatGPT", visits: 1, orders: 1 },
      { source: "Perplexity", visits: 1, orders: 0 },
    ]);
  });

  it("charts whole weeks but keeps the funnel on the selected range", () => {
    const weekly = buildChannelMix({
      visits,
      configuratorVisitIds: new Set(),
      orderTotals: new Map(),
      from: "2026-09-22",
      to: "2026-09-24",
      granularity: "week",
    });
    expect(weekly.buckets).toHaveLength(1);
    expect(weekly.buckets[0].organic_search).toBe(2);
    expect(weekly.funnel.find((r) => r.channel === "organic_search")!.visits).toBe(1);
  });
});

describe("singaporeDate", () => {
  it("files visits by Singapore calendar day", () => {
    expect(singaporeDate("2026-09-22T17:30:00Z")).toBe("2026-09-23"); // 01:30 SGT
    expect(singaporeDate("2026-09-22T15:59:00Z")).toBe("2026-09-22"); // 23:59 SGT
  });
});
