const PUBLIC_MEDIA_PATH = "/storage/v1/object/public/media/";

export function partnerLogoFolder(partnerId: string): string {
  return `partner-logos/${partnerId}/`;
}

export function applicantLogoFolder(authUserId?: string): string {
  return authUserId ? `partner-logos/applicants/${authUserId}/` : "partner-logos/applicants/";
}

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
    return !decodeURIComponent(parsed.pathname).split("/").includes("..");
  } catch {
    return false;
  }
}
