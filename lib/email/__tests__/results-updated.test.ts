/**
 * "Your build has been updated" — the email Staff send after re-configuring a
 * build the customer already has.
 *
 * Its whole reason to exist is the money sentence: the customer was quoted one
 * number, the build changed, and what their card actually covers now decides
 * whether they owe anything at checkout. That sentence is derived from
 * `planCapture`, the function Accept settles with, and these tests pin the
 * three shapes it produces so the email can never promise a split the checkout
 * contradicts.
 */

process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";

import { describe, expect, it } from "vitest";
import {
  sampleResultAssigned,
  sampleResultUpdated,
  sampleResultUpdatedBalance,
  sampleResultUpdatedWithinHold,
} from "../__fixtures__/samples";
import { planCapture } from "@/lib/authorization-hold/settlement-plan";
import { money } from "../format";
import { renderResultAssignedEmail, renderResultUpdatedEmail } from "../results";

const overHold = renderResultUpdatedEmail(sampleResultUpdated());
const withinHold = renderResultUpdatedEmail(sampleResultUpdatedWithinHold());
const noHold = renderResultUpdatedEmail(sampleResultUpdatedBalance());

describe("renderResultUpdatedEmail", () => {
  it("does not reuse the assigned email's subject", () => {
    // The point of the template. Two emails under "Your final build is ready"
    // carrying different totals is the failure it exists to prevent.
    const assigned = renderResultAssignedEmail(sampleResultAssigned());
    for (const mail of [overHold, withinHold, noHold]) {
      expect(mail.subject).not.toBe(assigned.subject);
      expect(mail.subject).toBe("Your Mpillow build has been updated");
    }
  });

  it("shows what they were quoted before, next to the new total", () => {
    const { previousTotal, pricing } = sampleResultUpdated();
    expect(overHold.html).toContain("Previously quoted");
    expect(overHold.html).toContain(money(previousTotal, pricing.currency));
    expect(overHold.html).toContain("New total");
    expect(overHold.text).toContain("Previously quoted:");
  });

  it("omits the comparison when the total did not move", () => {
    const base = sampleResultUpdated();
    const same = renderResultUpdatedEmail({ ...base, previousTotal: base.pricing.total });
    expect(same.html).not.toContain("Previously quoted");
    expect(same.text).not.toContain("Previously quoted");
  });

  it("names the balance when the new total outgrew the hold", () => {
    const { pricing } = sampleResultUpdated();
    const plan = planCapture(pricing.total, pricing.authorized!);
    expect(plan.kind).toBe("top_up");
    const topUp = plan.kind === "top_up" ? plan.topUp : 0;
    expect(overHold.html).toContain("Balance to pay");
    expect(overHold.html).toContain(money(topUp, pricing.currency));
    expect(overHold.text).toContain(
      `Balance to pay at checkout: ${money(topUp, pricing.currency)}`,
    );
  });

  it("promises nothing extra when the hold still covers it", () => {
    const { pricing } = sampleResultUpdatedWithinHold();
    expect(planCapture(pricing.total, pricing.authorized!).kind).toBe("capture");
    expect(withinHold.html).not.toContain("Balance to pay");
    expect(withinHold.html).toContain("we only capture this amount");
  });

  it("asks a customer with no hold to pay, and mentions no hold", () => {
    for (const body of [noHold.text, noHold.html]) {
      expect(body).not.toMatch(/hold/i);
      expect(body).not.toMatch(/decline/i);
    }
    expect(noHold.html).toContain("Review and pay");
    expect(noHold.html).toContain("Nothing has been charged yet");
  });

  it("carries the full current spec, so the customer sees what changed", () => {
    for (const line of ["Size", "Tier", "Fillings", "Preferences", "Add-ons", "Satin Cover"]) {
      expect(overHold.html, `missing ${line}`).toContain(line);
    }
  });
});
