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
