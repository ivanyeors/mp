/**
 * Automated Pre-order restock email (ADR 0005 / UX polish slice 07).
 * Notify open Pre-order Results when the live trigger would clear.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getEmailTransport } from "@/lib/email";
import { renderRestockEmail } from "@/lib/email/results";
import { getDefaultFromAddress } from "@/lib/email/transport";
import { isPreOrder, type PreOrderTriggerInput } from "./pre-order-trigger";
import { loadPreOrderTriggerAtHold } from "./pre-order-persist";

export const RESTOCK_NOTIFY_STATUSES = ["held", "assigned"] as const;
export type RestockNotifyStatus = (typeof RESTOCK_NOTIFY_STATUSES)[number];

const SKIP_STATUSES = [
  "expired",
  "declined",
  "captured",
  "canceled",
  "cancelled",
] as const;

export type RestockCandidateRow = {
  id: string;
  status: string;
  is_pre_order: boolean | null;
  pre_order_restock_notified_at: string | null;
  customer_email: string | null;
  access_token: string | null;
  product_type: "pillow" | "bolster" | string | null;
  preference_lines: unknown;
  suggested_size: string | null;
  suggested_tier: string | null;
  suggested_length: string | null;
};

/** Pure: open Pre-order Results not yet notified. */
export function selectRestockNotifyCandidates(
  rows: ReadonlyArray<RestockCandidateRow>,
): RestockCandidateRow[] {
  return rows.filter((r) => {
    if (!r.is_pre_order) return false;
    if (r.pre_order_restock_notified_at != null) return false;
    if (!RESTOCK_NOTIFY_STATUSES.includes(r.status as RestockNotifyStatus)) {
      return false;
    }
    if (SKIP_STATUSES.includes(r.status as (typeof SKIP_STATUSES)[number])) {
      return false;
    }
    if (!r.customer_email?.trim()) return false;
    return true;
  });
}

/** True when inventory recovered enough that Pre-order trigger clears. */
export function stockRecoveredForResult(input: PreOrderTriggerInput): boolean {
  return !isPreOrder(input).isPreOrder;
}

/**
 * Restock notice copy. Rendering lives in lib/email/results.ts alongside the
 * other Result lifecycle emails; this wrapper keeps the existing call sites and
 * the pre-order-restock self-check pointed at a stable name.
 */
export function restockEmailCopy(opts: {
  origin: string;
  resultId: string;
  accessToken: string | null;
}): { subject: string; text: string; html: string } {
  return renderRestockEmail(opts);
}

type PrefLine = { item_id: number };

function preferenceItemIds(lines: unknown): number[] {
  if (!Array.isArray(lines)) return [];
  return lines
    .map((l) => (l as PrefLine)?.item_id)
    .filter((id): id is number => typeof id === "number" && id > 0);
}

export type RestockNoticeSummary = {
  scanned: number;
  eligible: number;
  notified: number;
  skippedStillPreOrder: number;
  skippedNoClaim: number;
  errors: string[];
};

/**
 * Scan open Pre-order Results; email once when live trigger would clear.
 * Does not clear sticky `is_pre_order`.
 */
export async function runPreOrderRestockNotices(
  admin: SupabaseClient,
  opts: { origin: string; now?: Date },
): Promise<RestockNoticeSummary> {
  const nowIso = (opts.now ?? new Date()).toISOString();
  const summary: RestockNoticeSummary = {
    scanned: 0,
    eligible: 0,
    notified: 0,
    skippedStillPreOrder: 0,
    skippedNoClaim: 0,
    errors: [],
  };

  const { data: rows, error } = await admin
    .from("mp_config_responses")
    .select(
      "id, status, is_pre_order, pre_order_restock_notified_at, customer_email, access_token, product_type, preference_lines, suggested_size, suggested_tier, suggested_length",
    )
    .eq("is_pre_order", true)
    .in("status", [...RESTOCK_NOTIFY_STATUSES])
    .is("pre_order_restock_notified_at", null);

  if (error) {
    summary.errors.push(error.message);
    return summary;
  }

  const candidates = selectRestockNotifyCandidates(
    (rows ?? []) as RestockCandidateRow[],
  );
  summary.scanned = rows?.length ?? 0;
  summary.eligible = candidates.length;

  for (const row of candidates) {
    const productType =
      row.product_type === "bolster" || row.product_type === "pillow"
        ? row.product_type
        : null;
    if (!productType) {
      summary.errors.push(`${row.id}: missing product_type`);
      continue;
    }

    let trigger: PreOrderTriggerInput;
    try {
      trigger = await loadPreOrderTriggerAtHold(admin, {
        productType,
        preferenceItemIds: preferenceItemIds(row.preference_lines),
        suggestedSize: row.suggested_size ?? undefined,
        suggestedTier: row.suggested_tier ?? undefined,
        suggestedLength: row.suggested_length ?? undefined,
      });
    } catch (e) {
      summary.errors.push(
        `${row.id}: trigger ${e instanceof Error ? e.message : "failed"}`,
      );
      continue;
    }

    if (!stockRecoveredForResult(trigger)) {
      summary.skippedStillPreOrder += 1;
      continue;
    }

    // Claim marker first so concurrent cron ticks do not double-send.
    const { data: claimed, error: claimErr } = await admin
      .from("mp_config_responses")
      .update({ pre_order_restock_notified_at: nowIso })
      .eq("id", row.id)
      .is("pre_order_restock_notified_at", null)
      .select("id")
      .maybeSingle();

    if (claimErr) {
      summary.errors.push(`${row.id}: claim ${claimErr.message}`);
      continue;
    }
    if (!claimed) {
      summary.skippedNoClaim += 1;
      continue;
    }

    const copy = restockEmailCopy({
      origin: opts.origin,
      resultId: row.id,
      accessToken: row.access_token,
    });

    try {
      await getEmailTransport().send({
        to: row.customer_email!,
        from: getDefaultFromAddress(),
        subject: copy.subject,
        text: copy.text,
        html: copy.html,
      });
      summary.notified += 1;
    } catch (e) {
      // Release claim so a later tick can retry.
      await admin
        .from("mp_config_responses")
        .update({ pre_order_restock_notified_at: null })
        .eq("id", row.id);
      summary.errors.push(
        `${row.id}: email ${e instanceof Error ? e.message : "failed"}`,
      );
    }
  }

  return summary;
}
