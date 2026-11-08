/**
 * Points: every read and write (PRD-loyalty-points; ADR 0030;
 * 20261021120000_points_ledger.sql). The ledger, its views and its functions
 * are service-role only: the Admin Panel calls these after checking its
 * permission, and the Profile with the session's own Customer id. Each takes
 * the client, so tests pass a fake.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { POINTS_LEDGER_KINDS, type PointsLedgerKind } from "./kinds";
import { POINTS_SETTING_KEYS, pointsSettingsFromRows, pointsSettingsToRows, type PointsSettings } from "./settings";

export { POINTS_KIND_LABEL, POINTS_LEDGER_KINDS, type PointsLedgerKind } from "./kinds";

/** What a Customer holds. Points never expire, so there is no date. */
export interface PointsBalance {
  available: number;
  pending: number;
}

export const NO_BALANCE: PointsBalance = { available: 0, pending: 0 };

export interface PointsEntry {
  id: string;
  kind: PointsLedgerKind;
  points: number;
  orderId: string | null;
  orderNumber: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface PendingOrderPoints {
  orderId: string;
  orderNumber: string;
  points: number;
  /** When they become usable; null while the order is not yet delivered. */
  releaseAt: string | null;
}

const int = (v: unknown) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);
const one = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/** The settings as typed values. Throws on a failed read. */
export async function readPointsSettings(admin: SupabaseClient): Promise<PointsSettings> {
  const { data, error } = await admin.from("site_settings").select("key, value").in("key", Object.values(POINTS_SETTING_KEYS));
  if (error) throw new Error(`Could not read the points settings: ${error.message}`);
  return pointsSettingsFromRows((data ?? []) as { key: string; value: string }[]);
}

/** Saves the settings, already validated. */
export async function savePointsSettings(admin: SupabaseClient, s: PointsSettings): Promise<void> {
  const rows = pointsSettingsToRows(s);
  const updated_at = new Date().toISOString();
  const { error } = await admin.from("site_settings").upsert(rows.upsert.map((r) => ({ ...r, updated_at })), { onConflict: "key" });
  if (error) throw new Error(`Could not save the points settings: ${error.message}`);
  if (rows.remove.length) {
    const { error: delError } = await admin.from("site_settings").delete().in("key", rows.remove);
    if (delError) throw new Error(`Could not save the points settings: ${delError.message}`);
  }
}

/** One Customer's balance. Throws on a failed read. */
export async function readPointsBalance(admin: SupabaseClient, customerId: string): Promise<PointsBalance> {
  const { data, error } = await admin.rpc("points_balance", { p_customer_id: customerId });
  if (error) throw new Error(`Could not read the points balance: ${error.message}`);
  const row = one(data as Record<string, unknown> | Record<string, unknown>[] | null);
  if (!row) return NO_BALANCE;
  return {
    available: int(row.available),
    pending: int(row.pending),
  };
}

type EntryRow = {
  id: string;
  kind: string;
  points: number;
  order_id: string | null;
  note: string | null;
  created_at: string;
  order: { order_number: string } | { order_number: string }[] | null;
  staff: { name: string } | { name: string }[] | null;
};

/** The latest entries of one Customer's ledger, newest first. Throws on a failed read. */
export async function readPointsHistory(admin: SupabaseClient, customerId: string, limit = 20): Promise<PointsEntry[]> {
  const { data, error } = await admin
    .from("points_ledger")
    .select("id, kind, points, order_id, note, created_at, order:orders(order_number), staff:mp_staff!created_by_profile_id(name)")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not read the points history: ${error.message}`);
  return ((data ?? []) as unknown as EntryRow[]).map((r) => ({
    id: r.id,
    kind: (POINTS_LEDGER_KINDS as readonly string[]).includes(r.kind) ? (r.kind as PointsLedgerKind) : "adjust",
    points: int(r.points),
    orderId: r.order_id,
    orderNumber: one(r.order)?.order_number ?? null,
    note: r.note,
    createdBy: one(r.staff)?.name ?? null,
    createdAt: r.created_at,
  }));
}

/** One Customer's pending points, by Order, soonest first. Throws on a failed read. */
export async function readPendingOrders(admin: SupabaseClient, customerId: string): Promise<PendingOrderPoints[]> {
  const { data, error } = await admin
    .from("points_order_candidates")
    .select("order_id, order_number, points, release_at")
    .eq("customer_id", customerId)
    .order("release_at", { ascending: true, nullsFirst: false });
  if (error) throw new Error(`Could not read the pending points: ${error.message}`);
  return ((data ?? []) as { order_id: string; order_number: string; points: number; release_at: string | null }[]).map((r) => ({
    orderId: r.order_id,
    orderNumber: r.order_number,
    points: int(r.points),
    releaseAt: r.release_at,
  }));
}

export interface MilestoneStanding {
  /** Points earned from orders over the customer's lifetime: earned less clawed back. */
  earned: number;
  /** Milestone bonuses already granted. */
  granted: number;
}

/**
 * One Customer's place on the milestone ladder (slice 09;
 * `points_milestone_progress`). Zero for a Customer with no entries. Throws on
 * a failed read.
 */
export async function readMilestoneStanding(admin: SupabaseClient, customerId: string): Promise<MilestoneStanding> {
  const { data, error } = await admin
    .from("points_milestone_progress")
    .select("earned, granted")
    .eq("customer_id", customerId)
    .maybeSingle();
  if (error) throw new Error(`Could not read the milestone progress: ${error.message}`);
  const r = (data ?? {}) as { earned?: unknown; granted?: unknown };
  return { earned: int(r.earned), granted: int(r.granted) };
}

/** Rule (r), asked of SQL. Throws on a failed read. */
export async function isPartnerCustomer(admin: SupabaseClient, customerId: string): Promise<boolean> {
  const { data, error } = await admin.rpc("is_partner_customer", { p_customer_id: customerId });
  if (error) throw new Error(`Could not check whether this customer is a partner: ${error.message}`);
  return data === true;
}

/**
 * A Staff adjustment (rule n). Returns the new balance, or the refusal in
 * words: a partner, no reason, zero, or below zero.
 */
export async function adjustPoints(
  admin: SupabaseClient,
  p: { customerId: string; points: number; note: string; profileId: string | null },
): Promise<{ ok: true; available: number } | { ok: false; error: string }> {
  const { data, error } = await admin.rpc("adjust_points", {
    p_customer_id: p.customerId,
    p_points: p.points,
    p_note: p.note,
    p_profile_id: p.profileId,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, available: int(data) };
}

export interface PointsSummary {
  outstanding: number;
  pending: number;
  earned: number;
  spent: number;
  spentThisMonth: number;
  clawedBack: number;
  clawedBackThisMonth: number;
  claimBonuses: number;
  milestoneBonuses: number;
  milestoneBonusPoints: number;
  /** Past-purchase points granted (ADR 0030, 2026-11-08): entries and points. */
  pastPurchaseGrants: number;
  pastPurchasePoints: number;
}

/** What points cost now (`admin_points_summary`). Throws on a failed read. */
export async function readPointsSummary(admin: SupabaseClient): Promise<PointsSummary> {
  const { data, error } = await admin.from("admin_points_summary").select("*").maybeSingle();
  if (error) throw new Error(`Could not read what points cost: ${error.message}`);
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    outstanding: int(r.outstanding_points),
    pending: int(r.pending_points),
    earned: int(r.earned_points),
    spent: int(r.spent_points),
    spentThisMonth: int(r.spent_points_month),
    clawedBack: int(r.clawed_back_points),
    clawedBackThisMonth: int(r.clawed_back_points_month),
    claimBonuses: int(r.claim_bonuses),
    milestoneBonuses: int(r.milestone_bonuses),
    milestoneBonusPoints: int(r.milestone_bonus_points),
    pastPurchaseGrants: int(r.past_purchase_grants),
    pastPurchasePoints: int(r.past_purchase_points),
  };
}

/**
 * **Past-purchase points** (ADR 0030, amendment of 2026-11-08): what one run
 * would grant now, and what earlier runs granted. Each Migrated customer gets
 * floor(earn rate × their Shopify-era spend), once; partners none.
 */
export interface PastPurchasePreview {
  /** Customers a run would grant now, and the points it would grant them. */
  customers: number;
  points: number;
  /** What those customers spent on the old shop, S$. */
  spend: number;
  /** The middle and the largest grant, in points. */
  median: number;
  largest: number;
  /** What earlier runs granted. */
  grantedCustomers: number;
  grantedPoints: number;
  /** Migrated customers with Shopify-era spend who are partners, so get none. */
  partnersLeftOut: number;
  /** The rate the points are worked out at: the earn rate now. */
  earnPerDollar: number;
}

/** `past_purchase_points_preview()`. Throws on a failed read. */
export async function readPastPurchasePreview(admin: SupabaseClient): Promise<PastPurchasePreview> {
  const { data, error } = await admin.rpc("past_purchase_points_preview");
  if (error) throw new Error(`Could not work out the past-purchase points: ${error.message}`);
  const r = one(data as Record<string, unknown> | Record<string, unknown>[] | null) ?? {};
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    customers: int(r.customers),
    points: int(r.points),
    spend: Math.round(num(r.spend) * 100) / 100,
    median: int(r.median),
    largest: int(r.largest),
    grantedCustomers: int(r.granted_customers),
    grantedPoints: int(r.granted_points),
    partnersLeftOut: int(r.partners_left_out),
    earnPerDollar: num(r.earn_per_dollar),
  };
}

/**
 * Grants the Past-purchase points the preview showed, in one statement. The
 * database refuses, in words, when the customers or points are no longer the
 * ones expected (an import or a rate change since the preview).
 */
export async function grantPastPurchasePoints(
  admin: SupabaseClient,
  p: { profileId: string | null; customers: number; points: number },
): Promise<{ ok: true; customers: number; points: number } | { ok: false; error: string }> {
  const { data, error } = await admin.rpc("grant_past_purchase_points", {
    p_profile_id: p.profileId,
    p_expect_customers: p.customers,
    p_expect_points: p.points,
  });
  if (error) return { ok: false, error: error.message };
  const r = one(data as Record<string, unknown> | Record<string, unknown>[] | null) ?? {};
  return { ok: true, customers: int(r.customers), points: int(r.points) };
}

export { POINTS_SETTING_KEYS };
