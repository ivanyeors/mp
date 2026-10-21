// ============================================================
// Resend's webhook: signature and events (migration slice 08)
// ============================================================
//
// Resend signs its webhooks the Svix way. Each request carries `svix-id`,
// `svix-timestamp` (Unix seconds) and `svix-signature`, a space-separated list
// of `v1,<base64>` signatures. Each is
//   base64(HMAC-SHA256(key, `${id}.${timestamp}.${raw body}`))
// where `key` is the base64 after `whsec_` in the endpoint's signing secret
// (CAMPAIGN_RESEND_WEBHOOK_SECRET). A timestamp more than five minutes from
// now is refused, so a captured request cannot be replayed later.
//
// Two events matter to the campaign (POST /api/email/resend-webhook):
//   email.bounced     a hard bounce: the send is marked `bounced`, and the
//                     Customer is left out of every later wave
//   email.complained  a spam complaint: the send is marked `complained`, and
//                     the Customer is unsubscribed with source `complaint`
// Everything else is acknowledged and ignored.

import { createHmac } from "node:crypto";
import { secretMatches } from "@/lib/auth/secret";

/** How far a signed timestamp may be from now. */
export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export interface WebhookHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

/** The three signature headers, Svix's names first, then Standard Webhooks'. */
export function webhookHeaders(headers: Headers): WebhookHeaders {
  return {
    id: headers.get("svix-id") ?? headers.get("webhook-id"),
    timestamp: headers.get("svix-timestamp") ?? headers.get("webhook-timestamp"),
    signature: headers.get("svix-signature") ?? headers.get("webhook-signature"),
  };
}

function secretKey(secret: string): Buffer | null {
  const raw = secret.trim().replace(/^whsec_/, "");
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  return key.length > 0 ? key : null;
}

/** The `v1` signature of a payload: what the provider sends, and what a test signs with. */
export function signWebhook(secret: string, id: string, timestamp: string, body: string): string {
  const key = secretKey(secret);
  if (!key) throw new Error("Not a webhook signing secret");
  return createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
}

/**
 * Does the request carry a valid signature, made within the tolerance?
 * Fails closed: no secret, a missing header or a malformed timestamp is false.
 */
export function verifyWebhookSignature(
  secret: string | undefined,
  headers: WebhookHeaders,
  body: string,
  now: Date = new Date(),
): boolean {
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false;
  if (!secretKey(secret)) return false;
  if (!/^\d{1,12}$/.test(headers.timestamp)) return false;
  const skew = Math.abs(now.getTime() / 1000 - Number(headers.timestamp));
  if (skew > WEBHOOK_TOLERANCE_SECONDS) return false;

  const expected = signWebhook(secret, headers.id, headers.timestamp, body);
  return headers.signature
    .split(/\s+/)
    .filter(Boolean)
    .some((entry) => {
      const [version, sig] = entry.split(",", 2);
      return version === "v1" && secretMatches(expected, sig ?? null);
    });
}

export type CampaignWebhookEvent =
  | { kind: "bounced" | "complained"; emailId: string; at: string | null }
  | { kind: "ignored"; type: string };

/**
 * Pure — what an event means to the campaign. A bounce Resend calls
 * `Transient` (a full mailbox, a server down) is not a hard bounce, and is
 * ignored: the address may work tomorrow.
 */
export function readWebhookEvent(payload: unknown): CampaignWebhookEvent {
  const p = (payload ?? {}) as { type?: unknown; created_at?: unknown; data?: unknown };
  const type = typeof p.type === "string" ? p.type : "unknown";
  const data = (p.data ?? {}) as { email_id?: unknown; bounce?: { type?: unknown } };
  const emailId = typeof data.email_id === "string" && data.email_id.trim() ? data.email_id.trim() : null;
  const at = typeof p.created_at === "string" && !Number.isNaN(Date.parse(p.created_at)) ? p.created_at : null;
  if (!emailId) return { kind: "ignored", type };
  if (type === "email.bounced") {
    const bounceType = typeof data.bounce?.type === "string" ? data.bounce.type.toLowerCase() : null;
    if (bounceType === "transient") return { kind: "ignored", type: `${type} (transient)` };
    return { kind: "bounced", emailId, at };
  }
  if (type === "email.complained") return { kind: "complained", emailId, at };
  return { kind: "ignored", type };
}
