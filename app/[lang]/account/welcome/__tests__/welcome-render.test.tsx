import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { selectWelcomeState, type WelcomeInput } from "@/lib/customer-migration/welcome";
import type { WelcomePageData } from "@/lib/customer-migration/welcome-page";

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
    expect(none.replace(/<[^>]*>/g, " ")).not.toMatch(/invalid|expired|not found|not valid/i);
  });
});

describe("signed in as another Customer", () => {
  const html = page({ session: { customerId: "c-sam", email: "sam@x.test" }, token: TOKEN, tokenCustomer: jane });

  it("says whose account this is and which email the link is for, with a switch that returns here", () => {
    expect(html).toContain("sam@x.test");
    expect(html).toContain("This link is for the account of the email you shopped with.");
    expect(html).not.toMatch(/voucher/i);
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
    bonus: { kind: "granted" as const, points: 1000 },
  };

  it("shows the Claim bonus: what was added, how to use it, and its two limits", () => {
    const html = page({ session: { customerId: "c-jane", email: "jane@x.test" } }, account);
    expect(html).toContain("S$10 in points is in your account");
    expect(html).toContain("We&#x27;ve added 1,000 points. Use them on any shop order, up to half the price.");
    expect(html).toContain('href="/en-US/shop"');
    expect(html).toContain("can&#x27;t be used on custom pillows, and points used are not refunded");
    expect(html).toContain('href="/en-US/points"');
    expect(html).not.toMatch(/voucher|shopify/i);
  });

  it("says plainly when the bonus window had closed, and promises nothing", () => {
    const html = page(
      { session: { customerId: "c-jane", email: "jane@x.test" } },
      { ...account, bonus: { kind: "closed", endedOn: "2027-01-21T04:00:00Z" } },
    );
    expect(html).toContain("The sign-in bonus for this account ended on 21 January 2027");
    expect(html).not.toContain("is in your account");
  });

  it("says what the account does, the imported address first", () => {
    const html = page({ session: { customerId: "c-jane", email: "jane@x.test" } }, account);
    expect(html).toContain("Your delivery address is already saved.");
    for (const href of ["/en-US/account/addresses", "/en-US/account/orders", "/en-US/appointments?type=readjustment", "/en-US/results"]) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(html).toContain("Returns");
  });

  it("leaves the card out when there is nothing true to say", () => {
    const html = page({ session: { customerId: "c-jane", email: "jane@x.test" } }, { ...account, bonus: null });
    expect(html).not.toContain("in points");
    expect(html).toContain("What your account does");
  });
});

describe("a Claim link never creates a session", () => {
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
