import { after, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireResultAccess } from "@/lib/results/access";
import { clientIp, tooManyRequests } from "@/lib/rate-limit";
import { screenSizingPhoto, screenableImage } from "@/lib/ai/photo-screening";
import { sizingPhotoAsWebp } from "@/lib/results/sizing-photo-webp";
import { moveSizingPhotosToDrive } from "@/lib/results/sizing-photo-drive";

export const runtime = "nodejs";

const ViewSchema = z.union([z.literal("front"), z.literal("side")]);

const DataUrlSchema = z
  .string()
  .min(32)
  .max(8_000_000)
  .refine((v) => v.startsWith("data:image/") && v.includes(";base64,"), {
    message: "Expected an image data URL",
  });

const UpsertSchema = z.object({
  responseId: z.string().uuid(),
  view: ViewSchema,
  dataUrl: DataUrlSchema,
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

  const { data: authRow, error: authErr } = await admin
    .from("mp_config_responses")
    .select("access_token, customer_id, customer_email, status, order_id")
    .eq("id", responseId)
    .maybeSingle();
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });
  if (!authRow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const access = await requireResultAccess(authRow, parsed.data.token ?? null, {
    draftOnly: true,
    staffPermissions: ["results"],
  });
  if (!access.ok) return access.response;

  const image = screenableImage(dataUrl);
  if (!image) {
    return NextResponse.json({ error: "Please use a JPEG or PNG photo.", screening: "rejected" }, { status: 422 });
  }

  const limited = await tooManyRequests(
    [
      { bucket: "sizing-photo-screen", key: responseId, windowMs: 60 * 60_000, max: 12 },
      { bucket: "sizing-photo-screen-ip", key: clientIp(req), windowMs: 10 * 60_000, max: 30 },
    ],
    "You've tried a lot of photos. Please wait a few minutes and try again.",
  );
  if (limited) return limited;

  const stored = await sizingPhotoAsWebp(image);
  if (!stored) {
    return NextResponse.json({ error: "We couldn't read this photo. Please take another one.", screening: "rejected" }, { status: 422 });
  }

  const screening = await screenSizingPhoto(stored.image, view);
  if (screening.status === "rejected") {
    return NextResponse.json({ error: screening.reason, screening: "rejected" }, { status: 422 });
  }
  if (screening.status === "unchecked") {
    console.error(`[sizing-photo] ${responseId} ${view} kept unchecked: ${screening.error}`);
  }
  const passed = screening.status === "passed";

  const { error } = await admin
    .from("mp_config_response_photos")
    .upsert(
      {
        response_id: responseId,
        view,
        data_url: stored.dataUrl,
        screening_status: screening.status,
        screening_model: passed ? screening.model : null,
        screened_at: passed ? new Date().toISOString() : null,
        screened_view: passed ? screening.view : null,
      },
      { onConflict: "response_id,view" },
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  after(() => moveSizingPhotosToDrive(admin, { responseId }).catch((e) => console.error(`[sizing-photo] ${responseId} move to Drive failed:`, e)));
  return NextResponse.json({ ok: true, screening: screening.status });
}
