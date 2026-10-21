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

export interface PointsBalance {
  available: number;
  pending: number;
  lastPurchaseAt: string | null;
  /** A Singapore date, "2028-10-21"; null while nothing is available. */
  expiresOn: string | null;
}

export const NO_BALANCE: PointsBalance = { available: 0, pending: 0, lastPurchaseAt: null, expiresOn: null };

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
  const { data, error } = await admin.from("site_settings").select("key, value").like("key", "points\\_%");
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
    lastPurchaseAt: typeof row.last_purchase_at === "string" ? row.last_purchase_at : null,
    expiresOn: typeof row.expires_on === "string" ? row.expires_on : null,
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
  expired: number;
  expiredThisMonth: number;
  clawedBack: number;
  clawedBackThisMonth: number;
  claimBonuses: number;
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
    expired: int(r.expired_points),
    expiredThisMonth: int(r.expired_points_month),
    clawedBack: int(r.clawed_back_points),
    clawedBackThisMonth: int(r.clawed_back_points_month),
    claimBonuses: int(r.claim_bonuses),
  };
}

export { POINTS_SETTING_KEYS };
