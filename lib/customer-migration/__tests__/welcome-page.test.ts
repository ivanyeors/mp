import { describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import { loadWelcomePage, type WelcomeDeps } from "@/lib/customer-migration/welcome-page";

/**
 * What the welcome page loads (migration slice 06). The first sign-in through
 * the page shows the voucher on that same page load, because the Claim runs
 * inside `linkCustomerToAuthUser`, which is awaited before the voucher is
 * read. A signed-out visit counts a click; the signed-in return trip does not.
 */

const TOKEN = "A".repeat(43);
const user = (email: string) => ({ id: `auth-${email}`, email }) as User;

/** A database where the voucher exists only once the Claim has run. */
function world({ signedInAs = null as string | null } = {}) {
  const events: string[] = [];
  let claimed = false;
  const deps: WelcomeDeps = {
    getUser: async () => (signedInAs ? user(signedInAs) : null),
    linkCustomer: async (u) => {
      events.push("link");
      await new Promise((r) => setTimeout(r, 5));
      // linkCustomerToAuthUser adopts the row by email, then claims.
      if (u.email === "jane@x.test") claimed = true;
      events.push("claimed");
      return u.email === "jane@x.test"
        ? { id: "c-jane", email: "jane@x.test", first_name: "Jane" }
        : { id: "c-sam", email: u.email!, first_name: "Sam" };
    },
    openLink: vi.fn(async (token: string | null) => {
      events.push("open");
      return token === TOKEN ? { customerId: "c-jane", firstName: "Jane", email: "jane@x.test" } : null;
    }),
    readBonus: vi.fn(async (customerId: string) => {
      events.push("bonus");
      return customerId === "c-jane" && claimed ? { kind: "granted" as const, points: 1000 } : null;
    }),
    hasAddress: async () => true,
  };
  return { deps, events };
}

describe("loadWelcomePage", () => {
  it("shows the Claim bonus on the first sign-in's own page load", async () => {
    const { deps, events } = world({ signedInAs: "jane@x.test" });
    const data = await loadWelcomePage({ token: TOKEN }, deps);
    expect(data.state).toEqual({ kind: "signed_in" });
    expect(data.account).toMatchObject({ firstName: "Jane", email: "jane@x.test", hasAddress: true });
    expect(data.account?.bonus).toEqual({ kind: "granted", points: 1000 });
    // The bonus is read only after the link (and its Claim) finished.
    expect(events.indexOf("bonus")).toBeGreaterThan(events.indexOf("claimed"));
  });

  it("counts a signed-out visit's click, and a signed-in visit's only as a first click", async () => {
    const out = world();
    await loadWelcomePage({ token: TOKEN }, out.deps);
    expect(out.deps.openLink).toHaveBeenCalledWith(TOKEN, { count: true });

    const back = world({ signedInAs: "jane@x.test" });
    await loadWelcomePage({ token: TOKEN }, back.deps);
    expect(back.deps.openLink).toHaveBeenCalledWith(TOKEN, { count: false });
  });

  it("signed out: never reads a bonus, and never looks up a missing token", async () => {
    const { deps } = world();
    const data = await loadWelcomePage({ token: null }, deps);
    expect(data).toEqual({
      state: { kind: "signed_out", firstName: null, prefillEmail: "", returnToken: null },
      account: null,
    });
    expect(deps.openLink).not.toHaveBeenCalled();
    expect(deps.readBonus).not.toHaveBeenCalled();
  });

  it("an invalid token loads exactly what no token loads", async () => {
    expect(await loadWelcomePage({ token: "B".repeat(43) }, world().deps)).toEqual(
      await loadWelcomePage({ token: null }, world().deps),
    );
  });

  it("signed in as someone else: the wrong-account state, and no bonus of anyone's", async () => {
    const { deps } = world({ signedInAs: "sam@x.test" });
    const data = await loadWelcomePage({ token: TOKEN }, deps);
    expect(data).toEqual({
      state: { kind: "wrong_account", signedInEmail: "sam@x.test", returnToken: TOKEN },
      account: null,
    });
    expect(deps.readBonus).not.toHaveBeenCalled();
  });

  it("shows no card when the bonus cannot be read", async () => {
    const { deps } = world({ signedInAs: "jane@x.test" });
    deps.readBonus = async () => {
      throw new Error("down");
    };
    expect((await loadWelcomePage({ token: null }, deps)).account?.bonus).toBeNull();
  });
});
