import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

// Safety guard: mp-config notifications are restricted to a single Telegram group chat.
// This prevents accidental leakage to other chats even if env vars are misconfigured.
const MP_CONFIG_TELEGRAM_CHAT_ID = -1001279910218;

function getOptionalEnv(name: string): string | null {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : null;
}

function parseTelegramChatId(): number | null {
  // Only allow sending to the restricted group chat id.
  return MP_CONFIG_TELEGRAM_CHAT_ID;
}

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

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
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

const UpsertSchema = z.object({
  id: z.string().uuid().optional(),
  data: MeasurementSchema,
  isFinal: z.boolean().optional(),
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
    .select("id,data,is_final,created_at,updated_at", { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    rows: data ?? [],
    count: typeof count === "number" ? count : null,
    limit,
    offset,
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = UpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const id = parsed.data.id ?? crypto.randomUUID();
  const row: { id: string; data: unknown; is_final?: boolean } = { id, data: parsed.data.data };
  if (typeof parsed.data.isFinal === "boolean") row.is_final = parsed.data.isFinal;

  const admin = supabaseAdmin();
  const isFinal = parsed.data.isFinal === true;
  let wasFinal = false;
  if (isFinal) {
    const { data: existing, error: existingErr } = await admin
      .from("mp_config_responses")
      .select("is_final")
      .eq("id", id)
      .maybeSingle();
    if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 });
    wasFinal = Boolean(existing?.is_final);
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
      const text = [
        "✅ Mpillow config saved (final)",
        `Name: ${d.name || "—"}`,
        `Gender: ${d.gender || "—"}`,
        `Age group: ${d.ageGroup || "—"}`,
        `Measurements (cm): shoulder ${d.shoulderLength || "—"}, neck→back ${d.neckToBack || "—"}, head→back ${d.headToBack || "—"}, neck ${d.neckLength || "—"}`,
        `ID: ${id}`,
        `View: ${origin}/settings/results/${id}`,
      ].join("\n");

      try {
        const sent = await sendTelegramMessage(chatId, text);
        telegramStatus = sent.ok ? "sent" : "failed";
      } catch (e) {
        console.error("Telegram notify failed", e);
        telegramStatus = "failed";
      }
    }
  }

  return NextResponse.json({ ok: true, id, telegramStatus });
}

