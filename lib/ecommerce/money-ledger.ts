/**
 * Money ledger: an order's net money is the sum of an append-only set of signed
 * `order_payments` rows (charge, refund, dispute outcome, fee, adjustment),
 * rather than a single `status` flag. Each Stripe-driven row carries a unique
 * `stripe_object_id`, so a re-delivered webhook is a no-op (idempotency lives in
 * the DB unique index; `recordLedgerEntry` reports whether a row was new).
 *
 * The arithmetic (`summarize`, `addEntry`, `ledgerReconciles`) is pure and
 * dependency-free so it can be unit-tested over raw numbers; the DB helpers
 * (`recordLedgerEntry`, `rollupOrderMoney`) wrap it for the webhook.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type LedgerType =
  | "charge"
  | "refund"
  | "dispute_hold"
  | "dispute_loss"
  | "dispute_won"
  | "fee"
  | "adjustment";

export interface LedgerEntry {
  type: LedgerType;
  /** Signed major units (e.g. dollars): credits positive, debits negative. */
  amount: number;
  /** Stripe object id (pi_…, re_…, dp_…); the idempotency key when present. */
  stripeObjectId?: string | null;
}

export type MoneyStatus = "paid" | "partially_refunded" | "refunded";

export interface MoneyState {
  /** Sum of charge rows. */
  amountCaptured: number;
  /** Absolute sum of refund rows. */
  amountRefunded: number;
  /** Net of every signed row (includes disputes/fees). */
  netPaid: number;
  status: MoneyStatus;
}

/** Round to 2 decimal places (currency), avoiding binary float drift. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Append an entry unless one with the same `stripeObjectId` already exists —
 * the in-memory mirror of the DB unique constraint, so duplicate events don't
 * double-count.
 */
export function addEntry(entries: LedgerEntry[], entry: LedgerEntry): LedgerEntry[] {
  if (entry.stripeObjectId && entries.some((e) => e.stripeObjectId === entry.stripeObjectId)) {
    return entries;
  }
  return [...entries, entry];
}

/** Derive captured/refunded/net and the money status from ledger rows. */
export function summarize(entries: LedgerEntry[]): MoneyState {
  let captured = 0;
  let refunded = 0;
  let net = 0;
  for (const e of entries) {
    net += e.amount;
    if (e.type === "charge") captured += e.amount;
    if (e.type === "refund") refunded += Math.abs(e.amount);
  }
  captured = round2(captured);
  refunded = round2(refunded);
  net = round2(net);

  const status: MoneyStatus =
    refunded <= 0 ? "paid" : refunded >= captured ? "refunded" : "partially_refunded";

  return { amountCaptured: captured, amountRefunded: refunded, netPaid: net, status };
}

/**
 * Invariant the webhook guards: the net of charges and refunds equals
 * `total - amountRefunded` (i.e. what we captured matches the order total).
 */
export function ledgerReconciles(
  total: number,
  entries: LedgerEntry[],
  tolerance = 0.01
): boolean {
  const { amountCaptured, amountRefunded } = summarize(entries);
  const left = round2(amountCaptured - amountRefunded);
  const right = round2(total - amountRefunded);
  return Math.abs(left - right) <= tolerance;
}

interface RecordOpts extends LedgerEntry {
  currency?: string;
  metadata?: Record<string, unknown>;
  /**
   * When Stripe moved the money, by Stripe's clock (`lib/stripe/money-time.ts`).
   * Omitted, it is the time the row is written, which can be days late.
   */
  occurredAt?: string | null;
}

/**
 * Insert one ledger row, idempotently on `stripeObjectId`. Returns
 * `recorded: false` when the row already existed (duplicate Stripe event), so
 * callers can skip side effects like emails on a re-delivery.
 */
export async function recordLedgerEntry(
  admin: SupabaseClient,
  orderId: string,
  entry: RecordOpts
): Promise<{ recorded: boolean }> {
  const row = {
    order_id: orderId,
    type: entry.type,
    amount: round2(entry.amount),
    currency: (entry.currency ?? "SGD").toUpperCase(),
    stripe_object_id: entry.stripeObjectId ?? null,
    metadata: entry.metadata ?? {},
    ...(entry.occurredAt ? { occurred_at: entry.occurredAt } : {}),
  };

  const { error } = await admin.from("order_payments").insert(row);
  if (error) {
    // 23505 = unique_violation: the row already exists -> idempotent no-op.
    if (error.code === "23505") return { recorded: false };
    throw new Error(`Failed to record ledger entry (${entry.type}): ${error.message}`);
  }
  return { recorded: true };
}

/**
 * Recompute an order's money rollups from its ledger and persist them. Status is
 * only moved when refunds exist, so a clean paid order keeps its fulfillment
 * status (confirmed/shipped/…) untouched.
 */
export async function rollupOrderMoney(
  admin: SupabaseClient,
  orderId: string
): Promise<MoneyState & { total: number }> {
  const { data: order } = await admin
    .from("orders")
    .select("total")
    .eq("id", orderId)
    .single();

  const { data: rows } = await admin
    .from("order_payments")
    .select("type, amount")
    .eq("order_id", orderId);

  const entries: LedgerEntry[] = (rows ?? []).map((r) => ({
    type: r.type as LedgerType,
    amount: Number(r.amount),
  }));
  const state = summarize(entries);

  const update: Record<string, unknown> = {
    amount_captured: state.amountCaptured,
    amount_refunded: state.amountRefunded,
  };
  if (state.amountRefunded > 0) {
    update.status = state.status === "refunded" ? "refunded" : "partially_refunded";
  }

  await admin.from("orders").update(update).eq("id", orderId);

  return { ...state, total: Number(order?.total ?? 0) };
}
