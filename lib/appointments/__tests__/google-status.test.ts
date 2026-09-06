import { describe, expect, it } from "vitest";
import {
  CALENDAR_SCOPE,
  CONTACTS_SCOPE,
  googleErrorMessage,
  interpretScopes,
  nextStepFor,
} from "@/lib/appointments/google-status";

const okProbe = { ok: true, status: 200, error: null };

describe("interpretScopes", () => {
  it("detects calendar and contacts in a tokeninfo scope string", () => {
    const s = interpretScopes(`${CALENDAR_SCOPE} ${CONTACTS_SCOPE}`);
    expect(s.hasCalendar).toBe(true);
    expect(s.hasContacts).toBe(true);
    expect(s.scopes).toHaveLength(2);
  });
  it("flags a calendar-only grant", () => {
    const s = interpretScopes(CALENDAR_SCOPE);
    expect(s.hasCalendar).toBe(true);
    expect(s.hasContacts).toBe(false);
    expect(interpretScopes(undefined).scopes).toEqual([]);
  });
});

describe("googleErrorMessage", () => {
  it("unwraps Google's error envelope and falls back to raw text", () => {
    expect(googleErrorMessage(JSON.stringify({ error: { message: "nope" } }))).toBe("nope");
    expect(googleErrorMessage(JSON.stringify({ error: "invalid_grant" }))).toBe("invalid_grant");
    expect(googleErrorMessage("plain")).toBe("plain");
  });
});

describe("nextStepFor", () => {
  const base = { account: "admin@mpillow.com", calendar: okProbe, contacts: okProbe };

  it("points at re-consent when the contacts scope is missing", () => {
    const step = nextStepFor({ ...base, scopes: interpretScopes(CALENDAR_SCOPE) });
    expect(step).toMatch(/contacts scope/);
    expect(step).toMatch(/GOOGLE_OAUTH_REFRESH_TOKEN/);
  });

  it("points at enabling the People API when Google says it is unused", () => {
    const step = nextStepFor({
      ...base,
      scopes: interpretScopes(`${CALENDAR_SCOPE} ${CONTACTS_SCOPE}`),
      contacts: {
        ok: false,
        status: 403,
        error: "People API has not been used in project 123 before or it is disabled.",
      },
    });
    expect(step).toMatch(/People API is disabled/);
  });

  it("is null when scopes and both probes pass", () => {
    expect(
      nextStepFor({ ...base, scopes: interpretScopes(`${CALENDAR_SCOPE} ${CONTACTS_SCOPE}`) }),
    ).toBeNull();
  });
});
