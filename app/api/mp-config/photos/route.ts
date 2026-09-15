import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireResultAccess } from "@/lib/results/access";

export const runtime = "nodejs";

const ViewSchema = z.union([z.literal("front"), z.literal("side")]);

const DataUrlSchema = z
  .string()
  .min(32)
  .max(8_000_000) // guard: large payloads can overwhelm server/DB
  .refine((v) => v.startsWith("data:image/") && v.includes(";base64,"), {
    message: "Expected an image data URL",
  });

const UpsertSchema = z.object({
  responseId: z.string().uuid(),
  view: ViewSchema,
  dataUrl: DataUrlSchema,
  /** Result access token — proves the caller owns the parent Result. */
  token: z.string().uuid().nullish(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = UpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { responseId, view, dataUrl } = parsed.data;

  // A Sizing photo is part of a submission, so it follows the submission's rules:
  // Staff or Owner only, and — for anyone but Staff — only while the parent is a
  // Draft Result. Row-level security on the table itself is the other half of
  // this (20260910000000_sizing_photos_rls.sql); without it, gating here would be
  // theatre, because the table was reachable without going through this route.
  const { data: authRow, error: authErr } = await admin
    .from("mp_config_responses")
    .select("access_token, customer_id, customer_email, status, order_id")
    .eq("id", responseId)
    .maybeSingle();
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });
  // No parent Result: refuse rather than upsert a photo row nothing will ever read.
  if (!authRow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Staff means `results`: a viewer carries `orders` and would skip draftOnly.
  const access = await requireResultAccess(authRow, parsed.data.token ?? null, {
    draftOnly: true,
    staffPermissions: ["results"],
  });
  if (!access.ok) return access.response;

  const { error } = await admin
    .from("mp_config_response_photos")
    .upsert(
      {
        response_id: responseId,
        view,
        data_url: dataUrl,
      },
      { onConflict: "response_id,view" },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

