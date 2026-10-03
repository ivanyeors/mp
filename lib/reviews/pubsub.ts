/**
 * Google Business Profile notifications arrive as Cloud Pub/Sub push messages:
 * `{ message: { data: base64(JSON), messageId, publishTime }, subscription }`.
 * Only the notification type is read, and only to skip types this flow does not
 * care about — the sync re-reads Google rather than trusting the payload.
 */

const REVIEW_TYPES = new Set(["NEW_REVIEW", "UPDATED_REVIEW"]);

type PushBody = { message?: { data?: string } };

/** The notification type inside the base64 `message.data`, if it parses. */
export function notificationType(body: unknown): string | null {
  const data = (body as PushBody | null)?.message?.data;
  if (typeof data !== "string" || !data) return null;
  try {
    const json = JSON.parse(Buffer.from(data, "base64").toString("utf8")) as { type?: unknown };
    return typeof json.type === "string" ? json.type : null;
  } catch {
    return null;
  }
}

export function isReviewNotification(type: string): boolean {
  return REVIEW_TYPES.has(type);
}
