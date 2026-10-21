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

/**
 * Staff re-configured an assigned build and the price grew past the hold, so
 * the customer owes a Balance payment at checkout. Spread from the assigned
 * fixture so the shared spec rows cannot drift between the two templates.
 */
export function sampleResultUpdated(fixture: EmailFixture = "happy") {
  const base = sampleResultAssigned(fixture);
  return {
    ...base,
    preferences: [pick(fixture, "Satin Cover"), pick(fixture, "Fibrecool Case")],
    // Rows that add up: these previews get read, and a totals table that does
    // not reconcile is the first thing a reviewer stops on.
    pricing: { ...base.pricing, subtotal: 434, shipping: 12, tax: 32.12, total: 478.12 },
    previousTotal: base.pricing.total,
  };
}

/** Same change, but the hold still covers it — nothing extra to pay. */
export function sampleResultUpdatedWithinHold(fixture: EmailFixture = "happy") {
  const base = sampleResultUpdated(fixture);
  return {
    ...base,
    pricing: { ...base.pricing, subtotal: 349, shipping: 12, tax: 28.02, total: 389.02 },
  };
}

/** Assisted customisation: no hold, so the whole new total is owed. */
export function sampleResultUpdatedBalance(fixture: EmailFixture = "happy") {
  const base = sampleResultUpdated(fixture);
  return { ...base, pricing: { ...base.pricing, authorized: null } };
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

export function sampleReadjustmentReschedule(fixture: EmailFixture = "happy") {
  return {
    guestName: pick(fixture, "Ada Tan"),
    productLabel: pick(fixture, "Premium Mpillow · Size M"),
    wanted: "Fri, 14 Nov, 2:30 pm",
    locationName: pick(fixture, "Mpillow Studio"),
    amount: 30,
    currency: "SGD",
    orderNumber: "1077",
  };
}

export function sampleBalanceDueFinish(fixture: EmailFixture = "happy") {
  return { ...sampleBalanceDue(fixture), needsFinish: true };
}

/** The build was priced and the hold died unpaid — the other expiry voice. */
export function sampleHoldExpiredUnpaid(fixture: EmailFixture = "happy") {
  return { ...sampleHoldExpired(fixture), reason: "unpaid" as const };
}

/** A Paired build's Mbolster ended on its own while the Mpillow is still being built. */
export function samplePairedMbolsterRemoved(fixture: EmailFixture = "happy") {
  return {
    origin: ORIGIN,
    anchorId: pick(fixture, "8f2c1d54-77a1-4a0e-9d55-2f1c4bb9a001"),
    accessToken: pick(fixture, "tok_preview_9f2b"),
    anchorReady: false,
    amount: null,
    currency: "SGD",
  };
}

/** The same, once the Mpillow is assigned: this email is its "ready" email. */
export function samplePairedMbolsterRemovedReady(fixture: EmailFixture = "happy") {
  return { ...samplePairedMbolsterRemoved(fixture), anchorReady: true, amount: 428 };
}

export function sampleResultDeclined(fixture: EmailFixture = "happy") {
  return {
    origin: ORIGIN,
    resultId: pick(fixture, "8f2c1d54-77a1-4a0e-9d55-2f1c4bb9a001"),
    accessToken: pick(fixture, "tok_preview_9f2b"),
    productType: "pillow",
    releasedAmount: 428,
    currency: "SGD",
  };
}

/** Assisted / no-card decline: nothing to release, so the money line changes. */
export function sampleResultDeclinedNoHold(fixture: EmailFixture = "happy") {
  return { ...sampleResultDeclined(fixture), releasedAmount: null };
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

export function sampleWelcomeVoucher(fixture: EmailFixture = "happy") {
  return {
    firstName: pick(fixture, "Wei Ling"),
    email: pick(fixture, "wei.ling@example.com"),
    code: pick(fixture, "WB-7KQ4MZP2XH"),
    discountType: "fixed_amount" as const,
    value: 20,
    currency: "SGD",
    minOrderAmount: 50,
    expiresOn: pick(fixture, "19 December 2026"),
    shopUrl: `${ORIGIN}/en-US/shop`,
  };
}

/** Free-shipping terms, no minimum, and a customer with no first name. */
export function sampleWelcomeVoucherFreeShipping(fixture: EmailFixture = "happy") {
  return {
    ...sampleWelcomeVoucher(fixture),
    firstName: null,
    discountType: "free_shipping" as const,
    value: 1,
    minOrderAmount: null,
  };
}

/** CRM slice 07: the Review request, 14 days after delivery. */
export function sampleReviewRequest(fixture: EmailFixture = "happy") {
  return {
    firstName: pick(fixture, "Wei Ling"),
    product: pick(fixture, "Premium Mpillow"),
    orderNumber: pick(fixture, "MP-20261020-0042"),
    deliveredOn: pick(fixture, "3 Nov 2026"),
    reviewUrl: `${ORIGIN}/r/review?t=Zx81kQpL0aVb3nRt7yUe2w`,
    accountUrl: `${ORIGIN}/en-US/account/login?next=%2Fen-US%2Faccount`,
    supportWhatsAppDisplay: "+65 8780 5311",
    supportWhatsAppUrl: "https://wa.me/6587805311",
  };
}

/** The same email for a customer with no first name on file. */
export function sampleReviewRequestNoName(fixture: EmailFixture = "happy") {
  return { ...sampleReviewRequest(fixture), firstName: null };
}

/**
 * CRM slice 08: the yearly Check-up reminder for a Premium Mpillow. The fee is
 * Costings' seeded S$30; the job reads the live one at send time.
 */
export function sampleCheckup(fixture: EmailFixture = "happy") {
  return {
    firstName: pick(fixture, "Wei Ling"),
    product: pick(fixture, "Premium Mpillow"),
    orderNumber: pick(fixture, "MP-20251103-0042"),
    deliveredOn: pick(fixture, "3 Nov 2025"),
    fee: pick(fixture, "S$30"),
    bookingUrl: `${ORIGIN}/en-US/appointments?type=readjustment&item=6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b`,
    accountUrl: `${ORIGIN}/en-US/account/login?next=%2Fen-US%2Faccount`,
    supportWhatsAppDisplay: "+65 8780 5311",
    supportWhatsAppUrl: "https://wa.me/6587805311",
  };
}
