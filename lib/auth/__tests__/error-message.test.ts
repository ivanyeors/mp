import { describe, expect, it } from "vitest";
import { authErrorMessage } from "../error-message";

describe("authErrorMessage", () => {
  it("replaces the stringified-empty-body message that a GoTrue 500 produces", () => {
    const text = authErrorMessage({ message: "{}", status: 500 });
    expect(text).not.toContain("{}");
    expect(text).toMatch(/went wrong/i);
  });

  it("hides GoTrue's internal wording on any 5xx", () => {
    const text = authErrorMessage({
      message: 'error finding user: sql: Scan error on column index 31, name "recovery_token"',
      status: 500,
    });
    expect(text).not.toMatch(/sql|recovery_token/i);
  });

  it("keeps real, actionable messages", () => {
    expect(
      authErrorMessage({ message: "Email rate limit exceeded", status: 429 }),
    ).toBe("Email rate limit exceeded");
    expect(
      authErrorMessage({ message: "Token has expired or is invalid", status: 403 }),
    ).toBe("Token has expired or is invalid");
  });

  it("replaces blank and serialised messages", () => {
    expect(authErrorMessage({ message: "", status: 400 })).toMatch(/went wrong/i);
    expect(authErrorMessage({ message: '{"a":1}', status: 400 })).toMatch(/went wrong/i);
    expect(authErrorMessage({ message: "[]", status: 400 })).toMatch(/went wrong/i);
  });

  it("falls back without a status (e.g. a network failure)", () => {
    expect(authErrorMessage({ message: null })).toMatch(/couldn't complete/i);
  });
});
