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

export interface CampaignCandidate extends CampaignFacts {
  customerId: string;
  email: string;
  firstName: string | null;
  locale: string;
  shopifyOrdersCount: number;
  importedAt: string;
}

export interface AudienceFilters {
  wave: string;
  limit: number;
  buyersOnly?: boolean;
  retryFailed?: boolean;
}

export type AudienceExclusion = CampaignBlocker | "not_a_buyer" | "not_failed";

export interface CampaignAudience {
  template: CampaignTemplate;
  wave: string;
  considered: number;
  eligible: CampaignCandidate[];
  eligibleBuyers: number;
  alreadyInWave: number;
  room: number;
  selection: CampaignCandidate[];
  excluded: Partial<Record<AudienceExclusion, number>>;
}

export const isBuyer = (c: Pick<CampaignCandidate, "shopifyOrdersCount">): boolean => c.shopifyOrdersCount >= 1;

export function compareSendOrder(a: CampaignCandidate, b: CampaignCandidate): number {
  const buyer = Number(isBuyer(b)) - Number(isBuyer(a));
  if (buyer !== 0) return buyer;
  const imported = Date.parse(b.importedAt) - Date.parse(a.importedAt);
  if (imported !== 0 && Number.isFinite(imported)) return imported;
  return a.customerId < b.customerId ? -1 : a.customerId > b.customerId ? 1 : 0;
}

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

export const CANDIDATE_COLUMNS =
  "customer_id, email, first_name, locale, marketing_email, claimed_at, shopify_orders_count, imported_at, sends";

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

const PAGE = 1000;

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

export async function selectCampaignAudience(
  admin: SupabaseClient,
  template: CampaignTemplate,
  filters: AudienceFilters,
  now: Date = new Date(),
): Promise<CampaignAudience> {
  return planCampaignAudience(template, await readCampaignCandidates(admin), filters, now);
}
