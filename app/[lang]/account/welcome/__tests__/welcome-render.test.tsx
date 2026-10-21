import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { selectWelcomeState, type WelcomeInput } from "@/lib/customer-migration/welcome";
import type { WelcomePageData } from "@/lib/customer-migration/welcome-page";

/**
 * The welcome page a Claim link opens (migration slice 06), rendered for each
 * state. An invalid token renders byte for byte what no token renders; the
 * wrong-account screen shows the switch and nothing of the token's Customer;
 * and nothing on the page can create a session.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/en-US/account/welcome",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const { WelcomeView } = await import("../welcome-view");

const TOKEN = "A".repeat(43);
const jane = { customerId: "c-jane", firstName: "Jane", email: "jane@x.test" };

const page = (input: Partial<WelcomeInput>, account: WelcomePageData["account"] = null) =>
  renderToString(
    <WelcomeView
      locale="en-US"
      data={{
        state: selectWelcomeState({ session: null, token: null, tokenCustomer: null, ...input }),
        account,
      }}
    />,
  );

describe("signed out", () => {
  it("greets the token's Customer by name with their email prefilled, and offers Google beside the code", () => {
    const html = page({ token: TOKEN, tokenCustomer: jane });
    expect(html).toContain("Welcome back, Jane.");
    expect(html).toContain("Your Mpillow account is ready.");
    expect(html).toContain('value="jane@x.test"');
    expect(html).toContain("Continue with Google");
    expect(html).toContain("Email me a sign-in code");
  });

  it("renders an invalid token exactly as no token: no name, an empty form", () => {
    const none = page({});
    expect(page({ token: TOKEN, tokenCustomer: null })).toBe(none);
    expect(page({ token: "garbage", tokenCustomer: null })).toBe(none);
    expect(none).toContain("Welcome back.");
    expect(none).toContain('value=""');
    // The words a visitor reads, not attributes such as aria-invalid.
    expect(none.replace(/<[^>]*>/g, " ")).not.toMatch(/invalid|expired|not found|not valid/i);
  });
});

describe("signed in as another Customer", () => {
  const html = page({ session: { customerId: "c-sam", email: "sam@x.test" }, token: TOKEN, tokenCustomer: jane });

  it("says whose account this is and where the voucher went, with a switch that returns here", () => {
    expect(html).toContain("sam@x.test");
    expect(html).toContain("Your voucher was sent to the email you shopped with.");
    expect(html).toContain("Use another account");
    expect(html).toContain(
      `action="/auth/signout?next=${encodeURIComponent(`/en-US/account/welcome?c=${TOKEN}`)}"`,
    );
    expect(html).toContain('method="post"');
  });

  it("leaks nothing of the token's Customer, and never sends to the Partner Hub reauth", () => {
    expect(html).not.toContain("Jane");
    expect(html).not.toContain("jane@x.test");
    expect(html).not.toContain("reauth");
  });
});

describe("signed in", () => {
  const account = {
    firstName: "Jane",
    email: "jane@x.test",
    hasAddress: true,
    voucher: { code: "WB-ABCDEFGHJK", worth: "$20.00 off", minimum: "$60.00", expiresOn: "20 December 2026" },
  };

  it("shows the voucher card: code, value, minimum, expiry, Copy and Shop now", () => {
    const html = page({ session: { customerId: "c-jane", email: "jane@x.test" } }, account);
    expect(html).toContain("WB-ABCDEFGHJK");
    expect(html).toContain("$20.00 off");
    expect(html).toContain("$60.00");
    expect(html).toContain("20 December 2026");
    expect(html).toContain("Copy");
    expect(html).toContain('href="/en-US/shop"');
    expect(html).toContain("Shop now");
  });

  it("says what the account does, the imported address first", () => {
    const html = page({ session: { customerId: "c-jane", email: "jane@x.test" } }, account);
    expect(html).toContain("Your delivery address is already saved.");
    for (const href of ["/en-US/account/addresses", "/en-US/account/orders", "/en-US/appointments?type=readjustment", "/en-US/results"]) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(html).toContain("Returns");
  });

  it("leaves the card out when there is no usable voucher", () => {
    const html = page({ session: { customerId: "c-jane", email: "jane@x.test" } }, { ...account, voucher: null });
    expect(html).not.toContain("welcome-back voucher");
    expect(html).toContain("What your account does");
  });
});

describe("a Claim link never creates a session", () => {
  // Proof of the email is always the Sign in itself (ADR 0028, decision 7).
  const files = [
    "app/[lang]/account/welcome/page.tsx",
    "app/[lang]/account/welcome/welcome-view.tsx",
    "lib/customer-migration/claim-link.ts",
    "lib/customer-migration/welcome.ts",
    "lib/customer-migration/welcome-page.ts",
  ];

  it.each(files)("%s calls nothing that signs in or makes a login", (file) => {
    const src = readFileSync(join(process.cwd(), file), "utf8");
    for (const banned of [
      "auth.admin",
      "signInWith",
      "verifyOtp",
      "setSession",
      "exchangeCodeForSession",
      "generateLink",
      "inviteUserByEmail",
      "createUser",
      "cookies(",
    ]) {
      expect(src, `${file} mentions ${banned}`).not.toContain(banned);
    }
  });
});
