/**
 * Gate for the email preview surface.
 *
 * NODE_ENV alone is not enough: Vercel builds preview deployments with
 * NODE_ENV=production, so there would be no way to switch the surface on for a
 * deploy preview without also opening it in production. The rule is:
 *
 *   - not production        → allowed (local `next dev`)
 *   - Vercel preview deploy → allowed ONLY with ALLOW_EMAIL_PREVIEW=1
 *   - anything else         → blocked
 *
 * The templates render sample data only, but the surface still exposes internal
 * copy and staff-facing notices, so production stays closed.
 */
export function isEmailPreviewAllowed(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return (
    process.env.VERCEL_ENV === "preview" &&
    process.env.ALLOW_EMAIL_PREVIEW === "1"
  );
}
