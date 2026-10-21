/**
 * The review link (CRM slice 07): `/r/review?t=<token>`, our own redirect to
 * the Google review form, so a click is recorded before the visitor leaves.
 *
 * The token is random, carries no PII, and is shared by the email and the
 * WhatsApp button. Only its sha256 is stored (`customer_review_requests.
 * token_hash`), so the table alone cannot mint a working link.
 */

import { createHash, randomBytes } from "node:crypto";

/** The redirect's path, on whichever origin the message was sent from. */
export const REVIEW_LINK_PATH = "/r/review";

/** 16 random bytes, base64url: 22 characters. */
export function newReviewToken(): string {
  return randomBytes(16).toString("base64url");
}

export function hashReviewToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Whether a `t` value is shaped like a token at all. Anything else is never
 * hashed or looked up; it is sent on to Google like an unknown token.
 */
export function isWellFormedReviewToken(token: string | null | undefined): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(token);
}

export function reviewLinkUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}${REVIEW_LINK_PATH}?t=${encodeURIComponent(token)}`;
}
