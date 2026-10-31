import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Subscribe imported customers (ADR 0037): both actions check
 * `customer-import`, re-read the list, call `subscribe_migrated_customers`
 * (the preview with nothing written, the run in one transaction), and the run
 * records one audit row with counts only, never an email.
 */

const h = vi.hoisted(() => ({
  denied: null as string | null,
  calls: [] as { name: string; args: Record<string, unknown> }[],
  answer: { data: null as unknown, error: null as { message: string } | null },
}));

vi.mock("@/lib/auth/admin", () => ({
  assertAdmin: vi.fn(async () => {
    if (h.denied) throw new Error(h.denied);
    return { userId: "u-1", email: "owner@example.com", memberId: "m-1" };
  }),
}));
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: vi.fn(async () => undefined) }));
vi.mock("@/lib/staff/working-as", () => ({ getWorkingAs: vi.fn(async () => null) }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    rpc: (name: string, args: Record<string, unknown>) => {
      h.calls.push({ name, args });
      return Promise.resolve(h.answer);
    },
  }),
}));

const { assertAdmin } = await import("@/lib/auth/admin");
const { recordAdminAction } = await import("@/lib/auth/audit");
const { previewDefaultConsent, subscribeImportedByDefault } = await import("../actions");

const COUNTS = {
  imported: 6,
  already_subscribed: 1,
  to_subscribe: 2,
  stay_unsubscribed: 1,
  listed: 1,
  listed_customers: 1,
  to_unsubscribe: 1,
};

beforeEach(() => {
  h.denied = null;
  h.calls = [];
  h.answer = { data: COUNTS, error: null };
  vi.mocked(recordAdminAction).mockClear();
  vi.mocked(assertAdmin).mockClear();
});

describe("previewDefaultConsent", () => {
  it("counts, writing nothing, with the list as the server reads it", async () => {
    const res = await previewDefaultConsent([" Left@Example.com "]);
    expect(assertAdmin).toHaveBeenCalledWith("customer-import");
    expect(h.calls).toEqual([
      { name: "subscribe_migrated_customers", args: { p_unsubscribed: ["left@example.com"], p_apply: false } },
    ]);
    expect(res).toMatchObject({ ok: true, counts: { toSubscribe: 2, toUnsubscribe: 1 } });
    expect(recordAdminAction).not.toHaveBeenCalled();
  });

  it("refuses a list that is not one, and asks nothing", async () => {
    expect(await previewDefaultConsent(["not an email"])).toMatchObject({ ok: false });
    expect(h.calls).toEqual([]);
  });

  it("refuses without customer-import", async () => {
    h.denied = "Forbidden";
    await expect(previewDefaultConsent([])).rejects.toThrow("Forbidden");
    expect(h.calls).toEqual([]);
  });
});

describe("subscribeImportedByDefault", () => {
  it("runs once, and records counts only", async () => {
    h.answer = { data: { ...COUNTS, subscribed: 2, unsubscribed: 1 }, error: null };
    const res = await subscribeImportedByDefault(["left@example.com"]);
    expect(h.calls).toEqual([
      { name: "subscribe_migrated_customers", args: { p_unsubscribed: ["left@example.com"], p_apply: true } },
    ]);
    expect(res).toMatchObject({ ok: true, counts: { subscribed: 2, unsubscribed: 1 } });
    expect(recordAdminAction).toHaveBeenCalledTimes(1);
    const audit = vi.mocked(recordAdminAction).mock.calls[0][0];
    expect(audit).toMatchObject({
      action: "customer_consent.import_default",
      after: { subscribed: 2, unsubscribed: 1, imported: 6, listed: 1 },
    });
    expect(JSON.stringify(audit)).not.toContain("left@example.com");
  });

  it("says so when the database refuses, and records nothing", async () => {
    h.answer = { data: null, error: { message: "boom" } };
    expect(await subscribeImportedByDefault([])).toEqual({
      ok: false,
      error: "Could not subscribe the imported customers: boom",
    });
    expect(recordAdminAction).not.toHaveBeenCalled();
  });
});
