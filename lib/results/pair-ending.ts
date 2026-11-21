import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe/client";
import { getEmailTransport } from "@/lib/email";
import { getDefaultFromAddress } from "@/lib/email/transport";
import { loadEmailCopy } from "@/lib/email/copy-store";
import { RESULT_EMAIL_COPY, renderPairedMbolsterRemovedEmail } from "@/lib/email/results";
import {
  endingPlan,
  isCompanion,
  pairAuthorized,
  pickPartner,
  type EndingPlan,
} from "./paired-build";

export type EndingRow = {
  id: string;
  paired_build_id?: string | null;
  payment_intent_id?: string | null;
  authorized_amount?: number | string | null;
};

export type LoadedEndingPlan = EndingPlan & {
  intentAmount: number | null;
  partner: { id: string; status: string | null } | null;
};

export async function loadEndingPlan(
  admin: SupabaseClient,
  row: EndingRow,
): Promise<LoadedEndingPlan> {
  if (!row.paired_build_id) {
    return {
      ...endingPlan(row, null),
      intentAmount: row.authorized_amount == null ? null : Number(row.authorized_amount),
      partner: null,
    };
  }
  const { data: members } = await admin
    .from("mp_config_responses")
    .select("id, status, authorized_amount")
    .eq("paired_build_id", row.paired_build_id);
  const partner = pickPartner(
    (members ?? []).map((m) => ({ ...m, id: String(m.id), status: m.status as string | null })),
    row.id,
  );
  return {
    ...endingPlan(
      row,
      partner ? { id: partner.id, paired_build_id: row.paired_build_id, status: partner.status } : null,
    ),
    intentAmount: pairAuthorized(members ?? [row]),
    partner: partner ? { id: partner.id, status: partner.status } : null,
  };
}

export async function cascadeEnding(
  admin: SupabaseClient,
  plan: EndingPlan,
  status: "declined" | "cancelled" | "expired",
): Promise<void> {
  if (!plan.cascadeTo) return;
  const { error } = await admin
    .from("mp_config_responses")
    .update({ status })
    .eq("id", plan.cascadeTo)
    .in("status", ["held", "assigned"]);
  if (error) console.error("Paired build cascade failed", plan.cascadeTo, error);
}

export async function companionLockReason(
  admin: SupabaseClient,
  row: EndingRow,
): Promise<string | null> {
  if (!isCompanion(row)) return null;
  const { data: anchor } = await admin
    .from("mp_config_responses")
    .select("topup_paid_at")
    .eq("id", row.paired_build_id as string)
    .maybeSingle();
  if (anchor?.topup_paid_at) {
    return "Payment for both builds has already been taken, so the Mbolster can no longer be removed on its own. Accept the order; we can refund the Mbolster afterwards.";
  }
  if (row.payment_intent_id) {
    const intent = await getStripe().paymentIntents.retrieve(row.payment_intent_id);
    if (intent.status === "succeeded") {
      return "Payment for both builds has already been captured, so the Mbolster can no longer be removed on its own. Accept the order; we can refund the Mbolster afterwards.";
    }
  }
  return null;
}

export async function notifyCompanionRemoved(
  admin: SupabaseClient,
  opts: {
    companion: { id: string; paired_build_id?: string | null; customer_email?: string | null; access_token?: string | null; currency?: string | null };
    partner: LoadedEndingPlan["partner"];
    origin: string;
  },
): Promise<"sent" | "skipped" | "failed"> {
  const { companion, partner } = opts;
  if (!isCompanion(companion) || !companion.customer_email) return "skipped";
  if (!partner || (partner.status !== "held" && partner.status !== "assigned")) return "skipped";
  let amount: number | null = null;
  if (partner.status === "assigned") {
    const { data: anchor } = await admin
      .from("mp_config_responses")
      .select("final_amount")
      .eq("id", partner.id)
      .maybeSingle();
    amount = anchor?.final_amount == null ? null : Number(anchor.final_amount);
  }
  try {
    const copy = await loadEmailCopy(RESULT_EMAIL_COPY.paired_mbolster_removed);
    await getEmailTransport().send({
      to: companion.customer_email,
      from: getDefaultFromAddress(),
      ...renderPairedMbolsterRemovedEmail(
        {
          origin: opts.origin,
          anchorId: partner.id,
          accessToken: companion.access_token ?? null,
          anchorReady: partner.status === "assigned",
          amount,
          currency: companion.currency ?? "SGD",
        },
        copy,
      ),
    });
    return "sent";
  } catch (e) {
    console.error("Paired Mbolster removed email failed", e);
    return "failed";
  }
}
