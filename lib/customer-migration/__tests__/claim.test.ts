import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CLAIM_BONUS_EMAIL,
  claimMigratedCustomer,
  claimOnSignIn,
  readClaimRow,
  sendClaimBonusEmail,
} from "../claim";
import { CUSTOMER_EMAIL_MAX_ATTEMPTS } from "@/lib/email/customer-emails";
import { EMAIL_REGISTRY } from "@/lib/email/registry";
import type { EmailTransport, OutgoingEmail } from "@/lib/email/types";

/**
 * The Claim as sign-in runs it (PRD-shopify-customer-migration slice 05), with
 * the Claim bonus (PRD-loyalty-points slice 05). The SQL itself (one
 * claimed_at and one bonus under a race, the window, earlier claimers,
 * partners, no write for a non-migrated Customer) is asserted against real
 * Postgres in supabase/tests/customer-migration/assert-05-claim.sql.
 */

const CUSTOMER = { id: "cust-1", email: "wei.ling@example.com", first_name: "Wei Ling", locale: "en-US" };

const BONUS = { points: 100 };

type RpcResult = { data: unknown; error: { message: string } | null };

/**
 * rpc answers per function name; `from` serves the bonus read and records
 * every table touched, so a test can assert nothing else was read or written.
 */
function fakeAdmin(rpc: Record<string, RpcResult | (() => never)>, bonus: unknown = BONUS) {
  const rpcCalls: Array<[string, Record<string, unknown>]> = [];
  const tables: string[] = [];
  const updates: Record<string, unknown>[] = [];
  const admin = {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push([fn, args]);
      const r = rpc[fn];
      if (typeof r === "function") return r();
      return r ?? { data: null, error: { message: `no rpc ${fn}` } };
    }),
    from(table: string) {
      tables.push(table);
      const b = {
        select: () => b,
        eq: () => b,
        update: (patch: Record<string, unknown>) => (updates.push(patch), b),
        maybeSingle: async () => ({ data: table === "points_ledger" ? bonus : null, error: null }),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }),
      };
      return b;
    },
  } as unknown as SupabaseClient;
  return { admin, rpcCalls, tables, updates };
}

function transport(): EmailTransport & { sent: OutgoingEmail[] } {
  const sent: OutgoingEmail[] = [];
  return { name: "fake", sent, send: async (e) => (sent.push(e), { id: "msg-1" }) };
}

const row = (claimed: boolean, bonus_granted: boolean, bonus_email_due: boolean) => ({
  data: [{ claimed, bonus_granted, bonus_email_due }],
  error: null,
});

describe("readClaimRow", () => {
  it("reads the RPC's one row", () => {
    expect(readClaimRow([{ claimed: true, bonus_granted: true, bonus_email_due: true }])).toEqual({
      claimed: true,
      bonusGranted: true,
      bonusEmailDue: true,
    });
  });

  it.each([[null], [[]], [undefined], [[{}]]])("reads %j as nothing", (data) => {
    expect(readClaimRow(data)).toEqual({ claimed: false, bonusGranted: false, bonusEmailDue: false });
  });
});

describe("claimMigratedCustomer", () => {
  it("calls claim_migrated_customer with the Customer", async () => {
    const { admin, rpcCalls } = fakeAdmin({ claim_migrated_customer: row(true, true, true) });
    expect(await claimMigratedCustomer("cust-1", admin)).toEqual({
      claimed: true,
      bonusGranted: true,
      bonusEmailDue: true,
    });
    expect(rpcCalls).toEqual([["claim_migrated_customer", { p_customer_id: "cust-1" }]]);
  });

  it("never throws: an RPC error or a thrown client reads as nothing claimed", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failed = fakeAdmin({ claim_migrated_customer: { data: null, error: { message: "down" } } });
    expect((await claimMigratedCustomer("cust-1", failed.admin)).claimed).toBe(false);
    const threw = fakeAdmin({
      claim_migrated_customer: () => {
        throw new Error("network");
      },
    });
    expect((await claimMigratedCustomer("cust-1", threw.admin)).claimed).toBe(false);
    spy.mockRestore();
  });
});

describe("claimOnSignIn", () => {
  it("a Customer who is not migrated: one RPC, no email, no table touched", async () => {
    const { admin, rpcCalls, tables } = fakeAdmin({ claim_migrated_customer: row(false, false, false) });
    const defer = vi.fn();
    const outcome = await claimOnSignIn(CUSTOMER, { admin, defer });
    expect(outcome.bonusGranted).toBe(false);
    expect(rpcCalls.map(([fn]) => fn)).toEqual(["claim_migrated_customer"]);
    expect(defer).not.toHaveBeenCalled();
    expect(tables).toEqual([]);
  });

  it("claimed outside the window: claimed, no bonus, no email", async () => {
    const { admin, tables } = fakeAdmin({ claim_migrated_customer: row(true, false, false) });
    const defer = vi.fn();
    expect(await claimOnSignIn(CUSTOMER, { admin, defer })).toEqual({
      claimed: true,
      bonusGranted: false,
      bonusEmailDue: false,
    });
    expect(defer).not.toHaveBeenCalled();
    expect(tables).toEqual([]);
  });

  it("the Claim that grants the bonus defers its email, then sends it once", async () => {
    const { admin, rpcCalls } = fakeAdmin({
      claim_migrated_customer: row(true, true, true),
      claim_customer_email: { data: [{ id: 9, attempts: 1 }], error: null },
    });
    let deferred: (() => Promise<unknown>) | null = null;
    const outcome = await claimOnSignIn(CUSTOMER, { admin, defer: (task) => (deferred = task) });
    expect(outcome.bonusGranted).toBe(true);
    // Nothing is sent before the response.
    expect(rpcCalls.map(([fn]) => fn)).toEqual(["claim_migrated_customer"]);
    expect(deferred).not.toBeNull();
    await deferred!();
    expect(rpcCalls[1]).toEqual([
      "claim_customer_email",
      { p_customer_id: "cust-1", p_template: CLAIM_BONUS_EMAIL, p_entity_id: "cust-1" },
    ]);
  });
});

describe("sendClaimBonusEmail", () => {
  it("sends the bonus to the account email through the ledger, in points and dollars, with no word of Shopify", async () => {
    const { admin, updates } = fakeAdmin({ claim_customer_email: { data: [{ id: 9, attempts: 1 }], error: null } });
    const t = transport();
    expect(await sendClaimBonusEmail(CUSTOMER, { admin, transport: t, origin: "https://custom.mpillow.com" })).toMatchObject({ sent: true });
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0].to).toBe("wei.ling@example.com");
    expect(t.sent[0].subject).toBe("S$10 in points is in your Mpillow account");
    expect(t.sent[0].text).toContain("We've added 100 points to your account: S$10 off your next shop order.");
    expect(t.sent[0].text).toContain("https://custom.mpillow.com/en-US/shop");
    expect(t.sent[0].text).toContain("How points work: https://custom.mpillow.com/en-US/points");
    expect(`${t.sent[0].subject} ${t.sent[0].text}`).not.toMatch(/shopify|moved|voucher/i);
    expect(updates).toEqual([expect.objectContaining({ status: "sent" })]);
  });

  it("skips when another sign-in already sent it", async () => {
    const { admin } = fakeAdmin({ claim_customer_email: { data: [], error: null } });
    const t = transport();
    expect(await sendClaimBonusEmail(CUSTOMER, { admin, transport: t })).toEqual({ sent: false, skipped: true });
    expect(t.sent).toEqual([]);
  });

  it("skips when the Customer holds no bonus", async () => {
    const { admin, rpcCalls } = fakeAdmin({}, null);
    const t = transport();
    expect(await sendClaimBonusEmail(CUSTOMER, { admin, transport: t })).toEqual({ sent: false, skipped: true });
    expect(rpcCalls).toEqual([]);
  });
});

describe("the SQL and the code name the same email", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20261021150000_points_claim_bonus.sql"),
    "utf8",
  );
  const ledger = readFileSync(
    join(process.cwd(), "supabase/migrations/20261020112000_customer_emails.sql"),
    "utf8",
  );

  it("claim_migrated_customer checks the ledger for CLAIM_BONUS_EMAIL", () => {
    expect(sql).toContain(`e.template = '${CLAIM_BONUS_EMAIL}'`);
    expect(sql).toContain(`e.attempts >= ${CUSTOMER_EMAIL_MAX_ATTEMPTS}`);
    expect(ledger).toContain(`e.attempts < ${CUSTOMER_EMAIL_MAX_ATTEMPTS}`);
  });

  it("is a registered email", () => {
    expect(EMAIL_REGISTRY.map((c) => c.id)).toContain(CLAIM_BONUS_EMAIL);
  });
});
