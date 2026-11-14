import { classifyVisit, type Channel, type VisitSourceFields } from "@/lib/analytics/ai-referrers";
import { bucketStart, type Granularity } from "@/lib/seo-metrics/aggregate";
import { addDays } from "@/lib/seo-metrics/dates";

/**
 * Visits by channel over time + per-channel funnel (slice 03, PRD-search-visibility).
 * Pure; the server action loads rows.
 */

export type MixVisit = VisitSourceFields & {
  id: string;
  started_at: string;
  converted_order_id: string | null;
};

/**
 * Whose Visit an Order is counted for. `orders` / `revenue` are last touch:
 * the Visit that paid. `firstOrders` / `firstRevenue` are first touch: the same
 * Orders, counted for the Entry source of that shopper's first Visit instead
 * (`lib/analytics/journey/first-touch.ts`). The two columns sum to the same
 * total; only the split between rows differs.
 */
type Credit = { orders: number; revenue: number; firstOrders: number; firstRevenue: number };

/** Chart series, fixed order (colour follows the entity, never its rank). */
export const MIX_SERIES = ["organic_search", "ai_assistant", "direct", "referral", "other"] as const;
export type MixSeries = (typeof MIX_SERIES)[number];

export const MIX_SERIES_LABELS: Record<MixSeries, string> = {
  organic_search: "Organic search",
  ai_assistant: "AI assistant",
  direct: "Direct",
  referral: "Referral",
  other: "Social, paid & email",
};

/** Five colours is the validated categorical budget; the long tail folds into one series. */
export function seriesFor(channel: Channel): MixSeries {
  return channel === "social" || channel === "paid" || channel === "email" ? "other" : channel;
}

export type MixBucket = { start: string } & Record<MixSeries, number>;

export type FunnelRow = Credit & {
  channel: Channel;
  visits: number;
  configuratorVisits: number;
};

/** One platform arriving one way: Google by ads and Google by search are two rows. */
export type PlatformRow = Credit & {
  platform: string;
  channel: Channel;
  visits: number;
  configuratorVisits: number;
};

export type ChannelMix = {
  buckets: MixBucket[];
  funnel: FunnelRow[];
  /** Named platforms only, most Visits first. Direct, Email, AI and plain referrals name none. */
  platforms: PlatformRow[];
  aiSources: { source: string; visits: number; orders: number }[];
  totalVisits: number;
};

/** Calendar date in Singapore (UTC+8, no DST), so a 1am visit is not filed under yesterday. */
export function singaporeDate(iso: string): string {
  return new Date(Date.parse(iso) + 8 * 3_600_000).toISOString().slice(0, 10);
}

const CHANNEL_ORDER: Channel[] = ["organic_search", "ai_assistant", "direct", "referral", "social", "paid", "email"];

export function buildChannelMix(input: {
  visits: MixVisit[];
  /** Visit ids with a page view on mp-config / mbolster-config. */
  configuratorVisitIds: Set<string>;
  /** Paid order id → total, for visits that converted. */
  orderTotals: Map<string, number>;
  /**
   * Visit id → the first Visit of the shopper behind it, for Visits that
   * converted. A Visit missing here is counted as its own first touch.
   */
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

    // KPIs and funnel stay on [from, to]; the chart may start on the Monday before.
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
      // The same Order, counted for where its shopper first came from. That
      // first Visit may predate the range: the Order is in it, which is what counts.
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
