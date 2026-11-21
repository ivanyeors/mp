"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";
import { assertAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";

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
