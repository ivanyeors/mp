export function isAllowedLinkUrl(value: string): boolean {
  const url = value.trim();
  if (url.startsWith("/")) return !url.startsWith("//") && !url.startsWith("/\\");
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

export const MAX_TIKTOK_VIDEOS = 20;

export const TIKTOK_HOOK_MAX_CHARS = 120;
