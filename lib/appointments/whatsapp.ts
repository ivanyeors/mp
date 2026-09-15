import { createHmac } from "node:crypto";
import { secretMatches } from "@/lib/auth/secret";
import { formatSlotLabelSgt, type SlotOffer } from "./slots";

const GRAPH = "https://graph.facebook.com/v21.0";

function phoneNumberId(): string {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!id) throw new Error("Missing WHATSAPP_PHONE_NUMBER_ID");
  return id;
}

function token(): string {
  const t = process.env.WHATSAPP_TOKEN?.trim();
  if (!t) throw new Error("Missing WHATSAPP_TOKEN");
  return t;
}

async function sendPayload(body: Record<string, unknown>): Promise<string | null> {
  const res = await fetch(`${GRAPH}/${phoneNumberId()}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    messages?: Array<{ id?: string }>;
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(
      `WhatsApp send failed (${res.status}): ${json.error?.message ?? JSON.stringify(json)}`,
    );
  }
  return json.messages?.[0]?.id ?? null;
}

/** E.164 without leading + for Cloud API `to`. */
function toWa(e164: string): string {
  return e164.replace(/^\+/, "");
}

/**
 * Send an approved WhatsApp template by name with ordered body-text params.
 * Business-initiated notifications (e.g. partner alerts, #86) must use an
 * approved template — free text is only allowed inside a 24h service window.
 * Returns the provider message id, or throws on API failure (callers decide
 * whether that is fatal; partner notifications treat it as best-effort).
 */
export async function sendTemplateMessage(
  e164: string,
  templateName: string,
  bodyParams: string[],
): Promise<string | null> {
  // Meta approves each template under an exact language code. Default "en", but
  // let ops override (e.g. "en_US") to match how the templates were approved —
  // a mismatch is a silent 132001 "template does not exist in this language".
  const lang = process.env.WHATSAPP_TEMPLATE_LANG?.trim() || "en";
  return sendPayload({
    messaging_product: "whatsapp",
    to: toWa(e164),
    type: "template",
    template: {
      name: templateName,
      language: { code: lang },
      components: bodyParams.length
        ? [{ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) }]
        : [],
    },
  });
}

export type DayBeforeParams = {
  guestName: string;
  dateLabel: string;
  timeLabel: string;
  typeLabel: string;
};

export async function sendDayBeforeTemplate(
  e164: string,
  params: DayBeforeParams,
): Promise<string | null> {
  const name =
    process.env.WHATSAPP_TEMPLATE_DAY_BEFORE?.trim() || "appointment_day_before";
  return sendPayload({
    messaging_product: "whatsapp",
    to: toWa(e164),
    type: "template",
    template: {
      name,
      language: { code: "en" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: params.guestName },
            { type: "text", text: params.dateLabel },
            { type: "text", text: params.timeLabel },
            { type: "text", text: params.typeLabel },
          ],
        },
      ],
    },
  });
}

export type MorningOfParams = {
  guestName: string;
  dateLabel: string;
  timeLabel: string;
  venue: string;
};

export async function sendMorningOfTemplate(
  e164: string,
  params: MorningOfParams,
): Promise<string | null> {
  const name =
    process.env.WHATSAPP_TEMPLATE_MORNING_OF?.trim() || "appointment_morning_of";
  return sendPayload({
    messaging_product: "whatsapp",
    to: toWa(e164),
    type: "template",
    template: {
      name,
      language: { code: "en" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: params.guestName },
            { type: "text", text: params.dateLabel },
            { type: "text", text: params.timeLabel },
            { type: "text", text: params.venue },
          ],
        },
      ],
    },
  });
}

export async function sendCancelMessage(
  e164: string,
  opts: { bookingUrl: string; typeLabel: string; within24h: boolean },
): Promise<string | null> {
  const text = [
    `Your ${opts.typeLabel} appointment has been cancelled.`,
    `You can rebook here: ${opts.bookingUrl}`,
  ].join("\n");

  if (opts.within24h) {
    return sendPayload({
      messaging_product: "whatsapp",
      to: toWa(e164),
      type: "text",
      text: { body: text },
    });
  }

  const name =
    process.env.WHATSAPP_TEMPLATE_CANCEL?.trim() || "appointment_cancelled";
  return sendPayload({
    messaging_product: "whatsapp",
    to: toWa(e164),
    type: "template",
    template: {
      name,
      language: { code: "en" },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: opts.typeLabel },
            { type: "text", text: opts.bookingUrl },
          ],
        },
      ],
    },
  });
}

export async function sendSlotList(
  e164: string,
  slots: SlotOffer[],
): Promise<string | null> {
  const rows = slots.slice(0, 10).map((s) => ({
    id: s.id,
    title: formatSlotLabelSgt(s.startIso).slice(0, 24),
    description: "Asia/Singapore",
  }));
  return sendPayload({
    messaging_product: "whatsapp",
    to: toWa(e164),
    type: "interactive",
    interactive: {
      type: "list",
      body: {
        text: "Please pick a new appointment time:",
      },
      action: {
        button: "View times",
        sections: [{ title: "Available", rows }],
      },
    },
  });
}

export async function sendText(
  e164: string,
  body: string,
): Promise<string | null> {
  return sendPayload({
    messaging_product: "whatsapp",
    to: toWa(e164),
    type: "text",
    text: { body },
  });
}

/** Meta webhook GET verify. */
export function verifyWebhookChallenge(params: {
  mode: string | null;
  token: string | null;
  challenge: string | null;
}): string | null {
  const verify = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
  if (params.mode === "subscribe" && secretMatches(verify, params.token)) {
    return params.challenge;
  }
  return null;
}

/** Verify X-Hub-Signature-256. */
export function verifyWhatsAppSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET?.trim();
  if (!secret) {
    // ponytail: skip verify in dev when secret unset; set WHATSAPP_APP_SECRET in prod.
    return process.env.NODE_ENV !== "production";
  }
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const got = signatureHeader.slice("sha256=".length);
  return secretMatches(expected, got);
}

export type InboundWaAction =
  | { kind: "confirm"; fromE164: string; messageId: string }
  | { kind: "reschedule"; fromE164: string; messageId: string }
  | { kind: "slot"; fromE164: string; messageId: string; slotId: string }
  | { kind: "reject_slots"; fromE164: string; messageId: string }
  | { kind: "unknown"; fromE164: string; messageId: string };

/** Parse Cloud API webhook payload into actionable intents. */
export function parseInboundActions(payload: unknown): InboundWaAction[] {
  const out: InboundWaAction[] = [];
  const root = payload as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          messages?: Array<{
            id?: string;
            from?: string;
            type?: string;
            button?: { payload?: string; text?: string };
            interactive?: {
              type?: string;
              list_reply?: { id?: string; title?: string };
              button_reply?: { id?: string; title?: string };
            };
            text?: { body?: string };
          }>;
        };
      }>;
    }>;
  };

  for (const entry of root.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const msg of change.value?.messages ?? []) {
        if (!msg.from || !msg.id) continue;
        const fromE164 = msg.from.startsWith("+") ? msg.from : `+${msg.from}`;
        const messageId = msg.id;

        if (msg.type === "button") {
          const key = `${msg.button?.payload ?? ""} ${msg.button?.text ?? ""}`.toLowerCase();
          if (key.includes("confirm")) {
            out.push({ kind: "confirm", fromE164, messageId });
          } else if (key.includes("reschedule")) {
            out.push({ kind: "reschedule", fromE164, messageId });
          } else {
            out.push({ kind: "unknown", fromE164, messageId });
          }
          continue;
        }

        if (msg.type === "interactive") {
          const listId = msg.interactive?.list_reply?.id ?? "";
          const btnId = (
            msg.interactive?.button_reply?.id ??
            msg.interactive?.button_reply?.title ??
            ""
          ).toLowerCase();
          if (listId.startsWith("slot_")) {
            out.push({ kind: "slot", fromE164, messageId, slotId: listId });
          } else if (
            btnId.includes("none") ||
            btnId.includes("reject") ||
            btnId.includes("cancel") ||
            btnId.includes("none of these")
          ) {
            out.push({ kind: "reject_slots", fromE164, messageId });
          } else if (btnId.includes("confirm")) {
            out.push({ kind: "confirm", fromE164, messageId });
          } else if (btnId.includes("reschedule")) {
            out.push({ kind: "reschedule", fromE164, messageId });
          } else {
            out.push({ kind: "unknown", fromE164, messageId });
          }
          continue;
        }

        if (msg.type === "text") {
          const body = (msg.text?.body ?? "").trim().toLowerCase();
          if (body === "confirm" || body === "yes") {
            out.push({ kind: "confirm", fromE164, messageId });
          } else if (body === "reschedule" || body === "no") {
            out.push({ kind: "reschedule", fromE164, messageId });
          } else if (
            body.includes("none of these") ||
            body === "cancel" ||
            body === "reject"
          ) {
            out.push({ kind: "reject_slots", fromE164, messageId });
          } else {
            out.push({ kind: "unknown", fromE164, messageId });
          }
        }
      }
    }
  }
  return out;
}

/** True if last outbound was within 24h (service window). */
export function withinServiceWindow(lastOutboundAt: string | null | undefined): boolean {
  if (!lastOutboundAt) return false;
  const t = Date.parse(lastOutboundAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < 24 * 60 * 60 * 1000;
}
