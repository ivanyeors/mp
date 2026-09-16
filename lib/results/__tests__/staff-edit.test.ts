/**
 * Staff re-configuration of a live Result.
 *
 * The rule for "may this build still be changed?" is one predicate, and the
 * damage from getting it wrong is silent: repricing a Result the customer is
 * already paying for moves the number under an open Stripe Checkout. These
 * tests pin the predicate and the route guards that have to keep the money
 * path and the edit path from crossing.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { staffEditableResult } from "../staff-edit";

const pillow = { product_type: "pillow", order_id: null };

describe("staffEditableResult", () => {
  it("allows the two open states", () => {
    expect(staffEditableResult({ ...pillow, status: "held" }).ok).toBe(true);
    expect(staffEditableResult({ ...pillow, status: "assigned" }).ok).toBe(true);
  });

  it("refuses a Result that is mid-payment or settled", () => {
    // `accepted` is the in-between state accept claims before money moves: a
    // reprice here would change the total under an open Checkout.
    for (const status of ["accepted", "captured", "declined", "expired", "cancelled"]) {
      expect(staffEditableResult({ ...pillow, status }).ok).toBe(false);
    }
  });

  it("refuses a Draft Result, which has not entered the money path yet", () => {
    expect(staffEditableResult({ ...pillow, status: null }).ok).toBe(false);
  });

  it("refuses once an Order exists, whatever the status says", () => {
    const verdict = staffEditableResult({
      ...pillow,
      status: "assigned",
      order_id: "ord_1",
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.reason).toMatch(/Order/);
  });

  it("refuses a bolster — it composes through its own schema, not this editor", () => {
    expect(
      staffEditableResult({ product_type: "bolster", order_id: null, status: "assigned" }).ok,
    ).toBe(false);
  });
});

describe("the reconfigure route", () => {
  const src = readFileSync("app/api/results/[id]/reconfigure/route.ts", "utf8");

  it("is Staff-only with the results permission", () => {
    expect(src).toMatch(/requireAdmin\("results"\)/);
  });

  it("shares the one editability rule rather than restating it", () => {
    expect(src).toMatch(/staffEditableResult\(row\)/);
  });

  it("prices the build before writing it", () => {
    expect(src.indexOf("loadAssignedBuild(")).toBeLessThan(
      src.indexOf('.update({ ...rewritten, final_amount:'),
    );
  });

  it("stores the recomputed final amount, so Accept cannot charge the old build", () => {
    expect(src).toMatch(/final_amount: build\.pricing\.total/);
  });

  it("never touches the Authorization hold — planCapture settles the delta", () => {
    expect(src).not.toMatch(/authorized_amount/);
    expect(src).not.toMatch(/payment_intent_id/);
  });

  it("guards the write on the state it read, so a concurrent Accept wins", () => {
    expect(src).toMatch(/\.eq\("status", row\.status\)/);
    expect(src).toMatch(/\.is\("order_id", null\)/);
  });

  it("leaves the stored filling snapshot alone when no placements are sent", () => {
    expect(src).toMatch(/if \(placementRows\.length > 0\)/);
  });
});

describe("the staff-edit loader", () => {
  const src = readFileSync("lib/results/staff-edit.ts", "utf8");

  it("is Staff-gated and narrowed to results, so a viewer cannot open the editor", () => {
    expect(src).toMatch(/getAdminContext\(\)/);
    expect(src).toMatch(/roleHasPermission\(staff\.role, "results"\)/);
  });

  it("returns null rather than throwing, so a bad link falls through to the configurator", () => {
    expect(src).toMatch(/if \(!staffEditableResult\(row\)\.ok\) return null;/);
  });
});

describe("request-payment", () => {
  const src = readFileSync("app/api/results/[id]/request-payment/route.ts", "utf8");

  it("persists the price it quotes, so the email and Accept agree", () => {
    expect(src).toMatch(/final_amount: build\.pricing\.total/);
    // The write lands before the send, so a failed reprice never mails a price
    // the Result does not carry.
    expect(src.indexOf("final_amount: build.pricing.total")).toBeLessThan(
      src.indexOf("getEmailTransport().send("),
    );
  });

  it("reprices only an assigned, order-less Result", () => {
    expect(src).toMatch(/\.eq\("status", "assigned"\)/);
    expect(src).toMatch(/\.is\("order_id", null\)/);
  });
});
