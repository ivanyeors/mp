import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Easyship signs every webhook with a JWT in the `X-EASYSHIP-SIGNATURE` header,
 * HS256 over the webhook's secret key (Easyship dashboard → Connect → API
 * Integrations → Webhooks). Verified here with node:crypto so no JWT library is
 * pulled in for one header.
 */
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
  // Pin the algorithm: "none" or an asymmetric alg must never verify against an HMAC secret.
  if (header?.alg !== "HS256") return false;

  const expected = createHmac("sha256", secret).update(`${headerPart}.${payloadPart}`).digest();
  const actual = base64UrlDecode(signaturePart);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;

  const nowSec = Math.floor(nowMs / 1000);
  // A minute of leeway for clock skew between Easyship and this server.
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
  /** The courier status for tracking events, e.g. "In Transit to Customer", "Delivered". */
  status: string | null;
}

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * `{ event_type, resource_type, resource_id, data: { easyship_shipment_id, ... } }`.
 * Null for anything that is not a shipment event this app understands.
 */
export function parseEasyshipEvent(body: unknown): EasyshipWebhookEvent | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  // 2023-01 payloads nest under `tracking_status` instead of `data`.
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
  };
}

/** Easyship reports a finished delivery as "Delivered"; anything else is still on its way. */
export function isDeliveredStatus(status: string | null | undefined): boolean {
  return (status ?? "").trim().toLowerCase().replace(/[^a-z]/g, "") === "delivered";
}

export type TrackingStatusKey = "in_transit" | "out_for_delivery" | "unsuccessful_delivery_attempt" | "delivered" | "exception";

/** Maps a courier status string to the status a customer can be emailed about. Null for anything else. */
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
