import { NextResponse } from "next/server";
import { invalidateTag } from "@/lib/cache/invalidate";
import { z } from "zod";
import { getPartnerContext, isPartnerActive } from "@/lib/auth/partner";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

const bodySchema = z.object({ notify_whatsapp: z.boolean() });

/**
 * Toggle the caller's WhatsApp notification preference (#86). Email is always-on
 * and untouched here — this only flips the additive WhatsApp channel. Opt-out
 * takes effect immediately (the next event reads the fresh flag).
 */
export async function PATCH(req: Request) {
  const ctx = await getPartnerContext();
  if (!isPartnerActive(ctx)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });
  }

  // Per-partner preference on the partners aggregate, keyed by ctx.partnerId —
  // resolves in every session (incl. backup-email sign-in), unlike auth_user_id.
  const { data, error } = await supabaseAdmin()
    .from("partners")
    .update({ notify_whatsapp: parsed.data.notify_whatsapp })
    .eq("id", ctx.partnerId) // guard: only the caller's own partner row
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Never confirm a write that hit nothing (would be a lying ok:true).
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Partner not found" }, { status: 404 });
  }

  invalidateTag("locations");
  return NextResponse.json({ ok: true, notify_whatsapp: parsed.data.notify_whatsapp });
}
