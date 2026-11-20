import { NextResponse } from "next/server";
import { z } from "zod";

import { getAdminContext, requireAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { reloadCustomerPillow } from "@/lib/customer-pillow/reload";
import { PILLOW_TEMPLATE_KEYS } from "@/lib/filling-templates/keys";
import { actingProfile } from "@/lib/staff/working-as";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LinkSchema = z.object({
  size: z.enum(PILLOW_TEMPLATE_KEYS),
  fillingTemplateId: z.number().int().positive().nullable(),
});

async function pillowResponse(customerId: string) {
  const loaded = await reloadCustomerPillow(customerId);
  if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: 500 });
  return NextResponse.json({ ok: true, pillow: loaded.pillow });
}

async function customerExists(id: string): Promise<boolean> {
  const { data } = await supabaseAdmin().from("customers").select("id").eq("id", id).maybeSingle();
  return Boolean(data);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("customers-edit");
  if (denied) return denied;
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!UUID.test(id) || !(await customerExists(id))) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const parsed = LinkSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a size and a Filling Template." }, { status: 400 });
  const { size, fillingTemplateId } = parsed.data;

  const admin = supabaseAdmin();
  if (fillingTemplateId !== null) {
    const { data: tpl, error } = await admin
      .from("bom_templates")
      .select("id, role, kind, is_active")
      .eq("id", fillingTemplateId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!tpl || tpl.role !== "filling" || tpl.kind !== "pillow" || !tpl.is_active) {
      return NextResponse.json({ error: "That Filling Template is not an active pillow template." }, { status: 400 });
    }
  }

  const { data: before } = await admin
    .from("customer_pillows")
    .select("pillow_size, filling_template_id, filling_placements")
    .eq("customer_id", id)
    .maybeSingle();

  const { error } = await admin.from("customer_pillows").upsert(
    {
      customer_id: id,
      pillow_size: size,
      filling_template_id: fillingTemplateId,
      filling_placements: null,
      linked_by_user_id: ctx.userId,
      linked_by_profile_id: (await actingProfile(ctx.memberId))?.id ?? null,
      linked_at: new Date().toISOString(),
    },
    { onConflict: "customer_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await recordAdminAction({
    actor: ctx,
    action: "customer_pillow.link",
    entityType: "customer",
    entityId: id,
    before: before ?? null,
    after: { pillow_size: size, filling_template_id: fillingTemplateId },
  });

  return pillowResponse(id);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("customers-edit");
  if (denied) return denied;
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!UUID.test(id) || !(await customerExists(id))) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const admin = supabaseAdmin();
  const { data: before, error } = await admin
    .from("customer_pillows")
    .delete()
    .eq("customer_id", id)
    .select("pillow_size, filling_template_id, filling_placements")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (before) {
    await recordAdminAction({
      actor: ctx,
      action: "customer_pillow.unlink",
      entityType: "customer",
      entityId: id,
      before,
    });
  }

  return pillowResponse(id);
}
