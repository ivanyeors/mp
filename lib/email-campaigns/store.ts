/**
 * Email campaigns: every read and write (PRD-email-marketing;
 * 20261021100000_email_campaigns.sql). The table, its views and its functions
 * are service-role only, so the Admin Panel calls these after checking the
 * `campaigns` permission. Each takes the client, so tests pass a fake.
 */
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

/** One Campaign's numbers (`email_campaign_stats`). */
export interface CampaignStats {
  handed: number;
  bounced: number;
  complained: number;
  failed: number;
  pending: number;
  waves: number;
  firstSentAt: string | null;
  lastSentAt: string | null;
  /** Claim links its emails carried that were opened. */
  linkClicks: number;
  /** Sends with a counted **Campaign click** on a site link (PRD-campaign-audiences slice 08). */
  clicked: number;
  /** Every counted click, a person's second and third included. */
  clicks: number;
  /** People who left from this campaign's own unsubscribe link (slice 08). */
  unsubscribed: number;
  /** People sent it who bought within 30 days (slice 11, results.ts). */
  bought: number;
  /** Of those, the ones who bought after their first click. */
  boughtAfterClick: number;
  /** What they bought, in S$, net of refunds. */
  boughtTotal: number;
  /** People sent it under 30 days ago, whose window is still open. */
  counting: number;
  /** People its holdout kept back: never sent it (slice 11). */
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

/** Pure — one `email_campaign_stats` row. */
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

/** Live Campaigns, newest first, with their numbers. Throws on a failed read. */
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

/** A campaign to start from, as the Start panel lists it (PRD-campaign-email-editor slice 08). */
export interface PastCampaign {
  id: string;
  name: string;
  subject: string;
  createdAt: string;
  /** Its first wave was planned. */
  started: boolean;
  archived: boolean;
}

/** The most the Start panel lists: the newest. */
export const PAST_CAMPAIGNS_LISTED = 50;

/**
 * Every Campaign, archived ones included, newest first, to start a new one
 * from: only what the list shows, never its content. Throws on a failed read.
 */
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

/** A campaign the Customers list's *Campaign* filter offers (PRD-campaign-audiences slice 05). */
export interface CampaignFilterOption {
  id: string;
  name: string;
}

/** The most the *Campaign* filter lists: the latest started. */
export const CAMPAIGN_FILTER_OPTIONS_LISTED = 100;

/**
 * Every campaign that has started sending, archived ones too, the latest
 * started first: the ones *got it*, *clicked it* and the rest can be about.
 * `alsoIds` adds campaigns a link names that are not among them (a draft, an
 * older one), so its chip still reads a name. Names only, never content:
 * the Customers page reads these with `customers`, not `campaigns`. Throws on
 * a failed read.
 */
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

/** One Campaign, archived or not; null when there is none. */
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

/** Saves a new Campaign; returns its id. */
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

/**
 * Saves a Campaign's draft. Once it is locked only the name can change, and
 * the table's trigger refuses anything else, whatever the caller sends.
 */
export async function updateCampaign(admin: SupabaseClient, id: string, draft: CampaignDraft, locked: boolean): Promise<void> {
  const row = locked ? { name: draft.name } : campaignRowFromDraft(draft);
  const { error } = await admin.from("email_campaigns").update(row).eq("id", id).is("archived_at", null);
  if (error) throw new Error(error.message);
}

export async function archiveCampaign(admin: SupabaseClient, id: string): Promise<void> {
  const { error } = await admin
    .from("email_campaigns")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .is("archived_at", null);
  if (error) throw new Error(`Could not archive the campaign: ${error.message}`);
}

/** Fixes the content: called when the first wave is planned. */
export async function lockCampaign(admin: SupabaseClient, id: string): Promise<void> {
  const { error } = await admin
    .from("email_campaigns")
    .update({ locked_at: new Date().toISOString() })
    .eq("id", id)
    .is("locked_at", null);
  if (error) throw new Error(`Could not lock the campaign: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Kept sending (PRD-campaign-audiences slice 10; 20261031155043_campaign_keep_sending.sql)
// ---------------------------------------------------------------------------

/** Every live campaign kept sending and not paused, oldest started first: the daily job's list. */
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

/**
 * A person's change to keep sending: on (with the Segments' filters they
 * approve now), off, a new cap, a pause or a resume. A live campaign only;
 * returns the state as stored.
 */
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
        : // Off ends the holdout too: only a campaign that keeps sending holds out. Its held-out rows stay.
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

/** The daily job pauses a campaign, saying why; a no-op for one a person paused or turned off meanwhile. */
export async function pauseKeptSending(admin: SupabaseClient, id: string, reason: string, at: Date): Promise<void> {
  const { error } = await admin
    .from("email_campaigns")
    .update({ keep_sending_paused_at: at.toISOString(), keep_sending_paused_reason: reason.slice(0, 500) })
    .eq("id", id)
    .eq("keep_sending", true)
    .is("keep_sending_paused_at", null);
  if (error) throw new Error(`Could not pause the campaign: ${error.message}`);
}

/**
 * How many sends one Wave of a campaign has claimed, whatever became of them:
 * the day's cap counts them all. People held out got no email and are not
 * counted (slice 11).
 */
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

/** One campaign's results by stage, and its holdout beside the people sent (slice 11). Throws on a failed read. */
export async function readCampaignResults(admin: SupabaseClient, id: string): Promise<CampaignResults> {
  const { data, error } = await admin.from("email_campaign_stage_results").select("*").eq("campaign_id", id);
  if (error) throw new Error(`Could not read the campaign's results: ${error.message}`);
  return resultsFromRows((data ?? []) as Record<string, unknown>[]);
}

/** Today's kept-sending emails the provider took, across campaigns: the Sending card's line. */
export async function readKeptToday(admin: SupabaseClient, now: Date): Promise<number> {
  const { count, error } = await admin
    .from("customer_campaign_sends")
    .select("id", { count: "exact", head: true })
    .eq("wave", keptWaveLabel(now))
    .in("status", ["sent", "bounced", "complained"]);
  if (error) throw new Error(`Could not count today's kept-sending emails: ${error.message}`);
  return count ?? 0;
}

/** PostgREST returns at most this many rows a request, so reads page. */
const PAGE = 1000;
/** Ids per `in (...)` filter, to keep the URL short. */
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

/**
 * Everyone in a Campaign's audience, before the rule. The imported audience is
 * every Migrated customer; the subscribed one is every Customer; a Segment is
 * the ids `segmentIds` yields (lib/crm/segments.ts `resolveSegment`, which
 * throws for a Segment that is archived or needs review).
 */
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

/**
 * Every Unengaged Customer (PRD-campaign-audiences slice 12): the overview's
 * `unengaged`, the column the Customers list's *Engagement* filter and the
 * claim's rule read, so the plan, the list and the send agree.
 */
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

/**
 * Each customer's latest pillow, for *Your pillow* (PRD-campaign-audiences
 * slice 09): their pillow purchase lines, the latest of them. One with no
 * pillow line here is left out, and reads the fallback.
 */
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

/**
 * What the fit checks know of each planned recipient (slice 09), in the
 * order asked: the Customer overview's facts (`RECIPIENT_FACT_COLUMNS`: no
 * review, rating or note) and their latest pillow. One not in the overview
 * is left out.
 */
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

/** What buying each product makes you (slice 09), as the purchase lines classify it. Products that no longer exist are left out. */
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

/** Every wave of every campaign email, for the pause rule, and this Campaign's own. */
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
      /** For the *Last name* Variable (PRD-campaign-email-editor slice 13). */
      lastName: string | null;
      locale: string;
      /** A Migrated customer who has not Claimed: their sign-in button is their own Claim link. */
      unclaimedMigrated: boolean;
    }
  | { claimed: false; blocker: CampaignClaimBlocker };

const name = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Pure — `claim_marketing_campaign_send`'s one row. */
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

/**
 * Claims one send: the rule, re-run in SQL now, then the `pending` row.
 * Returns `{ error }` when the call itself fails.
 */
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
