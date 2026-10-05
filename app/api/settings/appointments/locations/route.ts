import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { invalidateTag } from "@/lib/cache/invalidate";
import { getLocations, selectBookableLocations } from "@/lib/locations";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ponytail: lives under /api/settings/appointments (not /api/partners) so the
// staff who run the calendar — `results` admins — can flip bookability without
// the `page-builder` grant the Locations CMS routes require. Writes one column.
const PatchSchema = z.object({
  id: z.string().min(1),
  bookable: z.boolean(),
});

/** GET → every Location (own + partner) with its bookable flag, for the settings sheet. */
export async function GET() {
  const denied = await requireAdmin("appointments");
  if (denied) return denied;
  return NextResponse.json({ ok: true, locations: await getLocations() });
}

/** PATCH { id, bookable } → flips one Location; refuses to switch off the last bookable one. */
export async function PATCH(req: Request) {
  const denied = await requireAdmin("appointments");
  if (denied) return denied;

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { id, bookable } = parsed.data;

  const all = await getLocations();
  const target = all.find((l) => l.id === id);
  if (!target) return NextResponse.json({ error: "Unknown location" }, { status: 404 });

  if (!bookable) {
    const remaining = selectBookableLocations(all).filter((l) => l.id !== id);
    if (remaining.length === 0) {
      return NextResponse.json(
        { error: "At least one bookable location is required" },
        { status: 400 },
      );
    }
  }

  const admin = supabaseAdmin();
  const { error } = await admin.from("partners").update({ bookable }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  invalidateTag("locations");
  return NextResponse.json({ ok: true, location: { ...target, bookable } });
}
