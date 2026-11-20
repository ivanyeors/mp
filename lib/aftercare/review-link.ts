import { createHash, randomBytes } from "node:crypto";

export const REVIEW_LINK_PATH = "/r/review";

export function newReviewToken(): string {
  return randomBytes(16).toString("base64url");
}

export function hashReviewToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isWellFormedReviewToken(token: string | null | undefined): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(token);
}

export function reviewLinkUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}${REVIEW_LINK_PATH}?t=${encodeURIComponent(token)}`;
}
