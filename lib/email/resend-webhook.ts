import { createHmac } from "node:crypto";
import { secretMatches } from "@/lib/auth/secret";

export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export interface WebhookHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

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

export function signWebhook(secret: string, id: string, timestamp: string, body: string): string {
  const key = secretKey(secret);
  if (!key) throw new Error("Not a webhook signing secret");
  return createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
}

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
