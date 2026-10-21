import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CUSTOMER_EMAIL_MAX_ATTEMPTS,
  claimCustomerEmail,
  dispatchCustomerEmail,
  markCustomerEmailFailed,
  markCustomerEmailSent,
} from "../customer-emails";
import type { EmailTransport, OutgoingEmail } from "../types";

/**
 * The customer_emails ledger helpers. The claim's atomicity and retry rule live
 * in SQL (claim_customer_email) and are asserted against real Postgres in
 * supabase/tests/customer-migration/assert-05-claim.sql. These pin what the
 * helpers send to the database and how they read it back.
 */

type Rpc = { data: unknown; error: { message: string } | null };

function fakeAdmin(rpc: Rpc | (() => Rpc)) {
  const rpcCalls: Array<[string, Record<string, unknown>]> = [];
  const updates: Array<{ table: string; patch: Record<string, unknown>; eq: [string, unknown][] }> = [];
  const admin = {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push([fn, args]);
      return typeof rpc === "function" ? rpc() : rpc;
    }),
    from(table: string) {
      const write = { table, patch: {} as Record<string, unknown>, eq: [] as [string, unknown][] };
      const b = {
        update(patch: Record<string, unknown>) {
          write.patch = patch;
          updates.push(write);
          return b;
        },
        eq(col: string, val: unknown) {
          write.eq.push([col, val]);
          return b;
        },
        then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }),
      };
      return b;
    },
  } as unknown as SupabaseClient;
  return { admin, rpcCalls, updates };
}

const KEY = { customerId: "cust-1", template: "account.claim_bonus", entityId: "cust-1" };

function transport(send: (e: OutgoingEmail) => Promise<{ id?: string }>): EmailTransport & { sent: OutgoingEmail[] } {
  const sent: OutgoingEmail[] = [];
  return {
    name: "fake",
    sent,
    async send(e) {
      sent.push(e);
      return send(e);
    },
  };
}

const rendered = { subject: "Welcome back", html: "<!doctype html><html></html>", text: "Welcome back" };

describe("claimCustomerEmail", () => {
  it("claims a pending send through claim_customer_email", async () => {
    const { admin, rpcCalls } = fakeAdmin({ data: [{ id: "41", attempts: 1 }], error: null });
    expect(await claimCustomerEmail(admin, KEY)).toEqual({ claimed: true, id: 41, attempts: 1 });
    expect(rpcCalls).toEqual([
      [
        "claim_customer_email",
        { p_customer_id: "cust-1", p_template: "account.claim_bonus", p_entity_id: "cust-1" },
      ],
    ]);
  });

  it("reports the attempt a retry is on", async () => {
    const { admin } = fakeAdmin({ data: [{ id: 41, attempts: 2 }], error: null });
    expect(await claimCustomerEmail(admin, KEY)).toEqual({ claimed: true, id: 41, attempts: 2 });
  });

  it("is not claimed when the database returns no row (sent, in flight or out of attempts)", async () => {
    const { admin } = fakeAdmin({ data: [], error: null });
    expect(await claimCustomerEmail(admin, KEY)).toEqual({ claimed: false });
  });

  it("is not claimed, with the reason, when the claim itself fails", async () => {
    const { admin } = fakeAdmin({ data: null, error: { message: "boom" } });
    expect(await claimCustomerEmail(admin, KEY)).toEqual({ claimed: false, error: "boom" });
  });
});

describe("markCustomerEmailSent / markCustomerEmailFailed", () => {
  it("marks sent with a time and clears the error", async () => {
    const { admin, updates } = fakeAdmin({ data: null, error: null });
    await markCustomerEmailSent(admin, 41);
    expect(updates).toHaveLength(1);
    expect(updates[0].table).toBe("customer_emails");
    expect(updates[0].patch).toMatchObject({ status: "sent", last_error: null });
    expect(typeof updates[0].patch.sent_at).toBe("string");
    expect(updates[0].eq).toEqual([["id", 41]]);
  });

  it.each([
    [1, true],
    [2, true],
    [CUSTOMER_EMAIL_MAX_ATTEMPTS, false],
  ])("marks attempt %i failed; retryable: %s", async (attempts, retryable) => {
    const { admin, updates } = fakeAdmin({ data: null, error: null });
    expect(await markCustomerEmailFailed(admin, { id: 41, attempts }, "smtp down")).toEqual({ retryable });
    expect(updates[0].patch).toEqual({ status: "failed", last_error: "smtp down" });
    expect(updates[0].eq).toEqual([["id", 41]]);
  });
});

describe("dispatchCustomerEmail", () => {
  it("claims, sends, then marks sent", async () => {
    const { admin, updates } = fakeAdmin({ data: [{ id: 7, attempts: 1 }], error: null });
    const t = transport(async () => ({ id: "msg-1" }));
    const outcome = await dispatchCustomerEmail({
      admin,
      transport: t,
      key: KEY,
      to: "wei.ling@example.com",
      render: () => rendered,
    });
    expect(outcome).toEqual({ sent: true, transport: "fake", id: "msg-1" });
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]).toMatchObject({ to: "wei.ling@example.com", subject: "Welcome back" });
    expect(updates.map((u) => u.patch.status)).toEqual(["sent"]);
  });

  it("skips without rendering or sending when the send is not this caller's", async () => {
    const { admin, updates } = fakeAdmin({ data: [], error: null });
    const t = transport(async () => ({}));
    const render = vi.fn(() => rendered);
    const outcome = await dispatchCustomerEmail({ admin, transport: t, key: KEY, to: "x@example.com", render });
    expect(outcome).toEqual({ sent: false, skipped: true });
    expect(render).not.toHaveBeenCalled();
    expect(t.sent).toEqual([]);
    expect(updates).toEqual([]);
  });

  it("marks a failed send failed, never throwing, so a later claim retries it", async () => {
    const { admin, updates } = fakeAdmin({ data: [{ id: 7, attempts: 1 }], error: null });
    const t = transport(async () => {
      throw new Error("smtp down");
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const outcome = await dispatchCustomerEmail({ admin, transport: t, key: KEY, to: "x@example.com", render: () => rendered });
    spy.mockRestore();
    expect(outcome).toEqual({ sent: false, error: "smtp down" });
    expect(updates.map((u) => u.patch)).toEqual([{ status: "failed", last_error: "smtp down" }]);
  });

  it("sends nothing when the claim errors", async () => {
    const { admin } = fakeAdmin({ data: null, error: { message: "db down" } });
    const t = transport(async () => ({}));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const outcome = await dispatchCustomerEmail({ admin, transport: t, key: KEY, to: "x@example.com", render: () => rendered });
    spy.mockRestore();
    expect(outcome).toEqual({ sent: false, error: "db down" });
    expect(t.sent).toEqual([]);
  });
});
