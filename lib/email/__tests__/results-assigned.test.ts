/**
 * One renderer, two voices. The hold voice is load-bearing copy that predates
 * the Balance payment variant, so it is asserted word for word; the balance
 * voice must never mention a hold. The third test is the reason there is one
 * renderer and not two: everything except the ask is byte-identical.
 */

process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { describe, expect, it } from "vitest";
import {
  sampleResultAssigned,
  sampleResultAssignedBalance,
} from "../__fixtures__/samples";
import { renderResultAssignedEmail } from "../results";

const hold = renderResultAssignedEmail(sampleResultAssigned());
const balance = renderResultAssignedEmail(sampleResultAssignedBalance());

describe("renderResultAssignedEmail", () => {
  it("keeps the Authorization hold voice unchanged", () => {
    expect(hold.subject).toBe("Your final build is ready");
    expect(hold.text).toContain("Review and accept or decline:");
    expect(hold.html).toContain("Review your final build");
    expect(hold.html).toContain(
      "Accept or decline on the status page. Accept captures payment; Decline releases your hold.",
    );
    expect(hold.html).toContain("Authorized hold");
  });

  it("asks a customer with no hold to pay, and mentions no hold", () => {
    expect(balance.subject).toBe("Your final build is ready — payment due");
    expect(balance.text).toContain("Review and pay:");
    expect(balance.html).toContain("Review and pay");
    expect(balance.html).toContain("pay there to confirm your order");
    for (const body of [balance.subject, balance.text, balance.html]) {
      expect(body).not.toMatch(/hold/i);
      expect(body).not.toMatch(/decline/i);
    }
  });

  it("renders the same spec and pricing in both voices", () => {
    for (const line of [
      "Size",
      "Tier",
      "Fillings",
      "Preferences",
      "Add-ons",
      "6D Small",
      "Tencel Cover",
      "Travel Pouch",
      "Subtotal",
      "Shipping",
      "Tax",
      "Total",
    ]) {
      expect(hold.html, `hold is missing ${line}`).toContain(line);
      expect(balance.html, `balance is missing ${line}`).toContain(line);
    }
    // The only pricing row that differs is the one the hold pays for.
    expect(hold.text.split("\n").filter((l) => l.startsWith("Total: "))).toEqual(
      balance.text.split("\n").filter((l) => l.startsWith("Total: ")),
    );
  });

  it("links the tokenised status page and never a bare result URL", () => {
    const token = sampleResultAssigned().accessToken;
    for (const rendered of [hold, balance]) {
      expect(rendered.text).toContain(`token=${token}`);
      expect(rendered.html).toContain(`token=${token}`);
    }
  });
});
