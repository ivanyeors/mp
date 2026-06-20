import { describe, it, expect } from "vitest";
import { decideCustomerLink } from "@/lib/auth/customer-identity";

const AUTH_ID = "auth-user-1";

describe("decideCustomerLink", () => {
  it("creates a fresh customer when no record matches by auth id or email", () => {
    expect(decideCustomerLink({ authUserId: AUTH_ID, byAuthId: null, byEmail: null })).toEqual({
      type: "create",
    });
  });

  it("links an existing guest customer matched by email", () => {
    expect(
      decideCustomerLink({
        authUserId: AUTH_ID,
        byAuthId: null,
        byEmail: { id: "cust-1", auth_user_id: null },
      }),
    ).toEqual({ type: "link_existing", customerId: "cust-1" });
  });

  it("is idempotent when the customer is already linked by auth id", () => {
    expect(
      decideCustomerLink({
        authUserId: AUTH_ID,
        byAuthId: { id: "cust-1", auth_user_id: AUTH_ID },
        byEmail: { id: "cust-1", auth_user_id: AUTH_ID },
      }),
    ).toEqual({ type: "already_linked" });
  });

  it("does not steal a customer already owned by a different auth user", () => {
    expect(
      decideCustomerLink({
        authUserId: AUTH_ID,
        byAuthId: null,
        byEmail: { id: "cust-1", auth_user_id: "someone-else" },
      }),
    ).toEqual({ type: "already_linked" });
  });
});
