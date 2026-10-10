import { createHash, randomInt } from "node:crypto";

/**
 * One-time codes that bind a Telegram account to a `telegram_operators` row.
 * An admin creates the code in Users & permissions → Telegram; the person
 * sends `/link CODE` to the bot. Server-only (node:crypto) — the settings UI
 * imports lib/telegram/roles.ts, never this file.
 */

/**
 * No 0/O, 1/I/L: the code is read off one screen and typed on another.
 * 8 characters from 31 symbols is ~8.5e11 combinations for a single-use code
 * that expires — guessing one through Telegram is not a realistic attack.
 */
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

/** Case- and space-insensitive, so "k7q2 mx9p" redeems "K7Q2MX9P". */
export function normalizeLinkCode(raw: string): string {
  return raw.replace(/[\s-]+/g, "").toUpperCase();
}

/** Only the hash is stored; the code itself is shown to the admin once. */
export function hashLinkCode(code: string): string {
  return createHash("sha256").update(normalizeLinkCode(code)).digest("hex");
}

export function linkCodeExpiry(now = new Date()): Date {
  return new Date(now.getTime() + LINK_CODE_TTL_HOURS * 60 * 60 * 1000);
}
