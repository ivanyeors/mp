export function errorTextWithoutStripeRequestId(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const requestId = (err as { requestId?: unknown }).requestId;
  const prefix = typeof requestId === "string" && requestId ? `[${requestId}] ` : "";
  return prefix && err.message.startsWith(prefix) ? err.message.slice(prefix.length) : err.message;
}
