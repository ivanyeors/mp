import { classifyVisit, type Channel, type VisitSourceFields } from "@/lib/analytics/ai-referrers";
import { bucketStart, type Granularity } from "@/lib/seo-metrics/aggregate";
import { addDays } from "@/lib/seo-metrics/dates";

export type MixVisit = VisitSourceFields & {
  id: string;
  started_at: string;
  converted_order_id: string | null;
};

type Credit = { orders: number; revenue: number; firstOrders: number; firstRevenue: number };

export const MIX_SERIES = ["organic_search", "ai_assistant", "direct", "referral", "other"] as const;
export type MixSeries = (typeof MIX_SERIES)[number];

export const MIX_SERIES_LABELS: Record<MixSeries, string> = {
  organic_search: "Organic search",
  ai_assistant: "AI assistant",
  direct: "Direct",
  referral: "Referral",
  other: "Social, paid & email",
};

export function seriesFor(channel: Channel): MixSeries {
  return channel === "social" || channel === "paid" || channel === "email" ? "other" : channel;
}

export type MixBucket = { start: string } & Record<MixSeries, number>;

export type FunnelRow = Credit & {
  channel: Channel;
  visits: number;
  configuratorVisits: number;
};

export type PlatformRow = Credit & {
  platform: string;
  channel: Channel;
  visits: number;
  configuratorVisits: number;
};

export type ChannelMix = {
  buckets: MixBucket[];
  funnel: FunnelRow[];
  platforms: PlatformRow[];
  aiSources: { source: string; visits: number; orders: number }[];
  totalVisits: number;
};

export function singaporeDate(iso: string): string {
  return new Date(Date.parse(iso) + 8 * 3_600_000).toISOString().slice(0, 10);
}

const CHANNEL_ORDER: Channel[] = ["organic_search", "ai_assistant", "direct", "referral", "social", "paid", "email"];

export function buildChannelMix(input: {
  visits: MixVisit[];
  configuratorVisitIds: Set<string>;
  orderTotals: Map<string, number>;
  firstTouch?: Map<string, VisitSourceFields>;
  from: string;
  to: string;
  granularity: Granularity;
}): ChannelMix {
  const firstBucket = bucketStart(input.from, input.granularity);
  const step = input.granularity === "day" ? 1 : 7;
  const buckets = new Map<string, MixBucket>();
  for (let start = firstBucket; start <= input.to; start = addDays(start, step)) {
    buckets.set(start, { start, organic_search: 0, ai_assistant: 0, direct: 0, referral: 0, other: 0 });
  }

  const funnel = new Map<Channel, FunnelRow>(
    CHANNEL_ORDER.map((channel) => [
      channel,
      { channel, visits: 0, configuratorVisits: 0, orders: 0, revenue: 0, firstOrders: 0, firstRevenue: 0 },
    ]),
  );
  const platforms = new Map<string, PlatformRow>();
  const platformRow = (platform: string, channel: Channel): PlatformRow => {
    const key = `${platform}\0${channel}`;
    let row = platforms.get(key);
    if (!row) {
      row = { platform, channel, visits: 0, configuratorVisits: 0, orders: 0, revenue: 0, firstOrders: 0, firstRevenue: 0 };
      platforms.set(key, row);
    }
    return row;
  };
  const ai = new Map<string, { source: string; visits: number; orders: number }>();

  let totalVisits = 0;
  for (const v of input.visits) {
    const date = singaporeDate(v.started_at);
    if (date < firstBucket || date > input.to) continue;
    const { channel, aiSource, platform } = classifyVisit(v);

    const bucket = buckets.get(bucketStart(date, input.granularity));
    if (bucket) bucket[seriesFor(channel)] += 1;

    if (date < input.from) continue;
    totalVisits += 1;
    const row = funnel.get(channel)!;
    const named = platform ? platformRow(platform, channel) : null;
    row.visits += 1;
    if (named) named.visits += 1;
    if (input.configuratorVisitIds.has(v.id)) {
      row.configuratorVisits += 1;
      if (named) named.configuratorVisits += 1;
    }
    const converted = v.converted_order_id ? input.orderTotals.get(v.converted_order_id) : undefined;
    if (converted !== undefined) {
      for (const r of [row, named]) {
        if (!r) continue;
        r.orders += 1;
        r.revenue += converted;
      }
      const first = classifyVisit(input.firstTouch?.get(v.id) ?? v);
      for (const r of [funnel.get(first.channel)!, first.platform ? platformRow(first.platform, first.channel) : null]) {
        if (!r) continue;
        r.firstOrders += 1;
        r.firstRevenue += converted;
      }
    }
    if (aiSource) {
      const a = ai.get(aiSource) ?? { source: aiSource, visits: 0, orders: 0 };
      a.visits += 1;
      if (converted !== undefined) a.orders += 1;
      ai.set(aiSource, a);
    }
  }

  return {
    buckets: [...buckets.values()],
    funnel: [...funnel.values()],
    platforms: [...platforms.values()].sort(
      (a, b) => b.visits - a.visits || b.firstOrders - a.firstOrders || a.platform.localeCompare(b.platform),
    ),
    aiSources: [...ai.values()].sort((a, b) => b.visits - a.visits),
    totalVisits,
  };
}
