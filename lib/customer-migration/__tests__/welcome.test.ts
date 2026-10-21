import { describe, expect, it } from "vitest";
import { selectWelcomeState, type WelcomeInput } from "@/lib/customer-migration/welcome";

/**
 * The welcome page's state selection (migration slice 06), as a pure function
 * over the five situations the slice names. An invalid token must select
 * exactly what no token selects, so the page cannot say which it was.
 */

const TOKEN = "A".repeat(43);
const jane = { customerId: "c-jane", firstName: "Jane", email: "jane@x.test" };

const state = (over: Partial<WelcomeInput>) =>
  selectWelcomeState({ session: null, token: null, tokenCustomer: null, ...over });

describe("selectWelcomeState", () => {
  it("1. signed out, token valid: greets by first name, prefills the email, returns to the token", () => {
    expect(state({ token: TOKEN, tokenCustomer: jane })).toEqual({
      kind: "signed_out",
      firstName: "Jane",
      prefillEmail: "jane@x.test",
      returnToken: TOKEN,
    });
  });

  it("2. signed out, no token: no name, an empty form", () => {
    expect(state({})).toEqual({ kind: "signed_out", firstName: null, prefillEmail: "", returnToken: null });
  });

  it.each([
    ["unknown, or for a deleted Customer", TOKEN],
    ["malformed", "not-a-token"],
    ["empty", ""],
  ])("3. signed out, token %s: identical to no token, field for field", (_label, token) => {
    // openClaimLink resolves every one of these to null.
    expect(state({ token, tokenCustomer: null })).toEqual(state({}));
  });

  it("a token whose Customer has no first name greets without one, still prefilled", () => {
    expect(state({ token: TOKEN, tokenCustomer: { ...jane, firstName: "  " } })).toMatchObject({
      firstName: null,
      prefillEmail: "jane@x.test",
    });
  });

  it("4. signed in as the token's Customer, or with no valid token: the signed-in page", () => {
    const session = { customerId: "c-jane", email: "jane@x.test" };
    expect(state({ session, token: TOKEN, tokenCustomer: jane })).toEqual({ kind: "signed_in" });
    expect(state({ session })).toEqual({ kind: "signed_in" });
    expect(state({ session, token: TOKEN, tokenCustomer: null })).toEqual({ kind: "signed_in" });
  });

  it("5. signed in as another Customer: the switch link, their own email, nothing of the token's Customer", () => {
    const s = state({ session: { customerId: "c-sam", email: "sam@x.test" }, token: TOKEN, tokenCustomer: jane });
    expect(s).toEqual({ kind: "wrong_account", signedInEmail: "sam@x.test", returnToken: TOKEN });
    expect(JSON.stringify(s)).not.toContain("Jane");
    expect(JSON.stringify(s)).not.toContain("jane@x.test");
  });

  it("compares Customers, not emails: a case-different login for the same row is the same Customer", () => {
    expect(
      state({ session: { customerId: "c-jane", email: "JANE@x.test" }, token: TOKEN, tokenCustomer: jane }),
    ).toEqual({ kind: "signed_in" });
  });
});
