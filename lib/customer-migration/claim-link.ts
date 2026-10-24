/**
 * The Claim link (ADR 0029, decision 7; PRD-shopify-customer-migration slice 06).
 *
 * `/account/welcome?c=<token>` in a campaign email. The token prefills the
 * welcome page's sign-in form with its Customer's email and attributes the
 * click. It never signs anyone in: nothing here creates a session, and the
 * visitor still completes Google or the emailed code. Nothing here touches
 * `auth.users`.
 *
 * The token is 32 random bytes, base64url. Only its SHA-256 is stored
 * (`customer_claim_links`, 20261020121000), so a token cannot be read back and
 * reused: every email sent mints its own, with `mintClaimLink`, and the slice
 * 08 sender puts the plaintext only in that email.
 *
 * Every campaign link carries `utm_source=new_website&utm_medium=email&
 * utm_campaign=<template>`, so GA4 and **Entry source** see the channel. The
 * funnel itself is counted in the claim ledger, not in journey analytics.
 */
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sha256Hex } from "@/lib/customer-migration/preview";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { getSiteOrigin } from "@/lib/site-url";

/** Random bytes in a token: 256 bits. */
export const CLAIM_TOKEN_BYTES = 32;

/** The welcome page's path, before the locale. */
export const WELCOME_PATH = "/account/welcome";

/** The query parameter that carries the token. */
export const CLAIM_TOKEN_PARAM = "c";

/** `utm_source` on every campaign link. */
export const CAMPAIGN_UTM_SOURCE = "new_website";
export const CAMPAIGN_UTM_MEDIUM = "email";

// 32 bytes are 43 base64url characters, unpadded.
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

/** A fresh token. Its plaintext goes only into the one email that carries it. */
export function generateClaimToken(): string {
  return randomBytes(CLAIM_TOKEN_BYTES).toString("base64url");
}

/** Whether `value` could be a token at all. Anything else is never looked up. */
export function isClaimTokenShape(value: unknown): value is string {
  return typeof value === "string" && TOKEN_SHAPE.test(value);
}

/** What `customer_claim_links.token_hash` stores: SHA-256 of the token's UTF-8, hex. */
export function hashClaimToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  return sha256Hex(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
}

/** `url` with the campaign's UTM parameters for `template`. Existing parameters are kept. */
export function withCampaignUtm(url: string, template: string): string {
  const u = new URL(url);
  u.searchParams.set("utm_source", CAMPAIGN_UTM_SOURCE);
  u.searchParams.set("utm_medium", CAMPAIGN_UTM_MEDIUM);
  u.searchParams.set("utm_campaign", template);
  return u.toString();
}

/**
 * The welcome page for `token` (or none), localised. This is also where the
 * page's sign-in form returns to, so it carries no UTM: Entry source was
 * captured on the way in.
 */
export function welcomePath(locale: Locale, token: string | null): string {
  const path = withLocale(WELCOME_PATH, locale);
  return token ? `${path}?${CLAIM_TOKEN_PARAM}=${encodeURIComponent(token)}` : path;
}

/** The Claim link as it goes into a campaign email: absolute, with the UTMs. */
export function claimLinkUrl(
  token: string,
  template: string,
  { locale = DEFAULT_LOCALE, origin = getSiteOrigin() }: { locale?: Locale; origin?: string } = {},
): string {
  return withCampaignUtm(`${origin}${welcomePath(locale, token)}`, template);
}

/**
 * Mints one Claim link for one email: stores the hash (`mint_claim_link`;
 * every write from lib/customer-migration is a SQL function), returns the
 * plaintext token and the link for that email only. Throws when the row
 * cannot be written, so the sender does not send an email whose link would
 * not work.
 */
export async function mintClaimLink(
  admin: SupabaseClient,
  {
    customerId,
    template,
    locale,
    origin,
  }: { customerId: string; template: string; locale?: Locale; origin?: string },
): Promise<{ token: string; url: string }> {
  const token = generateClaimToken();
  const { error } = await admin.rpc("mint_claim_link", {
    p_customer_id: customerId,
    p_token_hash: await hashClaimToken(token),
    p_template: template,
  });
  if (error) throw new Error(`Could not mint a Claim link: ${error.message}`);
  return { token, url: claimLinkUrl(token, template, { locale, origin }) };
}

/** Whose link it is: what the welcome page may show and prefill. */
export interface ClaimLinkCustomer {
  customerId: string;
  firstName: string | null;
  email: string;
}

/** Pure — `open_claim_link`'s one row, or null for none. */
export function readClaimLinkRow(data: unknown): ClaimLinkCustomer | null {
  const row = (Array.isArray(data) ? data[0] : data) as
    | { customer_id?: unknown; first_name?: unknown; email?: unknown }
    | null
    | undefined;
  if (!row || typeof row.customer_id !== "string" || typeof row.email !== "string") return null;
  const firstName = typeof row.first_name === "string" && row.first_name.trim() ? row.first_name.trim() : null;
  return { customerId: row.customer_id, firstName, email: row.email };
}

/**
 * Opens a Claim link: records the click and returns whose link it is, or null
 * for a malformed or unknown token, or one whose Customer is gone. Never
 * throws, and a failed read is null too, so the welcome page cannot tell the
 * visitor which it was.
 *
 * `count: false` is a signed-in visit: it records the first click if there
 * was none, and otherwise changes nothing, so the return trip from signing in
 * (whose `next` is this same link) is not counted twice.
 */
export async function openClaimLink(
  admin: SupabaseClient,
  token: string | null | undefined,
  { count }: { count: boolean },
): Promise<ClaimLinkCustomer | null> {
  if (!isClaimTokenShape(token)) return null;
  try {
    const { data, error } = await admin.rpc("open_claim_link", {
      p_token_hash: await hashClaimToken(token),
      p_count: count,
    });
    if (error) {
      // Never log the token: it is a per-customer capability.
      console.error("[claim-link] open_claim_link failed:", error.message);
      return null;
    }
    return readClaimLinkRow(data);
  } catch (err) {
    console.error("[claim-link] open_claim_link threw:", err instanceof Error ? err.message : err);
    return null;
  }
}
