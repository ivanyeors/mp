import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
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
import { requireAnyAdmin } from "@/lib/auth/admin";
import { getStaffByAssistCode } from "@/lib/assist-link";
import { requireResultAccess } from "@/lib/results/access";
import { clientIp, isRateLimited } from "@/lib/rate-limit";
import { listMpConfigResponses } from "@/lib/results/admin/responses-list";
import { listConfigUploads } from "@/lib/config-upload";
import { getPublicOrigin } from "@/lib/site-url";

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

  // Ordered item list: front, side (multipart attach:// data-url blobs), then reference URLs.
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

  // Fast-path: exactly one front/side data-url item and no reference URLs → sendPhoto so the
  // caption lands on the message (unchanged from the front/side-only behavior).
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

  // Chunk into ≤10-item media groups. Caption only on the first item of the first chunk.
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
      // Only file items need a multipart part; URL items are referenced directly.
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
  /** When set (Save without purchasing / finalize), contact is required + persisted. */
  email: z.string().email().optional(),
  phone: z.string().min(1).optional(),
  discoverySource: z.string().min(1).optional(),
  discoverySourceOther: z.string().optional(),
  /** Operator-editable origin Location (partners.id), null to clear. */
  locationId: z.string().uuid().nullable().optional(),
  /** Explicit flag: require + write contact columns on this upsert. */
  persistContact: z.boolean().optional(),
  /** Result access token — proves the caller owns an existing row. */
  token: z.string().uuid().nullish(),
  /** Assist link code from `/mp-config?assist=`. Re-resolved server-side. */
  assistCode: z.string().min(1).max(32).optional(),
});

export async function GET(req: Request) {
  // Results staff list responses here; the Orders page also searches unlinked
  // results from the order detail dialog, so either permission is enough.
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
      // Ensure the results list is never cached (helps avoid “stuck at N rows” issues).
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

  // Loaded for every write, not only finalization: the Draft Result guard below
  // needs the status, and the isFinal branch reuses this same fetch rather than
  // adding a second round trip.
  const { data: existing, error: existingErr } = await admin
    .from("mp_config_responses")
    .select(
      "is_final,measured_by_type,measured_by_staff_id,payment_intent_id,source,status,access_token,customer_id,customer_email,order_id",
    )
    .eq("id", id)
    .maybeSingle();
  if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 });

  // Creating a row stays open — there is nothing to own yet, and the configurator
  // saves from the first keystroke. Updating one does not.
  if (existing) {
    // draftOnly: Staff keep editing measured-by / location / is_final on `held`
    // rows from the Admin Panel; everyone else may write drafts only. Staff means
    // `results` here — a viewer carries `orders` and would skip draftOnly.
    const access = await requireResultAccess(existing, parsed.data.token ?? null, {
      draftOnly: true,
      staffPermissions: ["results"],
    });
    if (!access.ok) return access.response;
  } else if (
    // Creating a Draft Result is the one write left that cannot require a
    // credential, so cap it. One create per configurator session (plus a few for
    // "start again"), against a limit no real shopper reaches — including several
    // customers behind one in-store IP.
    isRateLimited({
      bucket: "mp-config-create",
      key: clientIp(req),
      windowMs: 60_000,
      max: 20,
    })
  ) {
    return NextResponse.json(
      { error: "Too many new sessions. Please try again in a minute." },
      { status: 429 },
    );
  }

  // Result access token (CONTEXT.md): minted once, when the Draft Result is
  // created, and returned so the configurator can prove ownership on later
  // requests. Deliberately never minted on update — a legacy draft carrying a
  // null token has to stay writable by the pre-deploy browser tab that owns it,
  // and binding a token here would lock out the very session it just let through.
  // The hold route keeps this same token (app/api/results/hold/route.ts).
  const accessToken = existing == null ? crypto.randomUUID() : null;
  if (accessToken) row.access_token = accessToken;

  // Assist link stamp (PRD staff-assisted-customisation). On CREATE ONLY, for
  // the same reason as the token above: `source` is what authorises the no-card
  // submit downstream, so a later update must never be able to write it — a
  // caller who reaches an existing row could otherwise relabel a self-serve
  // Result as staff-assisted and put a free build into the queue.
  // The client sends the CODE; the Staff id is resolved here and never trusted
  // from the request. An unknown or deactivated code leaves the row untouched,
  // so the visitor gets the ordinary flow rather than an error.
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

  let reviewOnlyPatch: Awaited<ReturnType<typeof buildInstoreReviewOnlyPatch>> | null = null;
  if (
    isFinal &&
    !wasFinal &&
    shouldCreateInstoreReviewOnly(existing) &&
    parsed.data.data
  ) {
    reviewOnlyPatch = await buildInstoreReviewOnlyPatch(
      parsed.data.data as Record<string, unknown>,
    );
    Object.assign(row, reviewOnlyPatch);
  }

  const { error } = await admin.from("mp_config_responses").upsert(row, { onConflict: "id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Optional Telegram notify when a response is marked final (only on the first transition to final).
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

