process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { describe, expect, it } from "vitest";
import { renderAdminInviteEmail } from "../auth";

describe("renderAdminInviteEmail", () => {
  const email = renderAdminInviteEmail({
    inviterEmail: "sg@mpillow.com",
    invitedEmail: "jess@example.com",
    roleName: "Fulfilment",
    signInUrl: "https://custom.mpillow.com/en-US/account/login?next=%2Fen-US%2Fsettings",
  });

  it("names the inviter, the role and the address to sign in with", () => {
    expect(email.subject).toBe("You're invited to the Mpillow Admin Panel");
    for (const body of [email.text, email.html]) {
      expect(body).toContain("sg@mpillow.com");
      expect(body).toContain("Fulfilment");
      expect(body).toContain("jess@example.com");
    }
  });

  it("links to Sign in with the Admin Panel as the next page", () => {
    expect(email.html).toContain('href="https://custom.mpillow.com/en-US/account/login?next=%2Fen-US%2Fsettings"');
    expect(email.html).toContain("Sign in with jess@example.com");
    expect(email.text).toContain("https://custom.mpillow.com/en-US/account/login?next=%2Fen-US%2Fsettings");
  });

  it("escapes what it is given", () => {
    const hostile = renderAdminInviteEmail({
      inviterEmail: "<img src=x>",
      invitedEmail: "a@b.c",
      roleName: "<b>x</b>",
      signInUrl: "https://custom.mpillow.com/x",
    });
    expect(hostile.html).not.toContain("<img src=x>");
    expect(hostile.html).not.toContain("<b>x</b>");
  });
});
