import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MARKETING_BOX_LABEL } from "@/lib/marketing-consent/state";

vi.mock("@/lib/auth/sign-in-actions", () => ({ finishSignIn: vi.fn(), resubscribeMe: vi.fn() }));

const { SignInTabs } = await import("../sign-in-tabs");
const { LoginForm } = await import("../login-form");

/**
 * Sign in's two tabs as they render (PRD-campaign-audiences slice 03): the
 * Customer tab signs in or up with the box ticked; the Staff tab has no box.
 */

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, " ");

const base = {
  tabFixed: false,
  customer: { nextPath: "/en-US/account", initialEmail: "", initialSent: false },
  staff: { nextPath: "/en-US/settings", initialEmail: "" },
  error: null,
};

describe("SignInTabs", () => {
  it("opens on Customer: sign in or create an account, with the box ticked", () => {
    const html = renderToStaticMarkup(<SignInTabs {...base} initialTab="customer" />);
    const t = text(html);
    expect(t).toContain("Customer");
    expect(t).toContain("Staff");
    expect(t).toContain("Sign in or create an account");
    expect(t).toContain("Continue with Google");
    expect(t).toContain(MARKETING_BOX_LABEL);
    expect(html).toMatch(/role="checkbox"[^>]*aria-checked="true"/);
    expect(t).not.toContain("Staff sign in");
  });

  it("keeps the Staff tab to the Admin Panel: no box", () => {
    const t = text(renderToStaticMarkup(<SignInTabs {...base} initialTab="staff" />));
    expect(t).toContain("Staff sign in");
    expect(t).toContain("Use the email your invite was sent to");
    expect(t).not.toContain(MARKETING_BOX_LABEL);
  });

  it("shows why a sign-in came back, on its own tab only", () => {
    const error = { tab: "staff" as const, message: "That email isn't on the Mpillow team." };
    expect(text(renderToStaticMarkup(<SignInTabs {...base} initialTab="staff" error={error} />))).toContain(
      "That email isn't on the Mpillow team.",
    );
    expect(text(renderToStaticMarkup(<SignInTabs {...base} initialTab="customer" error={error} />))).not.toContain(
      "isn't on the Mpillow team",
    );
  });
});

describe("LoginForm", () => {
  it("has no box for the Partner Hub, nor where the footer already asked", () => {
    expect(text(renderToStaticMarkup(<LoginForm nextPath="/en-US/partner" />))).not.toContain(MARKETING_BOX_LABEL);
    expect(
      text(renderToStaticMarkup(<LoginForm nextPath="/en-US/shop" consent="newsletter" />)),
    ).not.toContain(MARKETING_BOX_LABEL);
    expect(text(renderToStaticMarkup(<LoginForm nextPath="/en-US/shop" />))).toContain(MARKETING_BOX_LABEL);
  });

  it("opens on the code step when the footer already sent the link", () => {
    const t = text(
      renderToStaticMarkup(
        <LoginForm nextPath="/en-US/blog" consent="newsletter" initialEmail="ann@example.com" initialSent />,
      ),
    );
    expect(t).toContain("We sent a sign-in link and a 6-digit code to ann@example.com");
    expect(t).toContain("to confirm your email and join our list.");
  });
});
