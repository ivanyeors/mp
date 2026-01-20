import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";

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
});

const GetQuerySchema = z.object({
  responseId: z.string().uuid(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = GetQuerySchema.safeParse({
    responseId: url.searchParams.get("responseId") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid responseId" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("mp_config_response_photos")
    .select("view,data_url,updated_at")
    .eq("response_id", parsed.data.responseId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, photos: data ?? [] });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = UpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { responseId, view, dataUrl } = parsed.data;

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

