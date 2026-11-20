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
  amount: number;
  stripeObjectId?: string | null;
}

export type MoneyStatus = "paid" | "partially_refunded" | "refunded";

export interface MoneyState {
  amountCaptured: number;
  amountRefunded: number;
  netPaid: number;
  status: MoneyStatus;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function addEntry(entries: LedgerEntry[], entry: LedgerEntry): LedgerEntry[] {
  if (entry.stripeObjectId && entries.some((e) => e.stripeObjectId === entry.stripeObjectId)) {
    return entries;
  }
  return [...entries, entry];
}

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
  occurredAt?: string | null;
}

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
    if (error.code === "23505") return { recorded: false };
    throw new Error(`Failed to record ledger entry (${entry.type}): ${error.message}`);
  }
  return { recorded: true };
}

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
