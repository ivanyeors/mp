import type { User } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { completeSignIn, type CompleteSignInDeps } from "../complete-sign-in";
import type { SignInIntent } from "../sign-in-intent";

/**
 * The one place a sign-in finishes (PRD-campaign-audiences slice 03): Staff
 * only into the Admin Panel, partners as before, customers made at once and
 * their consent recorded only now that the address is proven.
 */

const user = { id: "auth-1", email: "ann@example.com", email_confirmed_at: "2026-11-01T00:00:00Z" } as User;
const intent = (over: Partial<SignInIntent>): SignInIntent => ({
  audience: "customer",
  next: "/en-US/shop",
  consent: null,
  locale: "en-US",
  ...over,
});

function deps(over: Partial<CompleteSignInDeps> & { state?: string } = {}) {
  const calls = { signOut: 0, linked: [] as string[], subscribed: [] as string[] };
  const d: CompleteSignInDeps = {
    isStaff: async () => false,
    signOut: async () => {
      calls.signOut += 1;
    },
    linkCustomer: async (_u, locale) => {
      calls.linked.push(locale);
      return { id: "cust-1", marketing_email: over.state ?? "not_subscribed" };
    },
    subscribe: async (_id, source) => {
      calls.subscribed.push(source);
      return { ok: true, changed: (over.state ?? "not_subscribed") === "not_subscribed" };
    },
    ...over,
  };
  return { d, calls };
}

afterEach(() => vi.restoreAllMocks());

describe("the Staff tab", () => {
  it("opens the Admin Panel for the team, and never makes a Customer or records consent", async () => {
    const { d, calls } = deps({ isStaff: async () => true });
    const out = await completeSignIn(user, intent({ audience: "staff", next: "/en-US/settings/orders" }), d);
    expect(out).toEqual({ ok: true, destination: "/en-US/settings/orders", notice: null });
    expect(calls).toEqual({ signOut: 0, linked: [], subscribed: [] });
  });

  it("signs anyone else out again and says why, on the Staff tab", async () => {
    const { d, calls } = deps();
    const out = await completeSignIn(user, intent({ audience: "staff", next: "/en-US/settings" }), d);
    expect(out).toEqual({ ok: false, destination: "/en-US/account/login?as=staff&error=not_staff&next=%2Fen-US%2Fsettings" });
    expect(calls).toEqual({ signOut: 1, linked: [], subscribed: [] });
  });
});

describe("the Partner Hub", () => {
  it("goes straight on, as before", async () => {
    const { d, calls } = deps();
    const out = await completeSignIn(user, intent({ audience: "partner", next: "/en-US/partner" }), d);
    expect(out).toEqual({ ok: true, destination: "/en-US/partner", notice: null });
    expect(calls.linked).toEqual([]);
  });
});

describe("the Customer tab and the footer", () => {
  it("makes their Customer now, in the language they signed up in", async () => {
    const { d, calls } = deps();
    const out = await completeSignIn(user, intent({ next: "/zh-CN/shop", locale: "zh-CN" }), d);
    expect(out).toEqual({ ok: true, destination: "/zh-CN/shop", notice: null });
    expect(calls.linked).toEqual(["zh-CN"]);
    expect(calls.subscribed).toEqual([]);
  });

  it("records the box someone nobody has asked left ticked, and says so", async () => {
    const { d, calls } = deps();
    const out = await completeSignIn(user, intent({ consent: "sign_in" }), d);
    expect(calls.subscribed).toEqual(["sign_in"]);
    expect(out).toMatchObject({ ok: true, notice: "subscribed" });
  });

  it("offers someone who unsubscribed a way back after a footer sign-up, without re-subscribing them", async () => {
    const { d, calls } = deps({ state: "unsubscribed" });
    const out = await completeSignIn(user, intent({ consent: "newsletter" }), d);
    expect(calls.subscribed).toEqual(["newsletter"]);
    expect(out).toMatchObject({ ok: true, notice: "come_back" });
  });

  it("does not record the ticked box for a Staff login on the Customer tab, but does their footer sign-up", async () => {
    const box = deps({ isStaff: async () => true });
    await completeSignIn(user, intent({ consent: "sign_in" }), box.d);
    expect(box.calls).toMatchObject({ linked: ["en-US"], subscribed: [] });
    const footer = deps({ isStaff: async () => true });
    await completeSignIn(user, intent({ consent: "newsletter" }), footer.d);
    expect(footer.calls.subscribed).toEqual(["newsletter"]);
  });

  it("never stops the sign-in when the Customer or the consent fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken = deps({
      linkCustomer: async () => {
        throw new Error("This email belongs to another account");
      },
    });
    expect(await completeSignIn(user, intent({ consent: "sign_in" }), broken.d)).toEqual({
      ok: true,
      destination: "/en-US/shop",
      notice: null,
    });
    const refused = deps({ subscribe: async () => ({ ok: false, error: "Unknown consent source sign_in" }) });
    expect(await completeSignIn(user, intent({ consent: "sign_in" }), refused.d)).toMatchObject({ ok: true, notice: null });
    expect(console.error).toHaveBeenCalledWith("[sign-in] sign_in consent not recorded:", "Unknown consent source sign_in");
  });
});
