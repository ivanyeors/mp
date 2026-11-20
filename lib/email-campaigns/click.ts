import type { SupabaseClient } from "@supabase/supabase-js";

export const UNSUBSCRIBE_PATHS = { route: "/api/email/unsubscribe", page: "/unsubscribe" } as const;

export const CLICK_PARAM = "mc";

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

export function isClickTokenShape(value: unknown): value is string {
  return typeof value === "string" && TOKEN_SHAPE.test(value);
}

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function newClickToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashClickToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isUnsubscribePath(pathname: string): boolean {
  const { route, page } = UNSUBSCRIBE_PATHS;
  if (pathname === route || pathname.startsWith(`${route}/`)) return true;
  return new RegExp(`^(/[A-Za-z]{2}-[A-Za-z]{2})?${page}/?$`).test(pathname);
}

export function withClickToken(url: string, token: string, origin: string): string {
  try {
    const u = new URL(url);
    if (u.host !== new URL(origin).host || isUnsubscribePath(u.pathname)) return url;
    u.searchParams.set(CLICK_PARAM, token);
    return u.toString();
  } catch {
    return url;
  }
}

const decodeAmp = (s: string) => s.replace(/&amp;/g, "&");
const encodeAmp = (s: string) => s.replace(/&/g, "&amp;");

export function addClickToken<E extends { html: string; text: string }>(email: E, token: string, origin: string): E {
  const html = email.html.replace(/href="(https?:\/\/[^"]+)"/g, (_m, href: string) => {
    const tokened = withClickToken(decodeAmp(href), token, origin);
    return `href="${encodeAmp(tokened)}"`;
  });
  const text = email.text.replace(/https?:\/\/[^\s<>"')\]]+/g, (href) => withClickToken(href, token, origin));
  return { ...email, html, text };
}

export function stripClickToken(url: URL): { token: string; cleanUrl: URL } | null {
  if (!url.searchParams.has(CLICK_PARAM)) return null;
  const token = url.searchParams.get(CLICK_PARAM) ?? "";
  const cleanUrl = new URL(url.toString());
  cleanUrl.searchParams.delete(CLICK_PARAM);
  return { token, cleanUrl };
}

export async function recordCampaignClick(admin: SupabaseClient, token: string, at: Date = new Date()): Promise<boolean> {
  if (!isClickTokenShape(token)) return false;
  try {
    const { data, error } = await admin.rpc("record_campaign_click", {
      p_token_hash: await hashClickToken(token),
      p_at: at.toISOString(),
    });
    if (error) {
      console.error("[campaign click] not recorded:", error.message);
      return false;
    }
    return data === true;
  } catch (e) {
    console.error("[campaign click] not recorded:", e instanceof Error ? e.message : e);
    return false;
  }
}
