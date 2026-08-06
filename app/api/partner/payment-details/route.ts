import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getPartnerContext, isPartnerActive } from "@/lib/auth/partner";
import {
  assertPayoutImageAllowed,
  savePrivateImage,
  signedImageUrl,
  PayoutUploadRefusedError,
} from "@/lib/payout-upload";

export const runtime = "nodejs";

/**
 * Partner payout details (#81). Both verbs are partner-guarded (isPartnerActive)
 * and write ONLY under the caller's own partnerId, so no partner can touch
 * another's row or private QR image.
 *
 *  - POST  (multipart `file`): upload/replace the PayNow QR into the PRIVATE
 *    bucket, store the key, and return a fresh short-lived signed URL for preview.
 *  - PATCH (json bank fields): upsert bank_name / bank_account_name / bank_account_number.
 */
export async function POST(req: Request) {
  const ctx = await getPartnerContext();
  if (!isPartnerActive(ctx)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  try {
    assertPayoutImageAllowed(file.size, file.type);
    const bytes = Buffer.from(await file.arrayBuffer());
    const path = await savePrivateImage(`paynow-qr/${ctx.partnerId}`, bytes, file.name);

    const admin = supabaseAdmin();
    const { error } = await admin
      .from("partner_payment_details")
      .upsert({ partner_id: ctx.partnerId, paynow_qr_path: path }, { onConflict: "partner_id" });
    if (error) throw new Error(error.message);

    const qrUrl = await signedImageUrl(path);
    return NextResponse.json({ ok: true, qrUrl });
  } catch (e) {
    if (e instanceof PayoutUploadRefusedError) {
      return NextResponse.json({ error: e.message }, { status: 422 });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const ctx = await getPartnerContext();
  if (!isPartnerActive(ctx)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    bank_name?: string;
    bank_account_name?: string;
    bank_account_number?: string;
  } | null;
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const admin = supabaseAdmin();
  const { error } = await admin.from("partner_payment_details").upsert(
    {
      partner_id: ctx.partnerId,
      bank_name: body.bank_name?.trim() || null,
      bank_account_name: body.bank_account_name?.trim() || null,
      bank_account_number: body.bank_account_number?.trim() || null,
    },
    { onConflict: "partner_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
