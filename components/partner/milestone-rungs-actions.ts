"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";
import { assertAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";

/**
 * Upsert one milestone rung (#79). Staff-only (assertAdmin) — the rung ladder is
 * invisible in the Partner Hub. One rung per tier (unique index), so a repeat tier
 * updates in place. A rung grants a perk and no money (ADR 0034: the agreement pays
 * the Schedule's flat commission and nothing else), so it saves no cash bonus and
 * no rate bump.
 */
export async function upsertMilestoneRung(formData: FormData): Promise<void> {
  const actor = await assertAdmin("partner-commissions");
  const admin = supabaseAdmin();

  const tier = Number(formData.get("tier"));
  const unitsThreshold = Number(formData.get("units_threshold"));
  const perkLabel = ((formData.get("perk_label") as string) ?? "").trim();

  if (!Number.isInteger(tier) || tier < 1) throw new Error("Tier must be a positive integer.");
  if (!Number.isInteger(unitsThreshold) || unitsThreshold < 0) {
    throw new Error("Units threshold must be a non-negative integer.");
  }

  const { error } = await admin.from("milestone_rungs").upsert(
    {
      tier,
      units_threshold: unitsThreshold,
      cash_bonus: 0,
      rate_bump: 0,
      perk_label: perkLabel,
    },
    { onConflict: "tier" },
  );
  if (error) throw new Error(error.message);

  await recordAdminAction({
    actor,
    action: "milestone_rung.upsert",
    entityType: "milestone_rung",
    entityId: String(tier),
    before: null,
    after: { tier, units_threshold: unitsThreshold, cash_bonus: 0, rate_bump: 0, perk_label: perkLabel },
  });

  revalidatePath("/settings/partner-commissions");
}
