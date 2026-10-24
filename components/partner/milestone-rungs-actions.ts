"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";
import { assertAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";

/**
 * Upsert one milestone rung (#79). Staff-only (assertAdmin) — the rung ladder is
 * invisible in the Partner Hub. One rung per tier (unique index), so a repeat tier
 * updates in place. rate_bump is percentage points added to the commission scheme
 * on crossing (feeds #77). Self-contained so it can be mounted on the existing
 * Partner Commissions page without editing a shared file.
 */
export async function upsertMilestoneRung(formData: FormData): Promise<void> {
  const actor = await assertAdmin("partner-commissions");
  const admin = supabaseAdmin();

  const tier = Number(formData.get("tier"));
  const unitsThreshold = Number(formData.get("units_threshold"));
  const cashBonus = Number(formData.get("cash_bonus"));
  const rateBump = Number(formData.get("rate_bump"));
  const perkLabel = ((formData.get("perk_label") as string) ?? "").trim();

  if (!Number.isInteger(tier) || tier < 1) throw new Error("Tier must be a positive integer.");
  if (!Number.isInteger(unitsThreshold) || unitsThreshold < 0) {
    throw new Error("Units threshold must be a non-negative integer.");
  }
  for (const [name, v] of [["Cash bonus", cashBonus], ["Rate bump", rateBump]] as const) {
    if (!Number.isFinite(v) || v < 0) throw new Error(`${name} must be a non-negative number.`);
  }

  const { error } = await admin.from("milestone_rungs").upsert(
    {
      tier,
      units_threshold: unitsThreshold,
      cash_bonus: cashBonus,
      rate_bump: rateBump,
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
    after: { tier, units_threshold: unitsThreshold, cash_bonus: cashBonus, rate_bump: rateBump, perk_label: perkLabel },
  });

  revalidatePath("/settings/partner-commissions");
}
