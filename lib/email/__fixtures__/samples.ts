// ============================================================
// Sample data for the email registry
// ============================================================
//
// One set of fixtures shared by the dev preview and the tests, so what you look
// at is exactly what the contract tests assert against.
//
// "hostile" fills every free-text field with HOSTILE, which is how
// escaping.test.ts proves no template interpolates raw user input.

import type { OrderEmailData } from "../types";
import type { RmaEmailData } from "../rma";

export type EmailFixture = "happy" | "hostile";

/** Injection probe: script tag, event handler, quotes and an ampersand. */
export const HOSTILE = `<img src=x onerror=alert(1)>"'&</script>`;

/** Pick between the realistic value and the injection probe. */
export function pick(fixture: EmailFixture, happy: string): string {
  return fixture === "hostile" ? HOSTILE : happy;
}

export function sampleOrder(fixture: EmailFixture = "happy"): OrderEmailData {
  return {
    orderNumber: pick(fixture, "MP-10428"),
    customerName: pick(fixture, "Tan Wei Ling"),
    currency: "SGD",
    items: [
      {
        title: pick(fixture, "Mpillow Premium"),
        variantTitle: pick(fixture, "Size M · Premium"),
        quantity: 1,
        totalPrice: 389,
      },
      {
        title: pick(fixture, "Bamboo Pillow Case"),
        variantTitle: null,
        quantity: 2,
        totalPrice: 58,
      },
    ],
    subtotal: 447,
    shippingAmount: 12,
    taxAmount: 32.13,
    discountAmount: 40,
    total: 451.13,
    shippingAddress: {
      recipient: pick(fixture, "Tan Wei Ling"),
      line1: pick(fixture, "18 Cross Street"),
      line2: pick(fixture, "#12-08 China Square Central"),
      city: pick(fixture, "Singapore"),
      state: null,
      postalCode: "048423",
      country: "Singapore",
    },
    trackingNumber: pick(fixture, "SG7742910083"),
    trackingUrl: "https://www.singpost.com/track?id=SG7742910083",
    refundAmount: 120,
  };
}

export function sampleRma(fixture: EmailFixture = "happy"): RmaEmailData {
  return {
    orderNumber: pick(fixture, "MP-10428"),
    customerName: pick(fixture, "Tan Wei Ling"),
    resolution: "refund",
    status: "requested",
    items: [
      { title: pick(fixture, "Mpillow Premium — Size M"), quantity: 1 },
      { title: pick(fixture, "Bamboo Pillow Case"), quantity: 2 },
    ],
    message: pick(
      fixture,
      "Post the item back to 18 Cross Street #12-08 within 14 days. Keep your tracking number.",
    ),
  };
}

const ORIGIN = "https://custom.mpillow.com";

export function sampleResultHeld(fixture: EmailFixture = "happy") {
  return {
    origin: ORIGIN,
    resultId: "8f2c1d54-77a1-4a0e-9d55-2f1c4bb9a001",
    accessToken: "tok_preview_9f2b",
    productType: "pillow" as const,
    label: pick(fixture, "Size M · Premium · Cervical contour"),
    amount: 389,
    currency: "SGD",
  };
}

/**
 * Assisted customisation: the customer submitted with no card, so there is no
 * Authorization hold and no authorized amount to show.
 */
export function sampleResultHeldNoHold(fixture: EmailFixture = "happy") {
  return { ...sampleResultHeld(fixture), amount: null };
}

export function sampleResultAssigned(fixture: EmailFixture = "happy") {
  return {
    origin: ORIGIN,
    resultId: "8f2c1d54-77a1-4a0e-9d55-2f1c4bb9a001",
    accessToken: "tok_preview_9f2b",
    productType: "pillow",
    size: pick(fixture, "M"),
    tier: pick(fixture, "premium"),
    length: null,
    // These come from admin-editable item names — the exact field that used to
    // be interpolated into HTML unescaped.
    fillingSummary: [
      pick(fixture, "6D Small ×5 (centre / middle)"),
      pick(fixture, "Latex Shred ×2 (left / front)"),
    ],
    preferences: [pick(fixture, "Tencel Cover"), pick(fixture, "Bamboo Case")],
    addons: [pick(fixture, "Travel Pouch")],
    pricing: {
      subtotal: 389,
      shipping: 12,
      tax: 28.07,
      total: 429.07,
      currency: "SGD",
      authorized: 420,
    },
  };
}

/**
 * Assisted customisation: no Authorization hold, so the whole total is owed by
 * Balance payment. Spread from the hold fixture so the two cannot drift.
 */
export function sampleResultAssignedBalance(fixture: EmailFixture = "happy") {
  const base = sampleResultAssigned(fixture);
  return { ...base, pricing: { ...base.pricing, authorized: null } };
}

/**
 * Assisted customisation sent from the questionnaire (ADR 0017): fillings are
 * built, cover/case/shipping not chosen yet, so the price is a floor.
 */
export function sampleResultAssignedFinish(fixture: EmailFixture = "happy") {
  const base = sampleResultAssignedBalance(fixture);
  return {
    ...base,
    preferences: [],
    addons: [],
    pricing: { ...base.pricing, shipping: 0, tax: 0, total: base.pricing.subtotal },
    needsFinish: true,
  };
}

export function sampleHoldExpired(fixture: EmailFixture = "happy") {
  return {
    origin: ORIGIN,
    resultId: pick(fixture, "8f2c1d54-77a1-4a0e-9d55-2f1c4bb9a001"),
    accessToken: pick(fixture, "tok_preview_9f2b"),
    productType: "pillow",
  };
}

export function sampleBalanceDue(fixture: EmailFixture = "happy") {
  return {
    origin: ORIGIN,
    resultId: pick(fixture, "8f2c1d54-77a1-4a0e-9d55-2f1c4bb9a001"),
    accessToken: pick(fixture, "tok_preview_9f2b"),
    productType: "pillow",
    amount: 428,
    currency: "SGD",
  };
}

export function sampleBalanceDueFinish(fixture: EmailFixture = "happy") {
  return { ...sampleBalanceDue(fixture), needsFinish: true };
}

export function sampleRestock(fixture: EmailFixture = "happy") {
  return {
    origin: ORIGIN,
    resultId: pick(fixture, "8f2c1d54-77a1-4a0e-9d55-2f1c4bb9a001"),
    accessToken: pick(fixture, "tok_preview_9f2b"),
  };
}

export function sampleContact(fixture: EmailFixture = "happy") {
  return {
    name: pick(fixture, "Tan Wei Ling"),
    email: pick(fixture, "wei.ling@example.com"),
    subject: pick(fixture, "Question about bolster sizing"),
    message: pick(
      fixture,
      "Hi team,\n\nI bought a medium bolster last month and I'm wondering whether the long size would suit a 1.8m frame better.\n\nThanks!",
    ),
  };
}

export function samplePartnerListing(fixture: EmailFixture = "happy") {
  return {
    partnerName: pick(fixture, "Bright Spine Physiotherapy"),
    hideUrl: `${ORIGIN}/en-US/settings/partners/hide?partner=abc123`,
  };
}

export function sampleHeldReminder(fixture: EmailFixture = "happy") {
  return {
    resultId: "8f2c1d54-77a1-4a0e-9d55-2f1c4bb9a001",
    platformUrl: `${ORIGIN}/en-US/settings/results/8f2c1d54`,
    customerEmail: pick(fixture, "wei.ling@example.com"),
    heldAt: "2026-08-05 14:22 SGT",
  };
}

export function sampleApplication(fixture: EmailFixture = "happy") {
  return {
    partnerSignInUrl: `${ORIGIN}/partner`,
    // The support address lands in a mailto: href and in link text.
    supportEmail: pick(fixture, "sg@mpillow.com"),
  };
}
