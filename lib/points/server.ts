import type { SupabaseClient } from "@supabase/supabase-js";
import { POINTS_LEDGER_KINDS, type PointsLedgerKind } from "./kinds";
import { POINTS_SETTING_KEYS, pointsLive, pointsSettingsFromRows, pointsSettingsToRows, type PointsSettings } from "./settings";

export { POINTS_KIND_LABEL, POINTS_LEDGER_KINDS, type PointsLedgerKind } from "./kinds";

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
  releaseAt: string | null;
}

const int = (v: unknown) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);
const one = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export async function readPointsSettings(admin: SupabaseClient): Promise<PointsSettings> {
  const { data, error } = await admin.from("site_settings").select("key, value").in("key", Object.values(POINTS_SETTING_KEYS));
  if (error) throw new Error(`Could not read the points settings: ${error.message}`);
  return pointsSettingsFromRows((data ?? []) as { key: string; value: string }[]);
}

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
  earned: number;
  granted: number;
}

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

export async function isPartnerCustomer(admin: SupabaseClient, customerId: string): Promise<boolean> {
  const { data, error } = await admin.rpc("is_partner_customer", { p_customer_id: customerId });
  if (error) throw new Error(`Could not check whether this customer is a partner: ${error.message}`);
  return data === true;
}

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
  pastPurchaseGrants: number;
  pastPurchasePoints: number;
  welcomeBonuses: number;
  welcomeBonusPoints: number;
  flowerPoints: number;
}

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
    welcomeBonuses: int(r.welcome_bonuses),
    welcomeBonusPoints: int(r.welcome_bonus_points),
    flowerPoints: int(r.flower_points),
  };
}

export interface PastPurchasePreview {
  customers: number;
  points: number;
  spend: number;
  median: number;
  largest: number;
  grantedCustomers: number;
  grantedPoints: number;
  partnersLeftOut: number;
  earnPerDollar: number;
}

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

export async function readEarnRateToPromise(admin: SupabaseClient, customerId: string | null): Promise<number | null> {
  try {
    const s = await readPointsSettings(admin);
    if (!pointsLive(s) || s.earnPerDollar <= 0) return null;
    if (customerId && (await isPartnerCustomer(admin, customerId))) return null;
    return s.earnPerDollar;
  } catch {
    return null;
  }
}
