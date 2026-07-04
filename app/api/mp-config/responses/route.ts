import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Safety guard: mp-config notifications are restricted to a single Telegram group chat.
// This prevents accidental leakage to other chats even if env vars are misconfigured.
const MP_CONFIG_TELEGRAM_CHAT_ID = -1001279910218;

function getOptionalEnv(name: string): string | null {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : null;
}

function formatTelegramTimestamp(date = new Date()): string {
  const dateStr = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);

  // Example output from Intl can be "3:45 pm" or "3:45 PM" depending on runtime.
  // Normalize to "3:45PM" (no space).
  const rawTime = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  const timeStr = rawTime.replace(/\s?(AM|PM)$/i, (m) => m.toUpperCase().trim());

  return `${dateStr} / ${timeStr}`;
}

function parseTelegramChatId(): number | null {
  // Only allow sending to the restricted group chat id.
  return MP_CONFIG_TELEGRAM_CHAT_ID;
}

const ExistingMeasuredBySchema = z
  .object({
    measured_by_type: z.union([z.literal("by_user"), z.literal("staff")]).nullable().optional(),
    measured_by_staff_id: z.string().nullable().optional(),
  })
  .passthrough();

async function sendTelegramMessage(chatId: number, text: string) {
  const token = getOptionalEnv("TELEGRAM_BOT_TOKEN");
  if (!token) return { ok: false as const, reason: "missing_token" as const };

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
    cache: "no-store",
  });

  if (!res.ok) {
    // Best-effort logging only. Never block the save path.
    console.error("Failed to send Telegram message", await res.text());
    return { ok: false as const, reason: "api_error" as const };
  }
  return { ok: true as const };
}

function dataUrlToBlob(dataUrl: string): { blob: Blob; ext: string } | null {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  const mime = m[1];
  const b64 = m[2];
  const buf = Buffer.from(b64, "base64");
  const subtype = mime.split("/")[1] || "jpg";
  const ext = subtype.toLowerCase().includes("jpeg") ? "jpg" : subtype.toLowerCase();
  return { blob: new Blob([buf], { type: mime }), ext };
}

function toTelegramCaption(text: string): string {
  // Telegram photo captions are limited (media group uses per-item captions too).
  const max = 1024;
  if (text.length <= max) return text;
  const trimmed = text.slice(0, Math.max(0, max - 2)).trimEnd();
  return `${trimmed}…`;
}

async function sendTelegramMediaGroup(
  chatId: number,
  caption: string,
  photos: { front?: string | null; side?: string | null },
) {
  const token = getOptionalEnv("TELEGRAM_BOT_TOKEN");
  if (!token) return { ok: false as const, reason: "missing_token" as const };

  const items: Array<{ key: "front" | "side"; dataUrl: string }> = [];
  if (photos.front) items.push({ key: "front", dataUrl: photos.front });
  if (photos.side) items.push({ key: "side", dataUrl: photos.side });
  if (items.length === 0) return { ok: false as const, reason: "no_photos" as const };

  // If we only have one photo, use sendPhoto so the caption is guaranteed on the message.
  if (items.length === 1) {
    const parsed = dataUrlToBlob(items[0].dataUrl);
    if (!parsed) return { ok: false as const, reason: "bad_data_url" as const };

    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("caption", toTelegramCaption(caption));
    form.append("photo", parsed.blob, `${items[0].key}.${parsed.ext}`);

    const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      body: form,
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("Failed to send Telegram photo", await res.text());
      return { ok: false as const, reason: "api_error" as const };
    }
    return { ok: true as const };
  }

  const parsedFront = items.find((i) => i.key === "front") ? dataUrlToBlob(items.find((i) => i.key === "front")!.dataUrl) : null;
  const parsedSide = items.find((i) => i.key === "side") ? dataUrlToBlob(items.find((i) => i.key === "side")!.dataUrl) : null;

  const form = new FormData();
  form.append("chat_id", String(chatId));

  const media: Array<{ type: "photo"; media: string; caption?: string }> = [];
  if (parsedFront) {
    media.push({ type: "photo", media: "attach://front", caption: toTelegramCaption(caption) });
    form.append("front", parsedFront.blob, `front.${parsedFront.ext}`);
  }
  if (parsedSide) {
    media.push({ type: "photo", media: "attach://side" });
    form.append("side", parsedSide.blob, `side.${parsedSide.ext}`);
  }

  if (media.length === 0) return { ok: false as const, reason: "bad_data_url" as const };
  form.append("media", JSON.stringify(media));

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMediaGroup`, {
    method: "POST",
    body: form,
    cache: "no-store",
  });

  if (!res.ok) {
    console.error("Failed to send Telegram media group", await res.text());
    return { ok: false as const, reason: "api_error" as const };
  }
  return { ok: true as const };
}

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const YesNoEmptySchema = z.union([z.literal("yes"), z.literal("no"), z.literal("")]);

const MeasurementSchema = z.object({
  name: z.string().default(""),
  gender: z.string().default(""),
  ageGroup: z.string().default(""),
  bloodPressureLevel: z.string().default(""),
  earDiscomfortSideSleep: YesNoEmptySchema.default(""),
  bedFirmness: z.string().default(""),
  acidReflux: YesNoEmptySchema.default(""),
  shoulderLength: z.string().default(""),
  neckToBack: z.string().default(""),
  headToBack: z.string().default(""),
  neckLength: z.string().default(""),
});

const MeasuredBySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("by_user") }),
  z.object({ type: z.literal("staff"), staffId: z.string().uuid() }),
]);

const UpsertSchema = z.object({
  id: z.string().uuid().optional(),
  data: MeasurementSchema,
  isFinal: z.boolean().optional(),
  measuredBy: MeasuredBySchema.optional(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsedQuery = ListQuerySchema.safeParse({
    limit: url.searchParams.get("limit") ?? "50",
    offset: url.searchParams.get("offset") ?? "0",
  });
  if (!parsedQuery.success) {
    return NextResponse.json({ error: parsedQuery.error.flatten() }, { status: 400 });
  }

  const { limit, offset } = parsedQuery.data;
  const admin = supabaseAdmin();
  const { data, error, count } = await admin
    .from("mp_config_responses")
    .select("id,data,is_final,measured_by_type,measured_by_staff_id,source,order_id,created_at,updated_at,status,suggested_size,suggested_tier,assigned_size,assigned_tier,customer_email", { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  // Fetch order numbers for linked responses
  const orderIds = (data ?? []).map((r) => r.order_id).filter(Boolean) as string[];
  let orderNumberMap = new Map<string, string>();
  if (orderIds.length > 0) {
    const { data: orders } = await admin
      .from("orders")
      .select("id, order_number")
      .in("id", orderIds);
    orderNumberMap = new Map((orders ?? []).map((o) => [o.id, o.order_number]));
  }

  const rows = (data ?? []).map((r) => ({
    ...r,
    order_number: r.order_id ? orderNumberMap.get(r.order_id) ?? null : null,
  }));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    {
      ok: true,
      rows,
      count: typeof count === "number" ? count : null,
      limit,
      offset,
    },
    {
      headers: {
        // Ensure the results list is never cached (helps avoid “stuck at N rows” issues).
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = UpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const id = parsed.data.id ?? crypto.randomUUID();
  const row: {
    id: string;
    data: unknown;
    is_final?: boolean;
    measured_by_type?: "by_user" | "staff";
    measured_by_staff_id?: string | null;
  } = { id, data: parsed.data.data };
  if (typeof parsed.data.isFinal === "boolean") row.is_final = parsed.data.isFinal;
  if (parsed.data.measuredBy) {
    row.measured_by_type = parsed.data.measuredBy.type;
    row.measured_by_staff_id = parsed.data.measuredBy.type === "staff" ? parsed.data.measuredBy.staffId : null;
  }

  const admin = supabaseAdmin();
  const isFinal = parsed.data.isFinal === true;
  let wasFinal = false;
  let existingMeasuredByType: string | null = null;
  let existingMeasuredByStaffId: string | null = null;
  if (isFinal) {
    const { data: existing, error: existingErr } = await admin
      .from("mp_config_responses")
      .select("is_final,measured_by_type,measured_by_staff_id")
      .eq("id", id)
      .maybeSingle();
    if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 });
    wasFinal = Boolean(existing?.is_final);
    const existingMeasuredByParsed = ExistingMeasuredBySchema.safeParse(existing);
    if (existingMeasuredByParsed.success) {
      existingMeasuredByType = existingMeasuredByParsed.data.measured_by_type ?? null;
      existingMeasuredByStaffId = existingMeasuredByParsed.data.measured_by_staff_id ?? null;
    }

    // Enforce "Measured by" selection before Telegram send / finalization.
    // Default option is "by user" (stored as measured_by_type = 'by_user').
    const effectiveType = parsed.data.measuredBy?.type ?? existingMeasuredByType;
    const effectiveStaffId =
      parsed.data.measuredBy?.type === "staff" ? parsed.data.measuredBy.staffId : existingMeasuredByStaffId;

    if (effectiveType !== "by_user" && effectiveType !== "staff") {
      return NextResponse.json({ error: "Measured by is required" }, { status: 400 });
    }
    if (effectiveType === "staff" && !effectiveStaffId) {
      return NextResponse.json({ error: "Measured by is required" }, { status: 400 });
    }
  }

  const { error } = await admin.from("mp_config_responses").upsert(row, { onConflict: "id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Optional Telegram notify when a response is marked final (only on the first transition to final).
  let telegramStatus: "sent" | "skipped" | "failed" = "skipped";
  if (isFinal && !wasFinal) {
    const chatId = parseTelegramChatId();
    if (chatId) {
      const origin = new URL(req.url).origin;
      const d = parsed.data.data;
      const ts = formatTelegramTimestamp(new Date());

      const yesNo = (v: string) => (v === "yes" ? "Yes" : v === "no" ? "No" : "—");
      let measuredByLabel = "by user";
      try {
        const effectiveType = parsed.data.measuredBy?.type ?? existingMeasuredByType;
        const effectiveStaffId =
          parsed.data.measuredBy?.type === "staff" ? parsed.data.measuredBy.staffId : existingMeasuredByStaffId;

        if (effectiveType === "staff" && effectiveStaffId) {
          const { data: staff, error: sErr } = await admin
            .from("mp_staff")
            .select("name")
            .eq("id", effectiveStaffId)
            .maybeSingle();
          if (!sErr && staff?.name) measuredByLabel = staff.name;
          else measuredByLabel = "staff";
        }
      } catch {
        // Best-effort only; never block the save path.
        measuredByLabel = "by user";
      }

      const text = [
        `💤 Custom Mpillow created on ${ts}`,
        `Name: ${d.name || "—"}`,
        `Gender: ${d.gender || "—"}`,
        `Age group: ${d.ageGroup || "—"}`,
        `Measured by: ${measuredByLabel}`,
        "",
        "📏Measurements",
        `- Shoulder Length: ${d.shoulderLength || "—"}`,
        `- Neck to Back: ${d.neckToBack || "—"}`,
        `- Head to Back: ${d.headToBack || "—"}`,
        `- Neck Length: ${d.neckLength || "—"}`,
        "",
        `- Blood Pressure: ${d.bloodPressureLevel || "—"}`,
        `- Ear discomfort: ${yesNo(String(d.earDiscomfortSideSleep ?? ""))}`,
        `- Bed firmness: ${d.bedFirmness || "—"}`,
        `- Acid Reflux: ${yesNo(String(d.acidReflux ?? ""))}`,
        "",
        `View more: ${origin}/settings/results/${id}`,
      ].join("\n");

      try {
        // Try attaching photos (front/side). Falls back to text-only message if missing.
        const { data: photos, error: pErr } = await admin
          .from("mp_config_response_photos")
          .select("view,data_url")
          .eq("response_id", id);
        if (pErr) console.error("Failed to load mp-config photos", pErr.message);

        const front = (photos ?? []).find((p) => p.view === "front")?.data_url ?? null;
        const side = (photos ?? []).find((p) => p.view === "side")?.data_url ?? null;

        const sent =
          front || side
            ? await sendTelegramMediaGroup(chatId, text, { front, side })
            : await sendTelegramMessage(chatId, text);
        telegramStatus = sent.ok ? "sent" : "failed";
      } catch (e) {
        console.error("Telegram notify failed", e);
        telegramStatus = "failed";
      }
    }
  }

  return NextResponse.json({ ok: true, id, telegramStatus });
}

