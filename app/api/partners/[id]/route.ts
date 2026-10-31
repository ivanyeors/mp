import { NextResponse } from "next/server";
import { invalidateTag } from "@/lib/cache/invalidate";
import { z } from "zod/v4";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";
import { touchLastUsed } from "@/lib/media-assets";
import {
  BranchSaveError,
  BranchesSchema,
  savePartnerBranches,
  syncBranchNames,
} from "@/lib/locations/save-branches";

export const runtime = "nodejs";

// ponytail: `partners` table/route named as-is (ADR 0012); rows are Locations.
const UpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  logo_url: z.string().nullable().optional(),
  media_asset_id: z.string().uuid().nullable().optional(),
  website_url: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  visible: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
  type: z.enum(["own", "partner"]).optional(),
  address: z.string().nullable().optional(),
  postal_code: z.string().nullable().optional(),
  branch_name: z.string().trim().max(120).nullable().optional(),
  bookable: z.boolean().optional(),
  /** Replaces the partner's further clinics when sent (ADR 0037). */
  branches: BranchesSchema.optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: RouteParams) {
  const denied = await requireAdmin("partners");
  if (denied) return denied;

  const { id } = await params;

  try {
    const body = await req.json();
    const { branches, ...parsed } = UpdateSchema.parse(body);
    if (parsed.branch_name !== undefined) parsed.branch_name = parsed.branch_name || null;
    const admin = supabaseAdmin();

    const { data, error } = await admin
      .from("partners")
      .update(parsed)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    // Saving the list also copies the name; a rename alone still reaches the branches.
    if (branches) {
      await savePartnerBranches(id, branches);
    } else if (parsed.name !== undefined) {
      await syncBranchNames(id, parsed.name);
    }

    const logoUrl = parsed.logo_url;
    if (
      (typeof logoUrl === "string" && logoUrl.startsWith("http")) ||
      parsed.media_asset_id
    ) {
      await touchLastUsed({
        urls: typeof logoUrl === "string" && logoUrl.startsWith("http") ? [logoUrl] : [],
        assetIds: parsed.media_asset_id ? [parsed.media_asset_id] : [],
      }).catch(() => {});
    }

    invalidateTag("locations");
    return NextResponse.json({ ok: true, partner: data });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    if (err instanceof BranchSaveError) {
      invalidateTag("locations"); // the main row may already have saved
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const denied = await requireAdmin("partners");
  if (denied) return denied;

  const { id } = await params;
  const admin = supabaseAdmin();

  const { error } = await admin.from("partners").delete().eq("id", id);

  if (error) {
    // Still referenced: a Result records this Location (or one of the partner's
    // branches, which go with it), or a Self-collect shipping method is
    // collected from it.
    if (error.code === "23503") {
      return NextResponse.json(
        {
          error:
            "This Location is still in use, by Results recorded there (or at one of its other locations) or by a Self-collect shipping method (Settings → Shipping).",
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  invalidateTag("locations");
  return NextResponse.json({ ok: true });
}
