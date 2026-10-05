"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";
import { assertAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { recordPayout } from "@/lib/commissions/ledger";
import {
  assertPayoutImageAllowed,
  savePrivateImage,
  signedImageUrl,
  EMAIL_PROOF_TTL_SECONDS,
  PayoutUploadRefusedError,
} from "@/lib/payout-upload";
import { sendPayoutMadeEmail } from "@/lib/email/partner";

/**
 * Record a partner payout (#81). Staff-only (assertAdmin). Uploads the
 * proof-of-payment image to the PRIVATE bucket, writes an immutable payout row,
 * and flips the covered released commissions to `paid`. Corrections are a
 * negative amount (proof optional); a normal payout requires a positive amount
 * AND a proof image (AC2).
 */
export async function recordPayoutAction(formData: FormData): Promise<void> {
  const actor = await assertAdmin("partner-commissions");
  const admin = supabaseAdmin();

  const partnerId = String(formData.get("partner_id") ?? "");
  const amount = Number(formData.get("amount"));
  const paidOn = String(formData.get("paid_on") ?? "");
  const method = (formData.get("method") as string)?.trim() || null;
  const reference = (formData.get("reference") as string)?.trim() || null;
  const proof = formData.get("proof");

  if (!partnerId) throw new Error("Missing partner.");
  if (!Number.isFinite(amount) || amount === 0) {
    throw new Error("Amount must be a non-zero number.");
  }
  if (!paidOn) throw new Error("Payment date is required.");

  let proofPath: string | null = null;
  if (proof instanceof File && proof.size > 0) {
    try {
      assertPayoutImageAllowed(proof.size, proof.type);
    } catch (e) {
      if (e instanceof PayoutUploadRefusedError) throw new Error(e.message);
      throw e;
    }
    const bytes = Buffer.from(await proof.arrayBuffer());
    proofPath = await savePrivateImage(`payout-proof/${partnerId}`, bytes, proof.name);
  } else if (amount > 0) {
    throw new Error("Proof of payment image is required.");
  }

  const result = await recordPayout(admin, {
    partnerId,
    amount,
    paidOn,
    method,
    reference,
    proofPath,
    createdBy: actor.email,
  });

  await recordAdminAction({
    actor,
    action: "partner_payout.record",
    entityType: "partner_payout",
    entityId: result.payoutId,
    before: null,
    after: {
      partner_id: partnerId,
      amount,
      paid_on: paidOn,
      method,
      reference,
      commissions_paid: result.commissionsPaid,
    },
  });

  // Payout-made email (#84): only for an actual payout (positive amount — a
  // correction is a negative row). Links the proof via a longer-lived signed URL
  // (AC5). Idempotent on entity_id = payoutId; best-effort — never break payout.
  if (amount > 0) {
    try {
      const proofUrl = await signedImageUrl(proofPath, EMAIL_PROOF_TTL_SECONDS);
      await sendPayoutMadeEmail(admin, {
        partnerId,
        payoutId: result.payoutId,
        amount,
        paidOn,
        proofUrl,
      });
    } catch (err) {
      console.error(`[partner-payout] email failed for payout ${result.payoutId}:`, err);
    }
  }

  revalidatePath("/settings/partner-commissions");
}
