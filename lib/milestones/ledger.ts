/**
 * Milestone DB layer (#79, ADR 0015). All supabase reads/writes; the pure
 * calc/ratchet lives in ./index and is imported here (never the reverse).
 *
 * The count is DERIVED from the commission ledger (#77) — there is no events table:
 *   units = endowed_units + (partner's NON-VOID commission rows)
 * Self-purchases are unattributed (partner_id null) so they never create a commission
 * row and are auto-excluded from the count.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendMilestoneReachedEmail } from "@/lib/email/partner";
import {
  ENDOWED_UNITS,
  currentTierFor,
  milestoneState,
  ratchetTier,
  sortRungs,
  topPercentBucket,
  type MilestoneRung,
  type MilestoneState,
} from "./index";

/** The admin-tunable rung ladder, threshold-ascending. */
export async function loadRungs(admin: SupabaseClient): Promise<MilestoneRung[]> {
  const { data } = await admin
    .from("milestone_rungs")
    .select("tier, units_threshold, cash_bonus, rate_bump, perk_label");
  return sortRungs(
    (data ?? []).map((r) => ({
      tier: Number(r.tier),
      units_threshold: Number(r.units_threshold),
      cash_bonus: Number(r.cash_bonus),
      rate_bump: Number(r.rate_bump),
      perk_label: r.perk_label ?? "",
    })),
  );
}

/** Read the per-unit quantity off a commission's embedded order_item (to-one; array or object). */
function lineQuantity(oi: unknown): number {
  const rel = Array.isArray(oi) ? oi[0] : oi;
  const q = (rel as { quantity?: number | string } | null)?.quantity;
  return Math.max(1, Number(q ?? 1));
}

/**
 * Sum of a partner's NON-VOID commissioned UNITS. A commission is one row per
 * order_item, but a shop line can be quantity>1 (3 pillows = 1 row), so we sum
 * order_items.quantity — not a row count — else multi-unit orders undercount the
 * bar. Result orders are quantity 1, so they're unaffected.
 */
async function countNonVoidCommissions(
  admin: SupabaseClient,
  partnerId: string,
): Promise<number> {
  const { data } = await admin
    .from("commissions")
    .select("order_items(quantity)")
    .eq("partner_id", partnerId)
    .neq("status", "void");
  return (data ?? []).reduce((sum, r) => sum + lineQuantity(r.order_items), 0);
}

/** Read (creating if absent) the partner's ratchet row: {max_tier, endowed_units}. */
async function ensureMilestoneRow(
  admin: SupabaseClient,
  partnerId: string,
): Promise<{ max_tier: number; endowed_units: number }> {
  await admin
    .from("partner_milestones")
    .upsert(
      { partner_id: partnerId, endowed_units: ENDOWED_UNITS },
      { onConflict: "partner_id", ignoreDuplicates: true },
    );
  const { data } = await admin
    .from("partner_milestones")
    .select("max_tier, endowed_units")
    .eq("partner_id", partnerId)
    .maybeSingle();
  return {
    max_tier: Number(data?.max_tier ?? 0),
    endowed_units: Number(data?.endowed_units ?? ENDOWED_UNITS),
  };
}

/**
 * Rung-crossing hook. Call right AFTER createHeldCommissionsForOrder (both capture
 * sites). Idempotent + ratcheting: detects tiers newly crossed since the stored
 * max_tier, records each crossing and its perk (unique on (partner_id, tier)), and
 * climbs max_tier. A no-op when nothing new is crossed. Must be called best-effort
 * (try/catch) by the caller — never break capture/payment.
 *
 * Rungs pay no money (ADR 0034): the Referral Partner Agreement pays the Schedule's
 * flat commission and nothing else (clause 7.8), so a crossing grants no cash
 * bonus and no rate bump, whatever a rung row still holds.
 */
export async function applyMilestoneProgress(
  admin: SupabaseClient,
  partnerId: string,
): Promise<void> {
  const rungs = await loadRungs(admin);
  if (rungs.length === 0) return;

  const { max_tier: storedTier, endowed_units } = await ensureMilestoneRow(admin, partnerId);
  const units = endowed_units + (await countNonVoidCommissions(admin, partnerId));
  const newTier = ratchetTier(storedTier, currentTierFor(units, rungs));
  if (newTier <= storedTier) return; // no newly-crossed rung

  // Record each newly-crossed rung (idempotent via unique key). No cash: see above.
  for (const rung of rungs.filter((r) => r.tier > storedTier && r.tier <= newTier)) {
    const { error } = await admin
      .from("milestone_bonuses")
      .insert({
        partner_id: partnerId,
        tier: rung.tier,
        cash_bonus: 0,
        perk_label: rung.perk_label,
      });
    // 23505 = unique violation → bonus already granted; any other error is unexpected.
    if (error && error.code !== "23505") throw new Error(error.message);

    // Milestone-reached email (#84): idempotent on entity_id = `${partnerId}:tier${tier}`.
    // Best-effort — an email failure must not abort the ratchet below.
    try {
      await sendMilestoneReachedEmail(admin, {
        partnerId,
        tier: rung.tier,
        cashBonus: 0,
        perkLabel: rung.perk_label,
      });
    } catch (e) {
      console.error(`[milestone] email failed for partner ${partnerId} tier ${rung.tier}`, e);
    }
  }

  // Ratchet max_tier up (guarded so concurrent runs can't lower it).
  await admin
    .from("partner_milestones")
    .update({ max_tier: newTier })
    .eq("partner_id", partnerId)
    .lt("max_tier", newTier);
}

export interface MilestoneDashboard extends MilestoneState {
  /** Smallest of [1,5,10,25,50], or null (too few partners / bottom half). */
  topPercent: number | null;
  /** Most recent crossed rung's reward, for the surprise-gift note. Null if none yet. */
  latestReward: { tier: number; cash_bonus: number; perk_label: string } | null;
}

/**
 * Everything the hub component renders: units (with endowed start), ratcheted tier,
 * perks, units-to-next, goal-gradient fill, "top N%" chip, and the latest surprise
 * reward. Reads only — display is honest even if the crossing hook never ran (the
 * tier is recomputed and ratcheted here too).
 *
 * ponytail: the percentile does a full scan of non-void commissions + a partners
 * list — fine at partner scale; add a maintained per-partner count if it ever grows.
 */
export async function loadMilestoneDashboard(
  admin: SupabaseClient,
  partnerId: string,
): Promise<MilestoneDashboard> {
  const rungs = await loadRungs(admin);
  const { max_tier: storedTier, endowed_units } = await ensureMilestoneRow(admin, partnerId);

  // This partner's units + the distribution across all real partners for the chip.
  const [{ data: allCommissionRows }, { data: partnerRows }, { data: bonus }] = await Promise.all([
    admin.from("commissions").select("partner_id, order_items(quantity)").neq("status", "void"),
    admin.from("partners").select("id").eq("type", "partner").not("referral_code", "is", null),
    admin
      .from("milestone_bonuses")
      .select("tier, cash_bonus, perk_label")
      .eq("partner_id", partnerId)
      .order("tier", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const countByPartner = new Map<string, number>();
  for (const r of allCommissionRows ?? []) {
    if (!r.partner_id) continue;
    countByPartner.set(r.partner_id, (countByPartner.get(r.partner_id) ?? 0) + lineQuantity(r.order_items));
  }
  const units = endowed_units + (countByPartner.get(partnerId) ?? 0);
  const allUnitCounts = (partnerRows ?? []).map(
    (p) => endowed_units + (countByPartner.get(p.id) ?? 0),
  );

  return {
    ...milestoneState(units, rungs, storedTier, endowed_units),
    topPercent: topPercentBucket(units, allUnitCounts),
    latestReward: bonus
      ? {
          tier: Number(bonus.tier),
          cash_bonus: Number(bonus.cash_bonus),
          perk_label: bonus.perk_label ?? "",
        }
      : null,
  };
}
