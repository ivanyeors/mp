import { campaignBlocker, isCampaignTemplate, WAVE_PATTERN, type CampaignSendFact } from "../campaign";
import { marketingEmailState } from "@/lib/marketing-consent/state";

/**
 * An in-memory stand-in for the service-role client, answering exactly what
 * the wave sender asks of Postgres:
 *  - `customer_campaign_candidates` and `customer_campaign_wave_stats`, the
 *    two views, computed from the tables (`select`, `order`, `range`);
 *  - `customer_campaign_sends`, for the send limit's count and its oldest
 *    send (`in`, `gte`, `order`, `limit`, `select` with `count: "exact",
 *    head: true`), and `admin_audit_log` for the tests it also counts;
 *  - `site_settings` (`eq`, `in`, `maybeSingle`);
 *  - the RPCs `claim_campaign_send`, `finish_campaign_send`, `mint_claim_link`
 *    and `set_marketing_email`.
 *
 * `claim_campaign_send` mirrors the SQL (20261020130000): owner decision 3,
 * the wave check, the rule (here `campaignBlocker`, which campaign-cases.json
 * holds equal to `campaign_send_blocker`), and the unique (Customer, template)
 * key. assert-08-campaign-sends.sql proves the real function, concurrency
 * included.
 */

type Row = Record<string, unknown>;

export interface FakeCustomer {
  id: string;
  email: string;
  first_name?: string | null;
  locale?: string;
  marketing_email?: string;
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
  wave: string;
  status: string;
  provider_message_id: string | null;
  sent_at: string;
  attempts: number;
  last_error: string | null;
  bounced_at: string | null;
  complained_at: string | null;
}

export interface CampaignWorld {
  customers: FakeCustomer[];
  migrated: FakeMigrated[];
  sends: FakeSend[];
  claimLinks: { customer_id: string; token_hash: string; template: string }[];
  settings: Record<string, string>;
  consentEvents: Row[];
  /** `admin_audit_log` rows: the Email campaigns page's tests (`email_campaign.test`), which the send limit counts. */
  auditLog?: { action: string; created_at: string; after: Row | null }[];
  /** Called inside each claim, before the rule runs: a test's chance to change the world. */
  onClaim?: (customerId: string) => void;
}

export function emptyWorld(): CampaignWorld {
  return { customers: [], migrated: [], sends: [], claimLinks: [], settings: {}, consentEvents: [] };
}

let seq = 0;
const uuid = () => `5e000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

function sendsOf(world: CampaignWorld, customerId: string): Partial<Record<string, CampaignSendFact>> {
  const out: Partial<Record<string, CampaignSendFact>> = {};
  for (const s of world.sends.filter((x) => x.customer_id === customerId)) {
    out[s.template] = {
      status: s.status as CampaignSendFact["status"],
      wave: s.wave,
      sentAt: s.sent_at,
      ...(s.bounced_at ? { bounced: true } : {}),
      ...(s.complained_at ? { complained: true } : {}),
    };
  }
  return out;
}

function candidates(world: CampaignWorld): Row[] {
  return world.migrated.flatMap((m) => {
    const c = world.customers.find((x) => x.id === m.customer_id);
    if (!c) return [];
    const sends: Row = {};
    for (const [template, s] of Object.entries(sendsOf(world, c.id))) {
      sends[template] = { status: s!.status, wave: s!.wave, sent_at: s!.sentAt, bounced: !!s!.bounced, complained: !!s!.complained };
    }
    return [
      {
        customer_id: c.id,
        email: c.email,
        first_name: c.first_name ?? null,
        locale: c.locale ?? "en-US",
        marketing_email: c.marketing_email ?? "not_subscribed",
        claimed_at: m.claimed_at ?? null,
        shopify_orders_count: m.shopify_orders_count ?? 0,
        imported_at: m.imported_at,
        sends,
      },
    ];
  });
}

function waveStats(world: CampaignWorld): Row[] {
  const groups = new Map<string, FakeSend[]>();
  for (const s of world.sends) {
    const key = `${s.template}\u0000${s.wave}`;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return [...groups.values()].map((rows) => {
    const handed = rows.filter((r) => ["sent", "bounced", "complained"].includes(r.status));
    return {
      template: rows[0].template,
      wave: rows[0].wave,
      handed: handed.length,
      bounced: rows.filter((r) => r.bounced_at).length,
      complained: rows.filter((r) => r.complained_at).length,
      failed: rows.filter((r) => r.status === "failed").length,
      pending: rows.filter((r) => r.status === "pending").length,
      last_sent_at: handed.length ? handed.map((r) => r.sent_at).sort().at(-1) : null,
    };
  });
}

function query(source: () => Row[]) {
  const filters: Array<(r: Row) => boolean> = [];
  let sort: string | null = null;
  let descending = false;
  let range: [number, number] | null = null;
  let limit: number | null = null;
  let head = false;
  const rows = () => {
    let r = source().filter((row) => filters.every((f) => f(row)));
    if (sort) r = [...r].sort((a, b) => (String(a[sort!]) < String(b[sort!]) ? -1 : 1) * (descending ? -1 : 1));
    if (range) r = r.slice(range[0], range[1] + 1);
    if (limit !== null) r = r.slice(0, limit);
    return r;
  };
  const q = {
    select: (_columns?: string, opts?: { count?: string; head?: boolean }) => ((head = opts?.head === true), q),
    eq: (col: string, val: unknown) => (filters.push((r) => r[col] === val), q),
    in: (col: string, vals: unknown[]) => (filters.push((r) => vals.includes(r[col])), q),
    gte: (col: string, val: string) => (filters.push((r) => String(r[col]) >= val), q),
    order: (col: string, opts?: { ascending?: boolean }) => ((sort = col), (descending = opts?.ascending === false), q),
    range: (from: number, to: number) => ((range = [from, to]), q),
    limit: (n: number) => ((limit = n), q),
    maybeSingle: () => Promise.resolve({ data: rows()[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve({ data: head ? null : rows(), count: rows().length, error: null }).then(resolve, reject),
  };
  return q;
}

type RpcResult = { data: unknown; error: { message: string } | null };

export function fakeCampaignClient(world: CampaignWorld) {
  const rpcs: Record<string, (args: Row) => RpcResult> = {
    claim_campaign_send(args) {
      const customerId = String(args.p_customer_id);
      const template = String(args.p_template);
      const wave = String(args.p_wave ?? "");
      const retry = args.p_retry_failed === true;
      const none = (blocker: string): RpcResult => ({
        data: [{ send_id: null, blocker, email: null, first_name: null, locale: null }],
        error: null,
      });
      if (!WAVE_PATTERN.test(wave)) return { data: null, error: { message: `A wave is 1 to 32 letters (not ${wave})` } };
      if (template === "migration_service_notice" && world.settings.migration_service_notice_enabled !== "true") {
        return none("service_notice_off");
      }
      world.onClaim?.(customerId);
      const customer = world.customers.find((c) => c.id === customerId);
      const migrated = world.migrated.find((m) => m.customer_id === customerId);
      if (!isCampaignTemplate(template)) return none("unknown_template");
      const blocker = campaignBlocker(
        template,
        {
          migrated: Boolean(customer && migrated),
          claimedAt: migrated?.claimed_at ?? null,
          marketingEmail: marketingEmailState(customer?.marketing_email),
          sends: sendsOf(world, customerId),
        },
        { retryFailed: retry },
      );
      if (blocker) return none(blocker);

      const own = world.sends.find((s) => s.customer_id === customerId && s.template === template);
      let row: FakeSend;
      if (retry) {
        if (!own || own.status !== "failed" || own.wave !== wave) return none(own && own.status !== "failed" ? "already_sent" : "not_failed");
        Object.assign(own, { status: "pending", sent_at: new Date().toISOString(), attempts: own.attempts + 1, last_error: null });
        row = own;
      } else {
        if (own) return none("already_sent");
        row = {
          id: uuid(),
          customer_id: customerId,
          template,
          wave,
          status: "pending",
          provider_message_id: null,
          sent_at: new Date().toISOString(),
          attempts: 1,
          last_error: null,
          bounced_at: null,
          complained_at: null,
        };
        world.sends.push(row);
      }
      return {
        data: [{ send_id: row.id, blocker: null, email: customer!.email, first_name: customer!.first_name ?? null, locale: customer!.locale ?? "en-US" }],
        error: null,
      };
    },
    finish_campaign_send(args) {
      const row = world.sends.find((s) => s.id === args.p_send_id && s.status === "pending");
      if (!row) return { data: false, error: null };
      if (args.p_sent) {
        Object.assign(row, { status: "sent", provider_message_id: (args.p_provider_message_id as string) ?? null, sent_at: new Date().toISOString() });
      } else {
        Object.assign(row, { status: "failed", last_error: String(args.p_error ?? "unknown error") });
      }
      return { data: true, error: null };
    },
    mint_claim_link(args) {
      if (!/^[0-9a-f]{64}$/.test(String(args.p_token_hash))) return { data: null, error: { message: "token_hash check" } };
      world.claimLinks.push({
        customer_id: String(args.p_customer_id),
        token_hash: String(args.p_token_hash),
        template: String(args.p_template),
      });
      return { data: null, error: null };
    },
  };

  return {
    rpcCalls: [] as Array<{ name: string; args: Row }>,
    rpc(name: string, args: Row) {
      this.rpcCalls.push({ name, args });
      const handler = rpcs[name];
      return Promise.resolve(handler ? handler(args) : { data: null, error: { message: `no rpc ${name}` } });
    },
    from(table: string) {
      if (table === "customer_campaign_candidates") return query(() => candidates(world));
      if (table === "customer_campaign_wave_stats") return query(() => waveStats(world));
      if (table === "customer_campaign_sends") return query(() => world.sends as unknown as Row[]);
      if (table === "admin_audit_log") return query(() => (world.auditLog ?? []) as unknown as Row[]);
      if (table === "site_settings") return query(() => Object.entries(world.settings).map(([key, value]) => ({ key, value })));
      throw new Error(`fake-campaign-db: no table ${table}`);
    },
  };
}
