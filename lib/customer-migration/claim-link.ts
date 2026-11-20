import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sha256Hex } from "@/lib/customer-migration/preview";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { getSiteOrigin } from "@/lib/site-url";

export const CLAIM_TOKEN_BYTES = 32;

export const WELCOME_PATH = "/account/welcome";

export const CLAIM_TOKEN_PARAM = "c";

export const CAMPAIGN_UTM_SOURCE = "new_website";
export const CAMPAIGN_UTM_MEDIUM = "email";

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

export function generateClaimToken(): string {
  return randomBytes(CLAIM_TOKEN_BYTES).toString("base64url");
}

export function isClaimTokenShape(value: unknown): value is string {
  return typeof value === "string" && TOKEN_SHAPE.test(value);
}

export function hashClaimToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token);
  return sha256Hex(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
}

export function withCampaignUtm(url: string, template: string): string {
  const u = new URL(url);
  u.searchParams.set("utm_source", CAMPAIGN_UTM_SOURCE);
  u.searchParams.set("utm_medium", CAMPAIGN_UTM_MEDIUM);
  u.searchParams.set("utm_campaign", template);
  return u.toString();
}

export function welcomePath(locale: Locale, token: string | null): string {
  const path = withLocale(WELCOME_PATH, locale);
  return token ? `${path}?${CLAIM_TOKEN_PARAM}=${encodeURIComponent(token)}` : path;
}

export function claimLinkUrl(
  token: string,
  template: string,
  { locale = DEFAULT_LOCALE, origin = getSiteOrigin() }: { locale?: Locale; origin?: string } = {},
): string {
  return withCampaignUtm(`${origin}${welcomePath(locale, token)}`, template);
}

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

export interface ClaimLinkCustomer {
  customerId: string;
  firstName: string | null;
  email: string;
}

export function readClaimLinkRow(data: unknown): ClaimLinkCustomer | null {
  const row = (Array.isArray(data) ? data[0] : data) as
    | { customer_id?: unknown; first_name?: unknown; email?: unknown }
    | null
    | undefined;
  if (!row || typeof row.customer_id !== "string" || typeof row.email !== "string") return null;
  const firstName = typeof row.first_name === "string" && row.first_name.trim() ? row.first_name.trim() : null;
  return { customerId: row.customer_id, firstName, email: row.email };
}

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
      console.error("[claim-link] open_claim_link failed:", error.message);
      return null;
    }
    return readClaimLinkRow(data);
  } catch (err) {
    console.error("[claim-link] open_claim_link threw:", err instanceof Error ? err.message : err);
    return null;
  }
}
