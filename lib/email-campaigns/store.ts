import type { SupabaseClient } from "@supabase/supabase-js";
import { finishCampaignSend, readCampaignWaveStats, type CampaignWaveStats } from "@/lib/customer-migration/campaign-ledger";
import {
  CAMPAIGN_COLUMNS,
  CANDIDATE_COLUMNS,
  campaignFromRow,
  campaignLedgerKey,
  campaignRowFromDraft,
  candidateFromRow,
  type Campaign,
  type CampaignCandidate,
  type CampaignClaimBlocker,
  type CampaignDraft,
} from "./rules";
import {
  latestPillows,
  PILLOW_LINE_COLUMNS,
  productClasses,
  RECIPIENT_FACT_COLUMNS,
  recipientFactsFromRow,
  type BoughtClass,
  type RecipientFacts,
} from "./fit-checks";
import type { RecipientPillow } from "./variables";
import { resultsFromRows, type CampaignResults } from "./results";
import { approvedSegmentsRow, KEEP_SENDING_COLUMNS, keepSendingFromRow, keptWaveLabel, type ApprovedSegment, type KeepSending } from "./keep-sending";

export { finishCampaignSend };

export interface CampaignStats {
  handed: number;
  bounced: number;
  complained: number;
  failed: number;
  pending: number;
  waves: number;
  firstSentAt: string | null;
  lastSentAt: string | null;
  linkClicks: number;
  clicked: number;
  clicks: number;
  unsubscribed: number;
  bought: number;
  boughtAfterClick: number;
  boughtTotal: number;
  counting: number;
  heldOut: number;
}

export const NO_STATS: CampaignStats = {
  handed: 0,
  bounced: 0,
  complained: 0,
  failed: 0,
  pending: 0,
  waves: 0,
  firstSentAt: null,
  lastSentAt: null,
  linkClicks: 0,
  clicked: 0,
  clicks: 0,
  unsubscribed: 0,
  bought: 0,
  boughtAfterClick: 0,
  boughtTotal: 0,
  counting: 0,
  heldOut: 0,
};

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function statsFromRow(row: Record<string, unknown>): CampaignStats {
  return {
    handed: num(row.handed),
    bounced: num(row.bounced),
    complained: num(row.complained),
    failed: num(row.failed),
    pending: num(row.pending),
    waves: num(row.waves),
    firstSentAt: typeof row.first_sent_at === "string" ? row.first_sent_at : null,
    lastSentAt: typeof row.last_sent_at === "string" ? row.last_sent_at : null,
    linkClicks: num(row.link_clicks),
    clicked: num(row.clicked),
    clicks: num(row.clicks),
    unsubscribed: num(row.unsubscribed),
    bought: num(row.bought),
    boughtAfterClick: num(row.bought_after_click),
    boughtTotal: num(row.bought_total),
    counting: num(row.counting),
    heldOut: num(row.held_out),
  };
}

export interface CampaignListItem {
  campaign: Campaign;
  stats: CampaignStats;
}

export async function listCampaigns(admin: SupabaseClient): Promise<CampaignListItem[]> {
  const [campaigns, stats] = await Promise.all([
    admin.from("email_campaigns").select(CAMPAIGN_COLUMNS).is("archived_at", null).order("created_at", { ascending: false }),
    admin.from("email_campaign_stats").select("*"),
  ]);
  if (campaigns.error) throw new Error(`Could not read the campaigns: ${campaigns.error.message}`);
  if (stats.error) throw new Error(`Could not read the campaigns' numbers: ${stats.error.message}`);
  const byId = new Map(
    ((stats.data ?? []) as Record<string, unknown>[]).map((r) => [String(r.campaign_id), statsFromRow(r)] as const),
  );
  return ((campaigns.data ?? []) as unknown as Record<string, unknown>[]).flatMap((row) => {
    const campaign = campaignFromRow(row);
    return campaign ? [{ campaign, stats: byId.get(campaign.id) ?? NO_STATS }] : [];
  });
}

export interface PastCampaign {
  id: string;
  name: string;
  subject: string;
  createdAt: string;
  started: boolean;
  archived: boolean;
}

export const PAST_CAMPAIGNS_LISTED = 50;

export async function listPastCampaigns(admin: SupabaseClient): Promise<PastCampaign[]> {
  const { data, error } = await admin
    .from("email_campaigns")
    .select("id, name, subject, created_at, locked_at, archived_at")
    .order("created_at", { ascending: false })
    .limit(PAST_CAMPAIGNS_LISTED);
  if (error) throw new Error(`Could not read the campaigns: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).flatMap((r) =>
    typeof r.id === "string"
      ? [
          {
            id: r.id,
            name: typeof r.name === "string" ? r.name : "",
            subject: typeof r.subject === "string" ? r.subject : "",
            createdAt: typeof r.created_at === "string" ? r.created_at : "",
            started: typeof r.locked_at === "string",
            archived: typeof r.archived_at === "string",
          },
        ]
      : [],
  );
}

export interface CampaignFilterOption {
  id: string;
  name: string;
}

export const CAMPAIGN_FILTER_OPTIONS_LISTED = 100;

export async function listCampaignFilterOptions(
  admin: SupabaseClient,
  alsoIds: readonly string[] = [],
): Promise<CampaignFilterOption[]> {
  const started = await admin
    .from("email_campaigns")
    .select("id, name")
    .not("locked_at", "is", null)
    .order("locked_at", { ascending: false })
    .limit(CAMPAIGN_FILTER_OPTIONS_LISTED);
  if (started.error) throw new Error(`Could not read the campaigns: ${started.error.message}`);
  const options = ((started.data ?? []) as Record<string, unknown>[]).flatMap((r) =>
    typeof r.id === "string" ? [{ id: r.id, name: typeof r.name === "string" ? r.name : "" }] : [],
  );
  const missing = alsoIds.filter((id) => !options.some((o) => o.id === id));
  if (!missing.length) return options;
  const more = await admin.from("email_campaigns").select("id, name").in("id", missing);
  if (more.error) throw new Error(`Could not read the campaigns: ${more.error.message}`);
  return [
    ...options,
    ...((more.data ?? []) as Record<string, unknown>[]).flatMap((r) =>
      typeof r.id === "string" ? [{ id: r.id, name: typeof r.name === "string" ? r.name : "" }] : [],
    ),
  ];
}

export async function getCampaign(admin: SupabaseClient, id: string): Promise<Campaign | null> {
  const { data, error } = await admin.from("email_campaigns").select(CAMPAIGN_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(`Could not read the campaign: ${error.message}`);
  return data ? campaignFromRow(data as unknown as Record<string, unknown>) : null;
}

export async function getCampaignStats(admin: SupabaseClient, id: string): Promise<CampaignStats> {
  const { data, error } = await admin.from("email_campaign_stats").select("*").eq("campaign_id", id).maybeSingle();
  if (error) throw new Error(`Could not read the campaign's numbers: ${error.message}`);
  return data ? statsFromRow(data as Record<string, unknown>) : NO_STATS;
}

export async function createCampaign(
  admin: SupabaseClient,
  draft: CampaignDraft,
  createdByProfileId: string | null,
): Promise<string> {
  const { data, error } = await admin
    .from("email_campaigns")
    .insert({ ...campaignRowFromDraft(draft), created_by_profile_id: createdByProfileId })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Could not save the campaign: ${error?.message ?? "no answer"}`);
  return (data as { id: string }).id;
}

export async function updateCampaign(admin: SupabaseClient, id: string, draft: CampaignDraft, locked: boolean): Promise<void> {
  const row = locked ? { name: draft.name } : campaignRowFromDraft(draft);
  const { error } = await admin.from("email_campaigns").update(row).eq("id", id).is("archived_at", null);
  if (error) throw new Error(error.message);
}

export async function pointDraftAt(admin: SupabaseClient, id: string, segmentId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("email_campaigns")
    .update({ audience: "segment", segment_id: segmentId })
    .eq("id", id)
    .is("locked_at", null)
    .is("archived_at", null)
    .select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length === 1;
}

export async function archiveCampaign(admin: SupabaseClient, id: string): Promise<void> {
  const { error } = await admin
    .from("email_campaigns")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .is("archived_at", null);
  if (error) throw new Error(`Could not archive the campaign: ${error.message}`);
}

export async function lockCampaign(admin: SupabaseClient, id: string): Promise<void> {
  const { error } = await admin
    .from("email_campaigns")
    .update({ locked_at: new Date().toISOString() })
    .eq("id", id)
    .is("locked_at", null);
  if (error) throw new Error(`Could not lock the campaign: ${error.message}`);
}

export async function readKeptSendingCampaigns(admin: SupabaseClient): Promise<Campaign[]> {
  const { data, error } = await admin
    .from("email_campaigns")
    .select(CAMPAIGN_COLUMNS)
    .eq("keep_sending", true)
    .is("keep_sending_paused_at", null)
    .is("archived_at", null)
    .order("locked_at", { ascending: true });
  if (error) throw new Error(`Could not read the campaigns that keep sending: ${error.message}`);
  return ((data ?? []) as unknown as Record<string, unknown>[]).flatMap((row) => {
    const c = campaignFromRow(row);
    return c && c.lockedAt ? [c] : [];
  });
}

export async function saveKeepSending(
  admin: SupabaseClient,
  id: string,
  change:
    | { on: true; dailyCap: number; segments: Record<string, ApprovedSegment> }
    | { on: false }
    | { dailyCap: number }
    | { paused: true; at: string }
    | { paused: false; segments: Record<string, ApprovedSegment> }
    | { holdout: true; at: string }
    | { holdout: false },
): Promise<KeepSending> {
  const row =
    "on" in change
      ? change.on
        ? {
            keep_sending: true,
            keep_sending_daily_cap: change.dailyCap,
            keep_sending_paused_at: null,
            keep_sending_paused_reason: null,
            keep_sending_segments: approvedSegmentsRow(change.segments),
          }
        :
          { keep_sending: false, keep_sending_paused_at: null, keep_sending_paused_reason: null, keep_sending_segments: null, holdout_at: null }
      : "holdout" in change
        ? { holdout_at: change.holdout ? change.at : null }
      : "paused" in change
        ? change.paused
          ? { keep_sending_paused_at: change.at, keep_sending_paused_reason: null }
          : { keep_sending_paused_at: null, keep_sending_paused_reason: null, keep_sending_segments: approvedSegmentsRow(change.segments) }
        : { keep_sending_daily_cap: change.dailyCap };
  const { data, error } = await admin
    .from("email_campaigns")
    .update(row)
    .eq("id", id)
    .is("archived_at", null)
    .select(KEEP_SENDING_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`Could not save keep sending: ${error.message}`);
  if (!data) throw new Error("That campaign does not exist.");
  return keepSendingFromRow(data as unknown as Record<string, unknown>);
}

export async function pauseKeptSending(admin: SupabaseClient, id: string, reason: string, at: Date): Promise<void> {
  const { error } = await admin
    .from("email_campaigns")
    .update({ keep_sending_paused_at: at.toISOString(), keep_sending_paused_reason: reason.slice(0, 500) })
    .eq("id", id)
    .eq("keep_sending", true)
    .is("keep_sending_paused_at", null);
  if (error) throw new Error(`Could not pause the campaign: ${error.message}`);
}

export async function countWaveClaims(admin: SupabaseClient, campaignId: string, wave: string): Promise<number> {
  const { count, error } = await admin
    .from("customer_campaign_sends")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("wave", wave)
    .neq("status", "held_out");
  if (error) throw new Error(`Could not count today's sends: ${error.message}`);
  return count ?? 0;
}

export async function readCampaignResults(admin: SupabaseClient, id: string): Promise<CampaignResults> {
  const { data, error } = await admin.from("email_campaign_stage_results").select("*").eq("campaign_id", id);
  if (error) throw new Error(`Could not read the campaign's results: ${error.message}`);
  return resultsFromRows((data ?? []) as Record<string, unknown>[]);
}

export async function readKeptToday(admin: SupabaseClient, now: Date): Promise<number> {
  const { count, error } = await admin
    .from("customer_campaign_sends")
    .select("id", { count: "exact", head: true })
    .eq("wave", keptWaveLabel(now))
    .in("status", ["sent", "bounced", "complained"]);
  if (error) throw new Error(`Could not count today's kept-sending emails: ${error.message}`);
  return count ?? 0;
}

const PAGE = 1000;
const ID_CHUNK = 200;

type CandidateQuery = ReturnType<ReturnType<SupabaseClient["from"]>["select"]>;

async function readPaged(
  admin: SupabaseClient,
  campaignId: string,
  scope: (q: CandidateQuery) => CandidateQuery,
): Promise<CampaignCandidate[]> {
  const out: CampaignCandidate[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await scope(admin.from("marketing_campaign_candidates").select(CANDIDATE_COLUMNS))
      .order("customer_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Could not read the audience: ${error.message}`);
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    for (const row of rows) {
      const c = candidateFromRow(row, campaignId);
      if (c) out.push(c);
    }
    if (rows.length < PAGE) return out;
  }
}

export async function readCampaignCandidates(
  admin: SupabaseClient,
  campaign: Pick<Campaign, "id" | "audience">,
  segmentIds?: () => AsyncIterable<string[]>,
): Promise<CampaignCandidate[]> {
  const [candidates, unengaged] = await Promise.all([readAudience(admin, campaign, segmentIds), readUnengagedIds(admin)]);
  for (const c of candidates) c.unengaged = unengaged.has(c.customerId);
  return candidates;
}

async function readAudience(
  admin: SupabaseClient,
  campaign: Pick<Campaign, "id" | "audience">,
  segmentIds?: () => AsyncIterable<string[]>,
): Promise<CampaignCandidate[]> {
  if (campaign.audience === "imported_not_signed_in") {
    return readPaged(admin, campaign.id, (q) => q.eq("migrated", true));
  }
  if (campaign.audience === "subscribed") return readPaged(admin, campaign.id, (q) => q);
  if (!segmentIds) throw new Error("A Segment campaign needs its Segment's Customers");
  const out: CampaignCandidate[] = [];
  for await (const page of segmentIds()) {
    for (let i = 0; i < page.length; i += ID_CHUNK) {
      const ids = page.slice(i, i + ID_CHUNK);
      out.push(...(await readPaged(admin, campaign.id, (q) => q.in("customer_id", ids))));
    }
  }
  return out;
}

export async function readUnengagedIds(admin: SupabaseClient): Promise<Set<string>> {
  const out = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("admin_customer_overview")
      .select("id")
      .eq("unengaged", true)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Could not read who is unengaged: ${error.message}`);
    const rows = (data ?? []) as { id: unknown }[];
    for (const row of rows) if (typeof row.id === "string") out.add(row.id);
    if (rows.length < PAGE) return out;
  }
}

export async function readLatestPillows(admin: SupabaseClient, customerIds: readonly string[]): Promise<Map<string, RecipientPillow>> {
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < customerIds.length; i += ID_CHUNK) {
    const ids = customerIds.slice(i, i + ID_CHUNK);
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await admin
        .from("customer_purchase_lines")
        .select(PILLOW_LINE_COLUMNS)
        .eq("product_type", "pillow")
        .in("customer_id", ids)
        .order("order_item_id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`Could not read their pillows: ${error.message}`);
      const page = (data ?? []) as Record<string, unknown>[];
      rows.push(...page);
      if (page.length < PAGE) break;
    }
  }
  return latestPillows(rows);
}

export async function readRecipientFacts(admin: SupabaseClient, customerIds: readonly string[]): Promise<RecipientFacts[]> {
  const rows = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < customerIds.length; i += ID_CHUNK) {
    const ids = customerIds.slice(i, i + ID_CHUNK);
    const { data, error } = await admin.from("admin_customer_overview").select(RECIPIENT_FACT_COLUMNS).in("id", ids);
    if (error) throw new Error(`Could not read who it goes to: ${error.message}`);
    for (const row of (data ?? []) as unknown as Record<string, unknown>[]) rows.set(String(row.id), row);
  }
  const pillows = await readLatestPillows(admin, customerIds);
  return customerIds.flatMap((id) => {
    const row = rows.get(id);
    const facts = row ? recipientFactsFromRow(row, pillows.get(id) ?? null) : null;
    return facts ? [facts] : [];
  });
}

export async function readProductClasses(admin: SupabaseClient, productIds: readonly string[]): Promise<Record<string, BoughtClass[]>> {
  if (!productIds.length) return {};
  const { data, error } = await admin.from("products").select("id, product_type, product_variants(pillow_product_id)").in("id", [...productIds]);
  if (error) throw new Error(`Could not read the products: ${error.message}`);
  const rows = (data ?? []) as unknown as { id: string; product_type: string | null; product_variants: { pillow_product_id: number | string | null }[] | null }[];
  const pillowIds = [...new Set(rows.flatMap((r) => (r.product_variants ?? []).flatMap((v) => (v.pillow_product_id == null ? [] : [String(v.pillow_product_id)]))))];
  const kinds = new Map<string, string>();
  if (pillowIds.length) {
    const { data: pillows, error: pillowError } = await admin.from("pillow_products").select("id, kind").in("id", pillowIds);
    if (pillowError) throw new Error(`Could not read the pillow products: ${pillowError.message}`);
    for (const p of (pillows ?? []) as { id: number | string; kind: string | null }[]) if (p.kind) kinds.set(String(p.id), p.kind);
  }
  return productClasses(rows, kinds);
}

export async function readWaveStats(
  admin: SupabaseClient,
  campaignId: string,
): Promise<{ all: CampaignWaveStats[]; own: CampaignWaveStats[] }> {
  const all = await readCampaignWaveStats(admin);
  const key = campaignLedgerKey(campaignId);
  return { all, own: all.filter((s) => s.template === key) };
}

export type MarketingClaim =
  | {
      claimed: true;
      sendId: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
      locale: string;
      unclaimedMigrated: boolean;
    }
  | { claimed: false; blocker: CampaignClaimBlocker };

const name = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export function marketingClaimFromRow(data: unknown): MarketingClaim {
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined;
  if (row && typeof row.send_id === "string" && typeof row.email === "string") {
    return {
      claimed: true,
      sendId: row.send_id,
      email: row.email,
      firstName: name(row.first_name),
      lastName: name(row.last_name),
      locale: typeof row.locale === "string" ? row.locale : "en-US",
      unclaimedMigrated: row.unclaimed_migrated === true,
    };
  }
  const blocker = typeof row?.blocker === "string" ? row.blocker : "already_sent";
  return { claimed: false, blocker: blocker as CampaignClaimBlocker };
}

export async function claimMarketingCampaignSend(
  admin: SupabaseClient,
  p: { customerId: string; campaignId: string; wave: string; retryFailed?: boolean },
): Promise<MarketingClaim | { error: string }> {
  const { data, error } = await admin.rpc("claim_marketing_campaign_send", {
    p_customer_id: p.customerId,
    p_campaign_id: p.campaignId,
    p_wave: p.wave,
    p_retry_failed: Boolean(p.retryFailed),
  });
  if (error) return { error: error.message };
  return marketingClaimFromRow(data);
}
