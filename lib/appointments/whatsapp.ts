import { createHmac } from "node:crypto";
import { secretMatches } from "@/lib/auth/secret";
import { SUPPORT_WHATSAPP_DISPLAY } from "@/lib/contact";
import { guestText, whenLabel } from "./messages";
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

export class WhatsAppSendError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: number | null,
  ) {
    super(message);
    this.name = "WhatsAppSendError";
  }
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
    error?: { message?: string; code?: number };
  };
  if (!res.ok) {
    throw new WhatsAppSendError(
      `WhatsApp send failed (${res.status}): ${json.error?.message ?? JSON.stringify(json)}`,
      res.status,
      typeof json.error?.code === "number" ? json.error.code : null,
    );
  }
  return json.messages?.[0]?.id ?? null;
}

function toWa(e164: string): string {
  return e164.replace(/^\+/, "");
}

export async function sendTemplateMessage(
  e164: string,
  templateName: string,
  bodyParams: string[],
  options: { urlButtonParam?: string } = {},
): Promise<string | null> {
  const lang = process.env.WHATSAPP_TEMPLATE_LANG?.trim() || "en";
  const components: Record<string, unknown>[] = bodyParams.length
    ? [{ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) }]
    : [];
  if (options.urlButtonParam !== undefined) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: options.urlButtonParam }],
    });
  }
  return sendPayload({
    messaging_product: "whatsapp",
    to: toWa(e164),
    type: "template",
    template: {
      name: templateName,
      language: { code: lang },
      components,
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
    process.env.WHATSAPP_TEMPLATE_DAY_BEFORE?.trim() || "appointment_day_before_v2";
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

export type CancelParams = {
  guestName: string;
  typeLabel: string;
  startsAt: string;
  bookingUrl: string;
};

export async function sendCancelMessage(
  e164: string,
  params: CancelParams,
  opts: { within24h: boolean },
): Promise<string | null> {
  if (opts.within24h) return sendText(e164, guestText.cancelled(params));

  const name =
    process.env.WHATSAPP_TEMPLATE_CANCEL?.trim() || "appointment_cancelled_v2";
  const values =
    name === "appointment_cancelled"
      ? [params.typeLabel, params.bookingUrl]
      : [params.guestName, params.typeLabel, whenLabel(params.startsAt), params.bookingUrl, SUPPORT_WHATSAPP_DISPLAY];
  return sendPayload({
    messaging_product: "whatsapp",
    to: toWa(e164),
    type: "template",
    template: {
      name,
      language: { code: "en" },
      components: [
        { type: "body", parameters: values.map((text) => ({ type: "text", text })) },
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
        text: guestText.slotListBody(),
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
  | { kind: "cancel"; fromE164: string; messageId: string; bare: boolean }
  | { kind: "stop"; fromE164: string; messageId: string }
  | { kind: "unknown"; fromE164: string; messageId: string };

const UNACTIONABLE_TYPES = new Set([
  "image",
  "audio",
  "video",
  "document",
  "sticker",
  "location",
  "contacts",
]);

const BARE_CANCEL_WORDS = new Set(["cancel", "cancel please", "please cancel"]);
const CANCEL_WORDS = new Set([...BARE_CANCEL_WORDS, "cancel appointment", "cancel booking"]);

const STOP_WORDS = new Set(["stop", "unsubscribe", "stop messages", "stop sending"]);

export function parseInboundActions(
  payload: unknown,
  phoneNumberId?: string,
): InboundWaAction[] {
  const out: InboundWaAction[] = [];
  const root = payload as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          metadata?: { phone_number_id?: string };
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
      const to = change.value?.metadata?.phone_number_id;
      if (phoneNumberId && to && to !== phoneNumberId) continue;
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
          } else if (body.includes("none of these") || body === "reject") {
            out.push({ kind: "reject_slots", fromE164, messageId });
          } else if (CANCEL_WORDS.has(body)) {
            out.push({ kind: "cancel", fromE164, messageId, bare: BARE_CANCEL_WORDS.has(body) });
          } else if (STOP_WORDS.has(body)) {
            out.push({ kind: "stop", fromE164, messageId });
          } else {
            out.push({ kind: "unknown", fromE164, messageId });
          }
          continue;
        }

        if (msg.type && UNACTIONABLE_TYPES.has(msg.type)) {
          out.push({ kind: "unknown", fromE164, messageId });
        }
      }
    }
  }
  return out;
}

export function withinServiceWindow(
  lastInboundAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!lastInboundAt) return false;
  const t = Date.parse(lastInboundAt);
  if (!Number.isFinite(t)) return false;
  return now - t < 24 * 60 * 60 * 1000;
}

export function askBeforeCancel(input: {
  bare: boolean;
  lastAftercareSentAt: string | null | undefined;
  reminderLastOutboundAt: string | null | undefined;
}): boolean {
  if (!input.bare || !input.lastAftercareSentAt) return false;
  const aftercare = Date.parse(input.lastAftercareSentAt);
  if (!Number.isFinite(aftercare)) return false;
  const reminder = input.reminderLastOutboundAt ? Date.parse(input.reminderLastOutboundAt) : NaN;
  return !Number.isFinite(reminder) || aftercare > reminder;
}

export type FailedDelivery = { waId: string; recipient: string; reason: string };

export function parseFailedDeliveries(
  payload: unknown,
  phoneNumberId?: string,
): FailedDelivery[] {
  const out: FailedDelivery[] = [];
  const root = payload as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          metadata?: { phone_number_id?: string };
          statuses?: Array<{
            id?: string;
            status?: string;
            recipient_id?: string;
            errors?: Array<{ code?: number; title?: string; message?: string; error_data?: { details?: string } }>;
          }>;
        };
      }>;
    }>;
  };
  for (const entry of root.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const to = change.value?.metadata?.phone_number_id;
      if (phoneNumberId && to && to !== phoneNumberId) continue;
      for (const st of change.value?.statuses ?? []) {
        if (st.status !== "failed" || !st.id) continue;
        const err = st.errors?.[0];
        const detail = err?.error_data?.details ?? err?.message ?? err?.title ?? "no reason given";
        out.push({
          waId: st.id,
          recipient: st.recipient_id ? `+${st.recipient_id.replace(/^\+/, "")}` : "",
          reason: `WhatsApp delivery failed (${err?.code ?? "?"}): ${detail}`,
        });
      }
    }
  }
  return out;
}
