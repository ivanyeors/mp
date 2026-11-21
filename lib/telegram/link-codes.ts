import { createHash, randomInt } from "node:crypto";

const LINK_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const LINK_CODE_LENGTH = 8;
export const LINK_CODE_TTL_HOURS = 72;

export function generateLinkCode(): string {
  let code = "";
  for (let i = 0; i < LINK_CODE_LENGTH; i += 1) {
    code += LINK_CODE_ALPHABET[randomInt(LINK_CODE_ALPHABET.length)];
  }
  return code;
}

export function normalizeLinkCode(raw: string): string {
  return raw.replace(/[\s-]+/g, "").toUpperCase();
}

export function hashLinkCode(code: string): string {
  return createHash("sha256").update(normalizeLinkCode(code)).digest("hex");
}

export function linkCodeExpiry(now = new Date()): Date {
  return new Date(now.getTime() + LINK_CODE_TTL_HOURS * 60 * 60 * 1000);
}
