import { getGoogleAccessToken } from "./google-auth";

/**
 * Diagnostics for the admin@mpillow.com Google OAuth grant used by appointments:
 * which scopes the refresh token carries and whether Calendar + People calls
 * actually succeed. Surfaced at /api/settings/appointments/google-status so ops
 * can confirm a re-consent from the browser without handling secrets.
 */

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
export const CONTACTS_SCOPE = "https://www.googleapis.com/auth/contacts";

export type ScopeSummary = {
  scopes: string[];
  hasCalendar: boolean;
  hasContacts: boolean;
};

/** Parse Google's space-separated `scope` string from tokeninfo. */
export function interpretScopes(scope: string | null | undefined): ScopeSummary {
  const scopes = (scope ?? "").split(/\s+/).filter(Boolean);
  return {
    scopes,
    hasCalendar: scopes.includes(CALENDAR_SCOPE),
    hasContacts: scopes.includes(CONTACTS_SCOPE),
  };
}

export type ApiProbe = { ok: boolean; status: number | null; error: string | null };

/** Prefer Google's own error message; keep the raw body short otherwise. */
export function googleErrorMessage(body: string): string {
  try {
    const json = JSON.parse(body) as { error?: { message?: string } | string };
    if (typeof json.error === "string") return json.error;
    if (json.error?.message) return json.error.message;
  } catch {
    /* raw */
  }
  return body.slice(0, 300);
}

export type GoogleStatus = {
  ok: boolean;
  /** Account the grant belongs to (id of the primary calendar), when Calendar works. */
  account: string | null;
  scopes: ScopeSummary;
  calendar: ApiProbe;
  contacts: ApiProbe;
  /** Plain-language fix for the first problem found, null when everything passes. */
  nextStep: string | null;
};

async function probe(url: string, token: string): Promise<{ probe: ApiProbe; body: string }> {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const body = await res.text();
    return {
      probe: { ok: res.ok, status: res.status, error: res.ok ? null : googleErrorMessage(body) },
      body,
    };
  } catch (e) {
    return {
      probe: { ok: false, status: null, error: e instanceof Error ? e.message : "fetch failed" },
      body: "",
    };
  }
}

export function nextStepFor(status: Omit<GoogleStatus, "ok" | "nextStep">): string | null {
  if (!status.scopes.hasContacts) {
    return (
      "The refresh token was consented without the contacts scope. Re-consent as admin@mpillow.com " +
      `in the OAuth Playground with both ${CALENDAR_SCOPE} and ${CONTACTS_SCOPE}, paste the new ` +
      "refresh_token into GOOGLE_OAUTH_REFRESH_TOKEN on Vercel (Production), and redeploy."
    );
  }
  if (!status.contacts.ok) {
    if (/has not been used|is disabled/i.test(status.contacts.error ?? "")) {
      return "People API is disabled on the OAuth client's Google Cloud project. Enable people.googleapis.com there and retry in a minute.";
    }
    return `People API call failed: ${status.contacts.error ?? "unknown error"}`;
  }
  if (!status.scopes.hasCalendar || !status.calendar.ok) {
    return `Calendar API call failed: ${status.calendar.error ?? "missing calendar scope"}`;
  }
  return null;
}

export async function checkGoogleStatus(): Promise<GoogleStatus> {
  let token: string;
  try {
    token = await getGoogleAccessToken();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "token refresh failed";
    const failed: ApiProbe = { ok: false, status: null, error: msg };
    return {
      ok: false,
      account: null,
      scopes: interpretScopes(""),
      calendar: failed,
      contacts: failed,
      nextStep: /invalid_grant|invalid_rapt/i.test(msg)
        ? "The refresh token is expired or revoked. Re-consent as admin@mpillow.com (calendar + contacts) and update GOOGLE_OAUTH_REFRESH_TOKEN on Vercel."
        : `Could not refresh the Google access token: ${msg}`,
    };
  }

  const info = await probe(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`,
    token,
  );
  let scopeString = "";
  try {
    scopeString = (JSON.parse(info.body) as { scope?: string }).scope ?? "";
  } catch {
    /* tokeninfo failed — scopes stay empty */
  }
  const scopes = interpretScopes(scopeString);

  const cal = await probe("https://www.googleapis.com/calendar/v3/calendars/primary", token);
  let account: string | null = null;
  try {
    account = (JSON.parse(cal.body) as { id?: string }).id ?? null;
  } catch {
    /* no calendar body */
  }

  const people = await probe(
    "https://people.googleapis.com/v1/people:searchContacts?query=&readMask=names",
    token,
  );

  const partial = { account, scopes, calendar: cal.probe, contacts: people.probe };
  const nextStep = nextStepFor(partial);
  return { ok: nextStep === null, ...partial, nextStep };
}
