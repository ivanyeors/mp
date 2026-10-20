import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin, requireAdminContext, type AdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { getWorkingAs } from "@/lib/staff/working-as";
import { readAftercareView, setAftercarePreference } from "@/lib/aftercare/preferences";
import { AFTERCARE_PREFERENCES, PREFERENCE_NOTE_MAX } from "@/lib/aftercare/state";

export const runtime = "nodejs";

/**
 * A Customer's Aftercare switches (PRD customer-crm slice 13): Staff's manual
 * switch for anyone who asks to stop by email reply, on WhatsApp or in person.
 * Seeing them and their history needs `customers`; changing one needs
 * `customers-edit` (slice 10).
 */

const ChangeSchema = z
  .object({
    preference: z.enum(AFTERCARE_PREFERENCES),
    value: z.boolean(),
    note: z.string().trim().max(PREFERENCE_NOTE_MAX).optional(),
  })
  .refine((b) => !(b.preference === "aftercare_whatsapp" && b.value) || Boolean(b.note), {
    // Meta's opt-in must come from the customer: Staff record it, they do not decide it.
    message: "Say how and when the customer agreed, and to what",
    path: ["note"],
  });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("customers");
  if (denied) return denied;

  const { id } = await params;
  try {
    const view = await readAftercareView(supabaseAdmin(), id);
    if (!view) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    return NextResponse.json({ ok: true, view });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not read aftercare" }, { status: 500 });
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
  const parsed = ChangeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json({ error: first?.message ?? "Invalid change" }, { status: 400 });
  }
  const { preference, value, note } = parsed.data;

  const admin = supabaseAdmin();
  const workingAs = await getWorkingAs(ctx.memberId);
  const result = await setAftercarePreference(admin, {
    customerId: id,
    preference,
    value,
    source: "staff",
    profileId: workingAs?.id ?? null,
    note: note || null,
  });
  if (!result.ok) {
    const missing = /not found/i.test(result.error);
    return NextResponse.json({ error: result.error }, { status: missing ? 404 : 400 });
  }

  if (result.changed) {
    await recordAdminAction({
      actor: ctx,
      action: "customer.aftercare_preference",
      entityType: "customer",
      entityId: id,
      before: { [preference]: !value },
      after: { [preference]: value, note: note || null },
    });
  }

  const view = await readAftercareView(admin, id).catch(() => null);
  return NextResponse.json({ ok: true, changed: result.changed, view });
}
