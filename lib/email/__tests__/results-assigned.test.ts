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
  sampleResultAssignedFinish,
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

  it("asks an assisted customer to choose their finish, not to pay a total", () => {
    const finish = renderResultAssignedEmail(sampleResultAssignedFinish());
    expect(finish.subject).toBe("Your build is ready — choose your finish");
    expect(finish.text).toContain("Choose your cover, case and shipping:");
    expect(finish.html).toContain("Choose your finish");
    expect(finish.html).toContain("From (before shipping)");
    expect(finish.html).toContain("6D Small");
    for (const body of [finish.subject, finish.text, finish.html]) {
      expect(body).not.toMatch(/hold/i);
      expect(body).not.toMatch(/Total/);
    }
    // A hold always wins: needsFinish cannot turn a held Result's ask into "choose".
    const held = renderResultAssignedEmail({ ...sampleResultAssigned(), needsFinish: true });
    expect(held.subject).toBe("Your final build is ready");
  });

  it("links the tokenised status page and never a bare result URL", () => {
    const token = sampleResultAssigned().accessToken;
    for (const rendered of [hold, balance, renderResultAssignedEmail(sampleResultAssignedFinish())]) {
      expect(rendered.text).toContain(`token=${token}`);
      expect(rendered.html).toContain(`token=${token}`);
    }
  });
});

describe("renderResultAssignedEmail — Paired build (ADR 0026)", () => {
  it("names the other build and adds both into one total", () => {
    const base = sampleResultAssigned();
    const paired = renderResultAssignedEmail({
      ...base,
      paired: { label: "Mbolster medium", total: 60 },
    });
    const total = base.pricing!.total + 60;
    for (const body of [paired.text, paired.html]) {
      expect(body).toContain("Also in this order: Mbolster medium");
      expect(body).toContain("Total for both");
      expect(body).toContain(total.toFixed(2));
    }
  });

  it("is unchanged when there is no pair", () => {
    expect(renderResultAssignedEmail({ ...sampleResultAssigned(), paired: null })).toEqual(hold);
  });
});
