/**
 * Pure partner session-freshness cap. No server-only imports so the test slice
 * can unit-test it headless.
 *
 * Partners get a 7-day absolute session cap: even a valid Supabase session must
 * re-authenticate once its last sign-in is older than the cap.
 *
 * Returns false when the timestamp is missing/unparseable (treat as stale).
 * Boundary: exactly `capDays` old is still fresh; strictly older is stale.
 */
export function isPartnerSessionFresh(
  lastSignInAt: string | null | undefined,
  now: Date,
  capDays = 7,
): boolean {
  if (!lastSignInAt) return false;
  const signedInAt = new Date(lastSignInAt).getTime();
  if (Number.isNaN(signedInAt)) return false;
  return now.getTime() - signedInAt <= capDays * 24 * 60 * 60 * 1000;
}
