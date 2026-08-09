import { notFound } from "next/navigation";

/**
 * Hard-block the email preview surface outside development.
 *
 * NODE_ENV alone is not enough: Vercel builds preview deployments with
 * NODE_ENV=production, so a NODE_ENV-only check would still 404 correctly there
 * but leaves no way to use the preview on a deploy preview. The rule is:
 *
 *   - not production        → allowed (local `next dev`)
 *   - Vercel preview deploy → allowed ONLY with ALLOW_EMAIL_PREVIEW=1
 *   - anything else         → 404
 *
 * The templates render sample data only, but the surface still exposes internal
 * copy and staff-facing notices, so production stays closed.
 */
export function assertEmailPreviewAllowed(): void {
  if (process.env.NODE_ENV !== "production") return;
  if (
    process.env.VERCEL_ENV === "preview" &&
    process.env.ALLOW_EMAIL_PREVIEW === "1"
  ) {
    return;
  }
  notFound();
}
