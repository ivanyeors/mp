// Where partner logos live in the public `media` bucket, and whether a URL is
// one we stored there. Pure and client-safe (no sharp / supabase), so the apply
// action, the profile PATCH, the Staff queue and tests share one rule.
//
// - An applicant's logo: `partner-logos/applicants/{authUserId}/…` — uploaded
//   with the application, before there is a partner row to file it under.
// - A partner's logo:    `partner-logos/{partnerId}/…` — uploaded in Partner Hub.
//
// Partner ids are UUIDs, so the `applicants` folder never collides with one.

const PUBLIC_MEDIA_PATH = "/storage/v1/object/public/media/";

export function partnerLogoFolder(partnerId: string): string {
  return `partner-logos/${partnerId}/`;
}

export function applicantLogoFolder(authUserId?: string): string {
  return authUserId ? `partner-logos/applicants/${authUserId}/` : "partner-logos/applicants/";
}

/**
 * True when `url` is a public object in our own Supabase project's `media`
 * bucket under `folder` — not merely a matching path on some other host. The
 * Admin Panel and /our-partners render these as images, so a logo URL is only
 * ever one we wrote after optimising and size-checking the upload.
 */
export function isStoredLogoUrl(
  url: string | null | undefined,
  folder: string,
  storageOrigin: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): boolean {
  if (!url || !storageOrigin) return false;
  try {
    const parsed = new URL(url);
    if (parsed.origin !== new URL(storageOrigin).origin) return false;
    if (!parsed.pathname.startsWith(`${PUBLIC_MEDIA_PATH}${folder}`)) return false;
    // No climbing out of the folder ("…/applicants/a/../../x").
    return !decodeURIComponent(parsed.pathname).split("/").includes("..");
  } catch {
    return false;
  }
}
