import { emailAddressOf } from "./campaign-transport";
import { getDefaultFromAddress } from "./transport";

export function getSupportInbox(): string {
  return process.env.SUPPORT_EMAIL || getDefaultFromAddress();
}

export const CONTACT_CC = "sg@mpillow.com";

export function uniqueAddresses(list: string[]): string[] {
  const seen = new Set<string>();
  return list.filter((address) => {
    const key = emailAddressOf(address) ?? address.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
