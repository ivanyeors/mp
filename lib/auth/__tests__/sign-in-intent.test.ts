import { describe, expect, it } from "vitest";
import {
  audienceForPath,
  consentToRecord,
  destinationAfterSignIn,
  readEmailLink,
  readSignInIntent,
  signInCallbackUrl,
  signInErrorPath,
  signInTabFor,
  signUpNotice,
  type SignInIntent,
} from "../sign-in-intent";

/** Who is signing in, and what happens after (PRD-campaign-audiences slice 03). */

const SITE = "https://custom.mpillow.com";
const intent = (over: Partial<SignInIntent>): SignInIntent => ({
  audience: "customer",
  next: "/en-US/account",
  consent: null,
  locale: "en-US",
  ...over,
});

describe("the tab and the audience", () => {
  it("opens on Customer, on Staff for the Admin Panel, and as asked", () => {
    expect(signInTabFor({})).toBe("customer");
    expect(signInTabFor({ next: "/en-US/shop" })).toBe("customer");
    expect(signInTabFor({ next: "/en-US/settings/orders" })).toBe("staff");
    expect(signInTabFor({ next: "/en-US/settings", as: "customer" })).toBe("customer");
    expect(signInTabFor({ as: "staff" })).toBe("staff");
    expect(signInTabFor({ as: "partner", next: "/en-US/shop" })).toBe("customer");
  });

  it("reads who a destination is for", () => {
    expect(audienceForPath("/zh-CN/settings")).toBe("staff");
    expect(audienceForPath("/en-US/settings-like")).toBe("customer");
    expect(audienceForPath("/en-US/partner/apply")).toBe("partner");
    expect(audienceForPath("/partner?x=1")).toBe("partner");
    expect(audienceForPath(null)).toBe("customer");
  });
});

describe("the intent a link brings back", () => {
  it("round-trips through the return address", () => {
    const sent = intent({ next: "/zh-CN/shop/pillow", consent: "sign_in", locale: "zh-CN" });
    const url = new URL(signInCallbackUrl(`${SITE}/`, sent));
    expect(url.origin + url.pathname).toBe(`${SITE}/auth/callback`);
    expect(readSignInIntent(url.searchParams)).toEqual(sent);
  });

  it("falls back safely: audience from the destination, same-site only, consent for customers only", () => {
    expect(readSignInIntent(new URLSearchParams())).toEqual(intent({}));
    expect(readSignInIntent(new URLSearchParams({ next: "https://evil.example" }))).toEqual(intent({}));
    expect(readSignInIntent(new URLSearchParams({ next: "/zh-CN/settings", consent: "sign_in" }))).toEqual({
      audience: "staff",
      next: "/zh-CN/settings",
      consent: null,
      locale: "zh-CN",
    });
    expect(readSignInIntent({ as: "customer", consent: "everything" }).consent).toBeNull();
    expect(readSignInIntent({ as: "staff", next: "//evil.example" }).next).toBe("/en-US/settings");
  });

  it("leaves no consent off the address when there is none", () => {
    expect(signInCallbackUrl(SITE, intent({}))).not.toContain("consent");
    expect(signInCallbackUrl(SITE, intent({ audience: "staff", consent: "sign_in" }))).not.toContain("consent");
  });
});

describe("where a sign-in goes", () => {
  it("takes Staff into the Admin Panel, and everyone else anywhere but", () => {
    expect(destinationAfterSignIn(intent({ audience: "staff", next: "/en-US/settings/orders" }))).toBe("/en-US/settings/orders");
    expect(destinationAfterSignIn(intent({ audience: "staff", next: "/en-US/account" }))).toBe("/en-US/settings");
    expect(destinationAfterSignIn(intent({ next: "/en-US/settings/orders" }))).toBe("/en-US/account");
    expect(destinationAfterSignIn(intent({ next: "/zh-CN/shop", locale: "zh-CN" }))).toBe("/zh-CN/shop");
    expect(destinationAfterSignIn(intent({ audience: "partner", next: "/en-US/partner" }))).toBe("/en-US/partner");
  });

  it("sends a failure back to its own tab, with the same destination", () => {
    expect(signInErrorPath(intent({ audience: "staff", next: "/en-US/settings" }), "not_staff")).toBe(
      "/en-US/account/login?as=staff&error=not_staff&next=%2Fen-US%2Fsettings",
    );
    expect(signInErrorPath(intent({ audience: "partner", next: "/zh-CN/partner", locale: "zh-CN" }), "link_expired")).toBe(
      "/zh-CN/account/login?as=customer&error=link_expired&next=%2Fzh-CN%2Fpartner",
    );
  });
});

describe("consent", () => {
  it("records the box and the footer for a customer, and never for Staff's own tab", () => {
    expect(consentToRecord(intent({ consent: "sign_in" }), false)).toBe("sign_in");
    expect(consentToRecord(intent({ consent: "newsletter" }), false)).toBe("newsletter");
    expect(consentToRecord(intent({ consent: null }), false)).toBeNull();
    expect(consentToRecord(intent({ audience: "staff", consent: "sign_in" }), true)).toBeNull();
  });

  it("does not let a box left ticked out of habit put the team on the list; their own sign-up does", () => {
    expect(consentToRecord(intent({ consent: "sign_in" }), true)).toBeNull();
    expect(consentToRecord(intent({ consent: "newsletter" }), true)).toBe("newsletter");
  });

  it("tells them what it did", () => {
    expect(signUpNotice({ consent: "sign_in", before: "not_subscribed", changed: true })).toBe("subscribed");
    expect(signUpNotice({ consent: "newsletter", before: "not_subscribed", changed: true })).toBe("subscribed");
    expect(signUpNotice({ consent: "newsletter", before: "subscribed", changed: false })).toBe("already");
    expect(signUpNotice({ consent: "newsletter", before: "unsubscribed", changed: false })).toBe("come_back");
    // The box changed nothing: nothing to say.
    expect(signUpNotice({ consent: "sign_in", before: "unsubscribed", changed: false })).toBeNull();
    expect(signUpNotice({ consent: "sign_in", before: "subscribed", changed: false })).toBeNull();
    expect(signUpNotice({ consent: null, before: "not_subscribed", changed: false })).toBeNull();
  });
});

describe("the scanner-safe link", () => {
  const sent = intent({ next: "/zh-CN/shop", consent: "newsletter", locale: "zh-CN" });
  const redirectTo = signInCallbackUrl(SITE, sent);

  it("reads the intent when the template escapes RedirectTo", () => {
    const q = new URLSearchParams({ token_hash: "h1", type: "email", next: redirectTo });
    expect(readEmailLink(q, [SITE])).toEqual({ tokenHash: "h1", type: "email", intent: sent });
  });

  it("reads the same when it does not, and the query spills to the top", () => {
    const raw = `token_hash=h1&type=email&next=${redirectTo}`;
    expect(readEmailLink(new URLSearchParams(raw), [SITE])).toEqual({ tokenHash: "h1", type: "email", intent: sent });
  });

  it("ignores a return address on another site, and needs a token", () => {
    const q = new URLSearchParams({ token_hash: "h1", next: "https://evil.example/auth/callback?next=/en-US/shop&as=staff" });
    expect(readEmailLink(q, [SITE])?.intent).toEqual(intent({}));
    // Supabase falls back to the Site URL when RedirectTo is not allowed.
    expect(readEmailLink(new URLSearchParams({ token_hash: "h1", next: SITE }), [SITE])?.intent).toEqual(intent({}));
    expect(readEmailLink(new URLSearchParams({ type: "email" }), [SITE])).toBeNull();
    expect(readEmailLink(new URLSearchParams({ token_hash: "h1", type: "recovery" }), [SITE])).toBeNull();
  });

  it("takes a plain path as the destination", () => {
    const q = new URLSearchParams({ token_hash: "h1", next: "/en-US/results/abc", as: "customer" });
    expect(readEmailLink(q, [SITE])?.intent.next).toBe("/en-US/results/abc");
  });
});
