import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isPickableStaffProfile } from "@/lib/staff/admin";
import { actingProfile } from "@/lib/staff/working-as";
import {
  buildInstoreReviewOnlyPatch,
  shouldCreateInstoreReviewOnly,
} from "@/lib/results/instore-finalize";
import { normalizePhone } from "@/lib/appointments/phone";
import {
  getDiscoverySourceCatalog,
  normalizeDiscoverySourceOther,
  validateDiscoverySource,
} from "@/lib/discovery-source";
import { getAdminContext, requireAnyAdmin } from "@/lib/auth/admin";
import { getStaffByAssistCode } from "@/lib/assist-link";
import { customerForCustomisation } from "@/lib/crm/customisation-customer";
import { requireResultAccess } from "@/lib/results/access";
import { clientIp, rateLimitExceeded } from "@/lib/rate-limit";
import { listMpConfigResponses } from "@/lib/results/admin/responses-list";
import { listConfigUploads } from "@/lib/config-upload";
import { sizingPhotosForTelegram } from "@/lib/results/sizing-photos";
import { getPublicOrigin } from "@/lib/site-url";
import { stitchShopperVisitor } from "@/lib/analytics/journey/stitch-server";
import { MP_CONFIG_TELEGRAM_CHAT_ID } from "@/lib/telegram/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const rawTime = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  const timeStr = rawTime.replace(/\s?(AM|PM)$/i, (m) => m.toUpperCase().trim());

  return `${dateStr} / ${timeStr}`;
}

function parseTelegramChatId(): number | null {
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
  const max = 1024;
  if (text.length <= max) return text;
  const trimmed = text.slice(0, Math.max(0, max - 2)).trimEnd();
  return `${trimmed}…`;
}

// ponytail: split into ≤10-item chunks (Telegram media-group cap). Named so the loop is testable.
export function chunkItems<T>(items: T[], size = 10): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function sendTelegramMediaGroup(
  chatId: number,
  caption: string,
  photos: { front?: string | null; side?: string | null; referenceUrls?: string[] },
) {
  const token = getOptionalEnv("TELEGRAM_BOT_TOKEN");
  if (!token) return { ok: false as const, reason: "missing_token" as const };

  type Item =
    | { kind: "file"; key: "front" | "side"; blob: Blob; ext: string }
    | { kind: "url"; url: string };
  const items: Item[] = [];
  if (photos.front) {
    const parsed = dataUrlToBlob(photos.front);
    if (parsed) items.push({ kind: "file", key: "front", blob: parsed.blob, ext: parsed.ext });
  }
  if (photos.side) {
    const parsed = dataUrlToBlob(photos.side);
    if (parsed) items.push({ kind: "file", key: "side", blob: parsed.blob, ext: parsed.ext });
  }
  for (const url of photos.referenceUrls ?? []) {
    if (url) items.push({ kind: "url", url });
  }
  if (items.length === 0) return { ok: false as const, reason: "no_photos" as const };

  if (items.length === 1 && items[0].kind === "file") {
    const item = items[0];
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("caption", toTelegramCaption(caption));
    form.append("photo", item.blob, `${item.key}.${item.ext}`);

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

  const chunks = chunkItems(items, 10);
  let firstItem = true;
  for (const chunk of chunks) {
    const form = new FormData();
    form.append("chat_id", String(chatId));

    const media = chunk.map((it) => {
      const entry: { type: "photo"; media: string; caption?: string } =
        it.kind === "file"
          ? { type: "photo", media: `attach://${it.key}` }
          : { type: "photo", media: it.url };
      if (firstItem) {
        entry.caption = toTelegramCaption(caption);
        firstItem = false;
      }
      if (it.kind === "file") form.append(it.key, it.blob, `${it.key}.${it.ext}`);
      return entry;
    });

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
  }
  return { ok: true as const };
}

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
  notes: z.string().max(2000).optional().default(""),
  sleepPainAreas: z.array(z.string().max(64)).max(12).optional(),
  sleepPositionType: z.array(z.string().max(64)).max(12).optional(),
  usesBolster: YesNoEmptySchema.optional(),
  pillowFor: z.enum(["self", "other"]).optional(),
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
  email: z.string().email().optional(),
  phone: z.string().min(1).optional(),
  discoverySource: z.string().min(1).optional(),
  discoverySourceOther: z.string().optional(),
  locationId: z.string().uuid().nullable().optional(),
  persistContact: z.boolean().optional(),
  draftEmail: z.string().trim().toLowerCase().email().max(254).optional(),
  marketingEmail: z.boolean().optional(),
  configurator: z.enum(["full", "basic"]).optional(),
  token: z.string().uuid().nullish(),
  assistCode: z.string().min(1).max(32).optional(),
});

export async function GET(req: Request) {
  const denied = await requireAnyAdmin(["results", "orders"]);
  if (denied) return denied;

  const url = new URL(req.url);
  const result = await listMpConfigResponses({
    limit: url.searchParams.get("limit"),
    offset: url.searchParams.get("offset"),
  });

  return NextResponse.json(result.body, {
    status: result.status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = UpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const id = parsed.data.id ?? crypto.randomUUID();
  const row: Record<string, unknown> = { id, data: parsed.data.data };
  if (typeof parsed.data.isFinal === "boolean") row.is_final = parsed.data.isFinal;
  if (parsed.data.measuredBy) {
    row.measured_by_type = parsed.data.measuredBy.type;
    row.measured_by_staff_id = parsed.data.measuredBy.type === "staff" ? parsed.data.measuredBy.staffId : null;
  }
  if (parsed.data.locationId !== undefined) row.location_id = parsed.data.locationId;

  const persistContact = parsed.data.persistContact === true;
  if (persistContact) {
    if (!parsed.data.email || !parsed.data.phone || !parsed.data.discoverySource) {
      return NextResponse.json(
        { error: "Email, phone, and discovery source are required" },
        { status: 400 },
      );
    }
    const phoneNormalized = normalizePhone(parsed.data.phone);
    if (!phoneNormalized) {
      return NextResponse.json({ error: "Invalid phone", field: "phone" }, { status: 400 });
    }
    const catalog = await getDiscoverySourceCatalog();
    const discoveryErr = validateDiscoverySource(
      {
        discoverySource: parsed.data.discoverySource,
        discoverySourceOther: parsed.data.discoverySourceOther,
      },
      catalog,
    );
    if (discoveryErr) {
      return NextResponse.json(
        { error: discoveryErr.message, field: discoveryErr.field },
        { status: 400 },
      );
    }
    row.customer_email = parsed.data.email;
    row.customer_phone = phoneNormalized;
    row.discovery_source = parsed.data.discoverySource;
    row.discovery_source_other = normalizeDiscoverySourceOther(
      parsed.data.discoverySource,
      parsed.data.discoverySourceOther,
    );
  }

  const admin = supabaseAdmin();
  const isFinal = parsed.data.isFinal === true;

  const { data: existing, error: existingErr } = await admin
    .from("mp_config_responses")
    .select(
      "data,is_final,measured_by_type,measured_by_staff_id,payment_intent_id,source,status,access_token,customer_id,customer_email,order_id",
    )
    .eq("id", id)
    .maybeSingle();
  if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 });

  const storedData =
    existing?.data && typeof existing.data === "object" && !Array.isArray(existing.data)
      ? (existing.data as Record<string, unknown>)
      : null;
  const data: Record<string, unknown> = storedData
    ? { ...storedData, ...parsed.data.data }
    : parsed.data.data;
  row.data = data;

  if (existing) {
    const access = await requireResultAccess(existing, parsed.data.token ?? null, {
      draftOnly: true,
      staffPermissions: ["results"],
    });
    if (!access.ok) return access.response;
  } else if (
    (await rateLimitExceeded({
      bucket: "mp-config-create",
      key: clientIp(req),
      windowMs: 60_000,
      max: 20,
    }))
  ) {
    return NextResponse.json(
      { error: "Too many new sessions. Please try again in a minute." },
      { status: 429 },
    );
  }

  const draftEmail =
    parsed.data.draftEmail && !persistContact && (existing == null || existing.status == null)
      ? parsed.data.draftEmail
      : null;
  if (draftEmail) {
    row.customer_email = draftEmail;
    if (parsed.data.configurator) row.data = { ...data, configurator: parsed.data.configurator };
  }

  if (existing == null && !parsed.data.measuredBy) {
    const staff = await getAdminContext();
    const measuring = staff ? await actingProfile(staff.memberId) : null;
    if (measuring) {
      row.measured_by_type = "staff";
      row.measured_by_staff_id = measuring.id;
    }
  }

  if (
    parsed.data.measuredBy?.type === "staff" &&
    parsed.data.measuredBy.staffId !== (existing?.measured_by_staff_id ?? null) &&
    !(await isPickableStaffProfile(parsed.data.measuredBy.staffId))
  ) {
    return NextResponse.json(
      { error: "That staff profile is archived or no longer exists. Pick another." },
      { status: 400 },
    );
  }

  const accessToken = existing == null ? crypto.randomUUID() : null;
  if (accessToken) row.access_token = accessToken;

  if (existing == null && parsed.data.assistCode) {
    const staff = await getStaffByAssistCode(parsed.data.assistCode);
    if (staff) {
      row.source = "staff_assisted";
      row.assisted_by_admin_id = staff.staffId;
    }
  }

  let wasFinal = false;
  let existingMeasuredByType: string | null = null;
  let existingMeasuredByStaffId: string | null = null;
  if (isFinal) {
    wasFinal = Boolean(existing?.is_final);
    const existingMeasuredByParsed = ExistingMeasuredBySchema.safeParse(existing);
    if (existingMeasuredByParsed.success) {
      existingMeasuredByType = existingMeasuredByParsed.data.measured_by_type ?? null;
      existingMeasuredByStaffId = existingMeasuredByParsed.data.measured_by_staff_id ?? null;
    }

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

  let reviewOnlyPatch: Awaited<ReturnType<typeof buildInstoreReviewOnlyPatch>> | null = null;
  if (
    isFinal &&
    !wasFinal &&
    shouldCreateInstoreReviewOnly(existing) &&
    parsed.data.data
  ) {
    reviewOnlyPatch = await buildInstoreReviewOnlyPatch(data);
    Object.assign(row, reviewOnlyPatch);
  }

  const { error } = await admin.from("mp_config_responses").upsert(row, { onConflict: "id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (draftEmail) {
    await customerForCustomisation(
      admin,
      { email: draftEmail, name: parsed.data.data.name },
      parsed.data.marketingEmail === true,
    );
    await stitchShopperVisitor(admin, req, { email: draftEmail });
  }

  if (persistContact && typeof row.customer_email === "string") {
    await customerForCustomisation(
      admin,
      {
        email: row.customer_email,
        name: parsed.data.data.name,
        phone: typeof row.customer_phone === "string" ? row.customer_phone : null,
      },
      parsed.data.marketingEmail === true,
    );
  }

  let telegramStatus: "sent" | "skipped" | "failed" = "skipped";
  if (isFinal && !wasFinal) {
    const chatId = parseTelegramChatId();
    if (chatId) {
      const origin = getPublicOrigin(req);
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
        measuredByLabel = "by user";
      }

      const lines = [
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
      ];
      const viewMore = `View more: ${origin}/settings/results/${id}`;

      try {
        const { data: photos, error: pErr } = await admin
          .from("mp_config_response_photos")
          .select("view,data_url,drive_file_id,screening_status")
          .eq("response_id", id);
        if (pErr) console.error("Failed to load mp-config photos", pErr.message);

        const { front, side, notes } = await sizingPhotosForTelegram(admin, id, photos ?? []);
        const text = [...lines, ...(notes.length ? [...notes, ""] : []), viewMore].join("\n");

        const refs = await listConfigUploads(id).catch(() => []);
        const referenceUrls = refs.map((r) => r.hostedUrl);

        const sent =
          front || side || referenceUrls.length
            ? await sendTelegramMediaGroup(chatId, text, { front, side, referenceUrls })
            : await sendTelegramMessage(chatId, text);
        telegramStatus = sent.ok ? "sent" : "failed";
      } catch (e) {
        console.error("Telegram notify failed", e);
        telegramStatus = "failed";
      }
    }
  }

  const reviewOnly =
    isFinal &&
    !wasFinal &&
    shouldCreateInstoreReviewOnly(existing);

  return NextResponse.json({
    ok: true,
    id,
    ...(accessToken ? { accessToken } : {}),
    telegramStatus,
    reviewOnly,
    ...(reviewOnly && reviewOnlyPatch ? reviewOnlyPatch : {}),
  });
}

