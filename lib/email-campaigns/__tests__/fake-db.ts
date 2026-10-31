import { campaignLedgerKey, composedCampaignBlocker, type CampaignAudience } from "../rules";

/**
 * An in-memory stand-in for the service-role client, answering exactly what
 * the campaign sender asks of Postgres:
 *  - the views `marketing_campaign_candidates` (`select`, `eq`, `in`,
 *    `order`, `range`; with each Customer's `locale`, which slice 17 counts)
 *    and `customer_campaign_wave_stats`, computed from the tables;
 *  - for the send limit, `customer_campaign_sends` (`in`, `gte`, `order`,
 *    `limit`, a `count: "exact", head: true` select) and `admin_audit_log`'s
 *    test sends;
 *  - the RPCs `claim_marketing_campaign_send` (with `last_name`, as
 *    20261030130000 returns it), `finish_campaign_send`, `mint_claim_link`
 *    and `points_balance`;
 *  - for a campaign's products (slice 07), `products` (`select`, `in`) with
 *    each row's Variants and images nested as the shop's select returns them,
 *    and `media_assets` (`in` on `hosted_url`).
 *
 * The claim mirrors the SQL (20261031130000): the wave check, the rule (here
 * `composedCampaignBlocker`, which campaign-rule-cases.json holds equal to
 * `marketing_campaign_blocker`), and the unique (Customer, template) key.
 * assert-01-email-campaigns.sql proves the real function.
 */

type Row = Record<string, unknown>;

export interface FakeCustomer {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  /** What `points_balance` answers as available. */
  points?: number;
  locale?: string;
  marketing_email?: string;
  total_orders?: number;
  created_at?: string;
}

export interface FakeMigrated {
  customer_id: string;
  claimed_at?: string | null;
  shopify_orders_count?: number;
  imported_at: string;
}

export interface FakeSend {
  id: string;
  customer_id: string;
  template: string;
  campaign_id: string | null;
  wave: string;
  status: string;
  provider_message_id: string | null;
  sent_at: string;
  attempts: number;
  last_error: string | null;
  bounced_at: string | null;
  complained_at: string | null;
}

export interface FakeWorld {
  customers: FakeCustomer[];
  migrated: FakeMigrated[];
  sends: FakeSend[];
  campaigns: { id: string; audience: CampaignAudience; archived?: boolean }[];
  claimLinks: { customer_id: string; token_hash: string; template: string }[];
  /** `site_settings`, by key: the points settings a Campaign that mentions points is checked against. */
  settings: Record<string, string>;
  /** `admin_audit_log` rows: test sends (`email_campaign.test`), which the send limit counts. */
  auditLog?: { action: string; created_at: string; after: Row | null }[];
  /** Called inside each claim, before the rule runs: a test's chance to change the world. */
  onClaim?: (customerId: string) => void;
  /** `products` rows, `product_variants` and `product_images` nested in each, as the shop's select returns them. */
  products?: Row[];
  /** `media_assets` rows: their id and hosted URL. */
  mediaAssets?: { id: string; hosted_url: string }[];
  /** Every table read, in order: what a test checks nothing else was touched with. */
  reads?: string[];
  /**
   * The view's `marketing_recent` by Customer (PRD-campaign-audiences slice
   * 07): their marketing email of the last 30 days, newest first, as the SQL
   * would count it. Given by a test, not worked out from `sends`, so fixtures
   * dated near today never rest anyone by accident.
   */
  recentMarketing?: Record<string, string[]>;
}

export const emptyWorld = (): FakeWorld => ({ customers: [], migrated: [], sends: [], campaigns: [], claimLinks: [], settings: {} });

const suppressedIn = (sends: FakeSend[]) =>
  sends.some((s) => s.status === "bounced" || s.status === "complained" || s.bounced_at || s.complained_at);

function candidates(world: FakeWorld): Row[] {
  return world.customers.map((c) => {
    const m = world.migrated.find((x) => x.customer_id === c.id);
    const sends = world.sends.filter((s) => s.customer_id === c.id);
    const campaignSends: Row = {};
    for (const s of sends) {
      if (s.campaign_id) campaignSends[s.campaign_id] = { status: s.status, wave: s.wave, sent_at: s.sent_at };
    }
    return {
      customer_id: c.id,
      email: c.email,
      first_name: c.first_name ?? null,
      locale: c.locale ?? "en-US",
      marketing_email: c.marketing_email ?? "not_subscribed",
      migrated: Boolean(m),
      claimed_at: m?.claimed_at ?? null,
      orders_count: (m?.shopify_orders_count ?? 0) + (c.total_orders ?? 0),
      since: m?.imported_at ?? c.created_at ?? "2026-01-01T00:00:00Z",
      suppressed: suppressedIn(sends),
      campaign_sends: campaignSends,
      marketing_recent: world.recentMarketing?.[c.id] ?? [],
    };
  });
}

function waveStats(world: FakeWorld): Row[] {
  const groups = new Map<string, FakeSend[]>();
  for (const s of world.sends) {
    const key = `${s.template}\u0000${s.wave}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return [...groups.values()].map((rows) => {
    const handed = rows.filter((s) => ["sent", "bounced", "complained"].includes(s.status));
    return {
      template: rows[0].template,
      wave: rows[0].wave,
      handed: handed.length,
      bounced: rows.filter((s) => s.bounced_at).length,
      complained: rows.filter((s) => s.complained_at).length,
      failed: rows.filter((s) => s.status === "failed").length,
      pending: rows.filter((s) => s.status === "pending").length,
      last_sent_at: handed.map((s) => s.sent_at).sort().at(-1) ?? null,
    };
  });
}

/** A chainable read over computed rows. */
function query(rows: () => Row[]) {
  const filters: ((r: Row) => boolean)[] = [];
  let order: string | null = null;
  let descending = false;
  let range: [number, number] | null = null;
  let limit: number | null = null;
  let head = false;
  const run = () => {
    let out = rows().filter((r) => filters.every((f) => f(r)));
    if (order) out = [...out].sort((a, b) => String(a[order!]).localeCompare(String(b[order!])) * (descending ? -1 : 1));
    const count = out.length;
    if (range) out = out.slice(range[0], range[1] + 1);
    if (limit !== null) out = out.slice(0, limit);
    return { data: head ? null : out, count, error: null };
  };
  const q = {
    select: (_columns?: string, opts?: { count?: string; head?: boolean }) => ((head = opts?.head === true), q),
    eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), q),
    in: (col: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[col])), q),
    gte: (col: string, v: string) => (filters.push((r) => String(r[col]) >= v), q),
    order: (col: string, opts?: { ascending?: boolean }) => ((order = col), (descending = opts?.ascending === false), q),
    range: (from: number, to: number) => ((range = [from, to]), q),
    limit: (n: number) => ((limit = n), q),
    then: (resolve: (v: ReturnType<typeof run>) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(run()).then(resolve, reject),
  };
  return q;
}

let sendSeq = 0;
const WAVE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;

export function fakeCampaignsClient(world: FakeWorld) {
  const rpcCalls: { name: string; args: Row }[] = [];

  function claim(args: Row) {
    const customerId = String(args.p_customer_id);
    const campaignId = String(args.p_campaign_id);
    const wave = String(args.p_wave);
    const retry = args.p_retry_failed === true;
    if (!WAVE.test(wave)) return { data: null, error: { message: "A wave is 1 to 32 letters" } };
    world.onClaim?.(customerId);
    const none = (blocker: string) => ({
      data: [{ send_id: null, blocker, email: null, first_name: null, last_name: null, locale: null, unclaimed_migrated: null }],
      error: null,
    });

    const campaign = world.campaigns.find((c) => c.id === campaignId);
    if (!campaign) return none("unknown_campaign");
    if (campaign.archived) return none("campaign_archived");
    const row = candidates(world).find((r) => r.customer_id === customerId);
    if (!row) return none("not_found");
    const key = campaignLedgerKey(campaignId);
    const own = world.sends.find((s) => s.customer_id === customerId && s.template === key);
    const blocker = composedCampaignBlocker(
      campaign.audience,
      {
        migrated: row.migrated as boolean,
        claimedAt: row.claimed_at as string | null,
        marketingEmail: row.marketing_email as "subscribed",
        suppressed: row.suppressed as boolean,
        own: own ? { status: own.status as "sent", wave: own.wave, sentAt: own.sent_at } : null,
        recentMarketing: row.marketing_recent as string[],
      },
      { retryFailed: retry },
    );
    if (blocker) return none(blocker);

    let id: string;
    if (retry) {
      if (own?.status !== "failed") return none("already_sent");
      Object.assign(own, { status: "pending", wave, attempts: own.attempts + 1, last_error: null, provider_message_id: null });
      id = own.id;
    } else {
      if (own) return none("already_sent");
      id = `send-${++sendSeq}`;
      world.sends.push({
        id,
        customer_id: customerId,
        template: key,
        campaign_id: campaignId,
        wave,
        status: "pending",
        provider_message_id: null,
        sent_at: new Date().toISOString(),
        attempts: 1,
        last_error: null,
        bounced_at: null,
        complained_at: null,
      });
    }
    const c = world.customers.find((x) => x.id === customerId)!;
    return {
      data: [
        {
          send_id: id,
          blocker: null,
          email: c.email,
          first_name: c.first_name ?? null,
          last_name: c.last_name ?? null,
          locale: c.locale ?? "en-US",
          unclaimed_migrated: Boolean(row.migrated) && !row.claimed_at,
        },
      ],
      error: null,
    };
  }

  function finish(args: Row) {
    const s = world.sends.find((x) => x.id === args.p_send_id);
    if (!s || s.status !== "pending") return { data: false, error: null };
    if (args.p_sent) Object.assign(s, { status: "sent", provider_message_id: args.p_provider_message_id ?? null });
    else Object.assign(s, { status: "failed", last_error: args.p_error ?? "unknown error" });
    return { data: true, error: null };
  }

  return {
    rpcCalls,
    from(table: string) {
      world.reads?.push(table);
      if (table === "products") return query(() => world.products ?? []);
      if (table === "media_assets") return query(() => (world.mediaAssets ?? []) as unknown as Row[]);
      if (table === "marketing_campaign_candidates") return query(() => candidates(world));
      if (table === "customer_campaign_wave_stats") return query(() => waveStats(world));
      if (table === "customer_campaign_sends") return query(() => world.sends as unknown as Row[]);
      if (table === "admin_audit_log") return query(() => (world.auditLog ?? []) as unknown as Row[]);
      if (table === "site_settings") return query(() => Object.entries(world.settings).map(([key, value]) => ({ key, value })));
      throw new Error(`fake: no table ${table}`);
    },
    async rpc(name: string, args: Row) {
      rpcCalls.push({ name, args });
      if (name === "claim_marketing_campaign_send") return claim(args);
      if (name === "finish_campaign_send") return finish(args);
      if (name === "mint_claim_link") {
        world.claimLinks.push({ customer_id: String(args.p_customer_id), token_hash: String(args.p_token_hash), template: String(args.p_template) });
        return { data: null, error: null };
      }
      if (name === "points_balance") {
        const c = world.customers.find((x) => x.id === args.p_customer_id);
        return { data: [{ available: c?.points ?? 0, pending: 0, last_purchase_at: null, expires_on: null }], error: null };
      }
      throw new Error(`fake: no rpc ${name}`);
    },
  };
}
