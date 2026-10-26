import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

const h = vi.hoisted(() => ({ db: {} as FakeDb }));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return { supabaseAdmin: () => fakeSupabaseAdmin(h.db) };
});

const { isSelfReferral } = await import("@/lib/referrals");

beforeEach(() => {
  h.db = {
    partner_users: [
      { id: "pu-1", partner_id: "p1", email: "clinic@x.test", backup_email: "owner@gmail.test", backup_email_verified: true },
      { id: "pu-2", partner_id: "p2", email: "other@x.test", backup_email: "pending@x.test", backup_email_verified: false },
    ],
  };
});

describe("isSelfReferral", () => {
  it("is the signed-in partner's own code", async () => {
    expect(await isSelfReferral("p1", { sessionPartnerId: "p1", email: "someone@x.test" })).toBe(true);
  });

  it("is the partner's sign-in or verified backup email at checkout, whatever the case", async () => {
    expect(await isSelfReferral("p1", { email: "Clinic@X.test" })).toBe(true);
    expect(await isSelfReferral("p1", { email: "owner@gmail.test" })).toBe(true);
  });

  it("is not an unverified backup email, another partner, or a real customer", async () => {
    expect(await isSelfReferral("p2", { email: "pending@x.test" })).toBe(false);
    expect(await isSelfReferral("p2", { sessionPartnerId: "p1", email: "clinic@x.test" })).toBe(false);
    expect(await isSelfReferral("p1", { email: "customer@x.test" })).toBe(false);
  });
});
