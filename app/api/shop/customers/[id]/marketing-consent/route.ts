import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin, requireAdminContext, type AdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { readMarketingConsentView, setMarketingEmail } from "@/lib/marketing-consent/consent";
import { UNSUBSCRIBE_REASONS, UNSUBSCRIBE_TEXT_MAX } from "@/lib/marketing-consent/unsubscribe-reasons";
import { UnsubscribeAnswerSchema, recordUnsubscribeReason } from "@/lib/marketing-consent/unsubscribe-reasons-server";

export const runtime = "nodejs";

const UnsubscribeSchema = z
  .object({
    action: z.literal("unsubscribe"),
    reason: z.enum(UNSUBSCRIBE_REASONS).optional(),
    text: z.string().max(UNSUBSCRIBE_TEXT_MAX).optional(),
  })
  .strict();

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("customers");
  if (denied) return denied;

  const { id } = await params;
  try {
    const view = await readMarketingConsentView(supabaseAdmin(), id);
    if (!view) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    return NextResponse.json({ ok: true, view });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not read marketing consent" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx: AdminContext;
  try {
    ctx = await requireAdminContext("customers-edit");
  } catch (denied) {
    return denied as NextResponse;
  }

  const { id } = await params;
  const parsed = UnsubscribeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Staff can only unsubscribe a customer who asks" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const result = await setMarketingEmail(admin, { customerId: id, to: "unsubscribed", source: "support" });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.notFound ? 404 : 400 });
  }

  if (result.changed) {
    await recordAdminAction({
      actor: ctx,
      action: "customer.marketing_unsubscribe",
      entityType: "customer",
      entityId: id,
      after: { marketing_email: "unsubscribed", source: "support", ...(parsed.data.reason ? { reason: parsed.data.reason } : {}) },
    });
  }

  if (parsed.data.reason) {
    const answer = UnsubscribeAnswerSchema.parse({ reason: parsed.data.reason, text: parsed.data.text });
    await recordUnsubscribeReason(admin, id, answer).catch((e: unknown) =>
      console.error("[marketing-consent] unsubscribe reason not recorded:", e instanceof Error ? e.message : e),
    );
  }

  const view = await readMarketingConsentView(admin, id).catch(() => null);
  return NextResponse.json({ ok: true, changed: result.changed, view });
}
