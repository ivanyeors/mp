const REVIEW_TYPES = new Set(["NEW_REVIEW", "UPDATED_REVIEW"]);

type PushBody = { message?: { data?: string } };

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
