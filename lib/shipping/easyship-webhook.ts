import { createHmac, timingSafeEqual } from "node:crypto";

export const EASYSHIP_SIGNATURE_HEADER = "x-easyship-signature";

function base64UrlDecode(part: string): Buffer {
  return Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function verifyEasyshipSignature(
  token: string | null | undefined,
  secret: string,
  nowMs: number = Date.now(),
): boolean {
  if (!token || !secret) return false;
  const parts = token.trim().split(".");
  if (parts.length !== 3) return false;
  const [headerPart, payloadPart, signaturePart] = parts;

  let header: { alg?: unknown };
  let payload: { exp?: unknown; nbf?: unknown };
  try {
    header = JSON.parse(base64UrlDecode(headerPart).toString("utf8"));
    payload = JSON.parse(base64UrlDecode(payloadPart).toString("utf8"));
  } catch {
    return false;
  }
  if (header?.alg !== "HS256") return false;

  const expected = createHmac("sha256", secret).update(`${headerPart}.${payloadPart}`).digest();
  const actual = base64UrlDecode(signaturePart);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;

  const nowSec = Math.floor(nowMs / 1000);
  if (typeof payload?.exp === "number" && payload.exp + 60 < nowSec) return false;
  if (typeof payload?.nbf === "number" && payload.nbf - 60 > nowSec) return false;
  return true;
}

export interface EasyshipWebhookEvent {
  eventType: string;
  shipmentId: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
  labelUrl: string | null;
  status: string | null;
  checkpoint: string | null;
}

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function parseEasyshipEvent(body: unknown): EasyshipWebhookEvent | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const raw = b.data ?? b.tracking_status;
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const eventType = text(b.event_type);
  const shipmentId = text(data.easyship_shipment_id) ?? text(b.resource_id);
  if (!eventType || !shipmentId) return null;
  return {
    eventType,
    shipmentId,
    trackingNumber: text(data.tracking_number),
    trackingUrl: text(data.tracking_page_url),
    labelUrl: text(data.label_url),
    status: text(data.status),
    checkpoint: latestCheckpoint(data.checkpoints),
  };
}

function latestCheckpoint(list: unknown): string | null {
  if (!Array.isArray(list)) return null;
  const time = (c: Record<string, unknown>) => Date.parse(String(c.checkpoint_time ?? "")) || 0;
  const latest = list
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .reduce<Record<string, unknown> | null>((a, c) => (!a || time(c) >= time(a) ? c : a), null);
  const message = text(latest?.message);
  if (!latest || !message) return null;
  const place = text(latest.location) ?? ([text(latest.city), text(latest.country_name)].filter(Boolean).join(", ") || null);
  return place ? `${message} — ${place}` : message;
}

export function isDeliveredStatus(status: string | null | undefined): boolean {
  return (status ?? "").trim().toLowerCase().replace(/[^a-z]/g, "") === "delivered";
}

export type TrackingStatusKey = "in_transit" | "out_for_delivery" | "unsuccessful_delivery_attempt" | "delivered" | "exception";

export function trackingStatusKey(status: string | null | undefined): TrackingStatusKey | null {
  const s = (status ?? "").toLowerCase().replace(/[^a-z]/g, "");
  // ponytail: keyword match on Easyship's free-text status; switch to its status ids if one is misfiled
  if (s === "delivered") return "delivered";
  if (s.includes("outfordelivery")) return "out_for_delivery";
  if (s.includes("attempt") || s.includes("faileddelivery")) return "unsuccessful_delivery_attempt";
  if (s.includes("exception") || s.includes("lost") || s.includes("returned") || s.includes("liquidated")) return "exception";
  if (s.includes("transit")) return "in_transit";
  return null;
}
