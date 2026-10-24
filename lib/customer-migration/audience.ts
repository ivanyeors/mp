/**
 * Who a campaign wave goes to (PRD-shopify-customer-migration slice 08).
 *
 * `selectCampaignAudience(admin, template, filters)` is one query and one pure
 * function. The query reads every Migrated customer with their campaign sends
 * (`customer_campaign_candidates`, 20261020130000). The pure function,
 * `planCampaignAudience`, applies the rule (`campaignBlocker`), puts buyers
 * first and then the most recently imported, and takes the wave's share.
 *
 * The rules live here, not in the script: the wave sender
 * (scripts/customer-migration-send.ts) only parses flags and calls this, and
 * the Campaigns page the email-marketing initiative builds calls the same
 * function and writes to the same ledger. The selection is a plan. Each send
 * is decided again, in SQL, by `claim_campaign_send` at the moment it goes.
 *
 * **A wave holds at most `limit` people.** Running `--wave w1 --limit 200`
 * a second time finds w1 full and sends nothing; the next 200 are `--wave
 * w2`. `--retry-failed` selects only this wave's failed sends of the template,
 * and re-claims them in the same wave: it never adds anyone to a wave.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { marketingEmailState } from "@/lib/marketing-consent/state";
import {
  campaignBlocker,
  isCampaignSendStatus,
  type CampaignBlocker,
  type CampaignFacts,
  type CampaignSendFact,
  type CampaignTemplate,
} from "./campaign";

/** One Migrated customer as the sender sees them. */
export interface CampaignCandidate extends CampaignFacts {
  customerId: string;
  email: string;
  firstName: string | null;
  /** `customers.locale`, for the links' language. */
  locale: string;
  /** Shopify-era orders: a buyer has at least one. */
  shopifyOrdersCount: number;
  importedAt: string;
}

export interface AudienceFilters {
  /** The wave this run fills. */
  wave: string;
  /** The most the wave holds. */
  limit: number;
  /** Leave out subscribers who never bought on Shopify. */
  buyersOnly?: boolean;
  /** Select only this wave's failed sends of the template, and re-claim them. */
  retryFailed?: boolean;
}

/** Why a candidate is not in the selection. `not_failed`: retrying, and nothing of theirs failed in this wave. */
export type AudienceExclusion = CampaignBlocker | "not_a_buyer" | "not_failed";

export interface CampaignAudience {
  template: CampaignTemplate;
  wave: string;
  /** Migrated customers read. */
  considered: number;
  /** Everyone the rule allows, in send order. */
  eligible: CampaignCandidate[];
  /** Of `eligible`, the buyers. */
  eligibleBuyers: number;
  /** Sends of this template the wave already holds. */
  alreadyInWave: number;
  /** What this run may claim: `limit` less `alreadyInWave`, or `limit` when retrying. */
  room: number;
  /** The first `room` of `eligible`: who this run would send to. */
  selection: CampaignCandidate[];
  /** Why the others are not eligible, by reason. */
  excluded: Partial<Record<AudienceExclusion, number>>;
}

export const isBuyer = (c: Pick<CampaignCandidate, "shopifyOrdersCount">): boolean => c.shopifyOrdersCount >= 1;

/**
 * Buyers first (Shopify newsletter forms attract bot sign-ups, which show up
 * as consent with no orders), then the most recent import, then the id, so
 * two runs order the same list the same way.
 */
export function compareSendOrder(a: CampaignCandidate, b: CampaignCandidate): number {
  const buyer = Number(isBuyer(b)) - Number(isBuyer(a));
  if (buyer !== 0) return buyer;
  const imported = Date.parse(b.importedAt) - Date.parse(a.importedAt);
  if (imported !== 0 && Number.isFinite(imported)) return imported;
  return a.customerId < b.customerId ? -1 : a.customerId > b.customerId ? 1 : 0;
}

/** Pure — the wave's audience from every candidate. */
export function planCampaignAudience(
  template: CampaignTemplate,
  candidates: readonly CampaignCandidate[],
  filters: AudienceFilters,
  now: Date = new Date(),
): CampaignAudience {
  const excluded: Partial<Record<AudienceExclusion, number>> = {};
  const exclude = (why: AudienceExclusion) => {
    excluded[why] = (excluded[why] ?? 0) + 1;
  };

  const eligible: CampaignCandidate[] = [];
  let alreadyInWave = 0;
  for (const c of candidates) {
    const own = c.sends[template];
    if (own?.wave === filters.wave) alreadyInWave++;
    const blocker = campaignBlocker(template, c, { now, retryFailed: filters.retryFailed });
    if (blocker) exclude(blocker);
    else if (filters.retryFailed && !(own?.status === "failed" && own.wave === filters.wave)) exclude("not_failed");
    else if (filters.buyersOnly && !isBuyer(c)) exclude("not_a_buyer");
    else eligible.push(c);
  }
  eligible.sort(compareSendOrder);

  const limit = Math.max(0, Math.floor(filters.limit));
  const room = filters.retryFailed ? limit : Math.max(0, limit - alreadyInWave);
  return {
    template,
    wave: filters.wave,
    considered: candidates.length,
    eligible,
    eligibleBuyers: eligible.filter(isBuyer).length,
    alreadyInWave,
    room,
    selection: eligible.slice(0, room),
    excluded,
  };
}

type SendJson = { status?: unknown; wave?: unknown; sent_at?: unknown; bounced?: unknown; complained?: unknown };

function sendFact(value: unknown): CampaignSendFact | null {
  const s = (value ?? {}) as SendJson;
  if (!isCampaignSendStatus(s.status) || typeof s.sent_at !== "string") return null;
  return {
    status: s.status,
    sentAt: s.sent_at,
    ...(typeof s.wave === "string" ? { wave: s.wave } : {}),
    ...(s.bounced === true ? { bounced: true } : {}),
    ...(s.complained === true ? { complained: true } : {}),
  };
}

/** The view's columns, in its order. */
export const CANDIDATE_COLUMNS =
  "customer_id, email, first_name, locale, marketing_email, claimed_at, shopify_orders_count, imported_at, sends";

/** Pure — one `customer_campaign_candidates` row, or null for a malformed one. */
export function candidateFromRow(row: Record<string, unknown>): CampaignCandidate | null {
  if (typeof row.customer_id !== "string" || typeof row.email !== "string") return null;
  const sends: Partial<Record<string, CampaignSendFact>> = {};
  if (row.sends && typeof row.sends === "object") {
    for (const [template, value] of Object.entries(row.sends as Record<string, unknown>)) {
      const fact = sendFact(value);
      if (fact) sends[template] = fact;
    }
  }
  const orders = Number(row.shopify_orders_count ?? 0);
  return {
    customerId: row.customer_id,
    email: row.email,
    firstName: typeof row.first_name === "string" && row.first_name.trim() ? row.first_name.trim() : null,
    locale: typeof row.locale === "string" ? row.locale : "en-US",
    migrated: true,
    claimedAt: typeof row.claimed_at === "string" ? row.claimed_at : null,
    marketingEmail: marketingEmailState(row.marketing_email),
    shopifyOrdersCount: Number.isFinite(orders) ? orders : 0,
    importedAt: typeof row.imported_at === "string" ? row.imported_at : "",
    sends,
  };
}

/** PostgREST returns at most this many rows a request, so the read pages. */
const PAGE = 1000;

/** Every Migrated customer and their sends: the one query, page by page. Throws on a failed read. */
export async function readCampaignCandidates(admin: SupabaseClient): Promise<CampaignCandidate[]> {
  const out: CampaignCandidate[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("customer_campaign_candidates")
      .select(CANDIDATE_COLUMNS)
      .order("customer_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Could not read the campaign audience: ${error.message}`);
    const rows = (data ?? []) as Record<string, unknown>[];
    for (const row of rows) {
      const c = candidateFromRow(row);
      if (c) out.push(c);
    }
    if (rows.length < PAGE) return out;
  }
}

/** The wave's audience: one query, then the pure plan. */
export async function selectCampaignAudience(
  admin: SupabaseClient,
  template: CampaignTemplate,
  filters: AudienceFilters,
  now: Date = new Date(),
): Promise<CampaignAudience> {
  return planCampaignAudience(template, await readCampaignCandidates(admin), filters, now);
}
