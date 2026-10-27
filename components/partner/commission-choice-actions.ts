"use server";

import { revalidatePath } from "next/cache";
import { getPartnerContext, isPartnerActive } from "@/lib/auth/partner";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  PARTNER_TERMS_COLUMNS,
  partnerTermsOf,
  pickCommission,
  sgtDate,
  type PartnerTermsRow,
} from "@/lib/partner-terms";

export type PickCommissionResult = { ok: true; startsOn: string | null } | { ok: false; error: string };

/**
 * The partner picks how much of the Commission Pool they take (agreement clause
 * 7.2). Only their own row, only while approved and on the current agreement; the
 * pool and the customer discount stay Staff's. A changed pick starts the day after
 * the next Payout Date; picking what is already in force cancels a waiting change.
 * `amount` null = the whole pool.
 */
export async function pickPartnerCommission(amount: number | null): Promise<PickCommissionResult> {
  const ctx = await getPartnerContext();
  if (!isPartnerActive(ctx)) return { ok: false, error: "Sign in to your Partner Hub to change this." };
  if (amount != null && (!Number.isFinite(amount) || amount < 0)) {
    return { ok: false, error: "Enter an amount of S$0 or more." };
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("partners")
    .select(PARTNER_TERMS_COLUMNS)
    .eq("id", ctx.partnerId)
    .maybeSingle();
  if (error || !data) return { ok: false, error: "We couldn't load your terms. Please try again." };

  const update = pickCommission(partnerTermsOf(data as PartnerTermsRow), amount, sgtDate(new Date()));
  const { error: writeError } = await admin.from("partners").update(update).eq("id", ctx.partnerId);
  if (writeError) return { ok: false, error: "We couldn't save your choice. Please try again." };

  revalidatePath("/partner", "layout");
  return { ok: true, startsOn: update.commission_choice_next_from };
}
