import { emailAddressOf } from "./campaign-transport";
import { getDefaultFromAddress } from "./transport";

// ============================================================
// Support inbox
// ============================================================
//
// Where customer replies and support mail go. The website chat's transcripts
// (lib/email/support-chat.ts) Cc it, with CONTACT_CC.

/**
 * The support inbox. Defaults to the configured from-address (i.e. your own
 * inbox) when SUPPORT_EMAIL is not set, so support mail is never silently
 * dropped.
 */
export function getSupportInbox(): string {
  return process.env.SUPPORT_EMAIL || getDefaultFromAddress();
}

/** A second staff inbox copied on every chat transcript. */
export const CONTACT_CC = "sg@mpillow.com";

/** Each address once, compared without case or display name; the first spelling wins. */
export function uniqueAddresses(list: string[]): string[] {
  const seen = new Set<string>();
  return list.filter((address) => {
    const key = emailAddressOf(address) ?? address.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
