// ============================================================
// Sample data for the email registry
// ============================================================
//
// One set of fixtures shared by the dev preview and the tests, so what you look
// at is exactly what the contract tests assert against.
//
// "hostile" fills every free-text field with HOSTILE, which is how
// escaping.test.ts proves no template interpolates raw user input.

import type { CampaignBlockImages, CampaignBlocksEmailData } from "../campaign-blocks";
import type { CampaignContent, EmailBlock, EmailBlockType } from "@/lib/email-campaigns/content";
import type { OrderEmailData } from "../types";
import type { RmaEmailData } from "../rma";
import type { ChatTranscript } from "../support-chat";

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

/** The same order with 2,000 points (S$20) spent beside a S$20 coupon, earning 1,233 points, for a guest. */
export function sampleOrderWithPoints(fixture: EmailFixture = "happy"): OrderEmailData {
  return { ...sampleOrder(fixture), pointsSpent: 2000, pointsEarn: { points: 1233, guest: true } };
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

export function sampleChatTranscript(fixture: EmailFixture = "happy"): ChatTranscript {
  return {
    ref: "3F9A2C",
    chatId: "3f9a2c41-7d0e-4b8a-9c55-1e2f3a4b5c6d",
    name: pick(fixture, "Tan Wei Ling"),
    email: "wei.ling@example.com",
    hasAccount: false,
    reason: "staff_reply",
    messages: [
      {
        sender: "customer",
        body: pick(
          fixture,
          "Hi team,\n\nI bought a medium bolster last month. Would the long size suit a 1.8m frame better?",
        ),
        createdAt: "2026-10-24T02:14:00Z",
      },
      {
        sender: "staff",
        staffName: pick(fixture, "Darren"),
        body: pick(fixture, "Hi Wei Ling! For a 1.8m frame the long (1.2m) bolster is the better fit. Happy to swap it for you."),
        createdAt: "2026-10-24T02:31:00Z",
      },
    ],
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
    // The Approval Notice facts; the decline email ignores them.
    notice: { promoCode: pick(fixture, "BRIGHT8K2"), territory: pick(fixture, "Singapore"), commissionPool: 50 },
  };
}

/** PRD-loyalty-points slice 05: the Claim bonus, 1,000 points. */
export function sampleClaimBonus(fixture: EmailFixture = "happy") {
  return { firstName: pick(fixture, "Wei Ling"), points: 1000, shopUrl: `${ORIGIN}/en-US/shop`, termsUrl: `${ORIGIN}/en-US/points` };
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

/**
 * PRD-loyalty-points slice 07: a points expiry reminder, `months` before the
 * balance expires. 2,130 points (S$21.30), expiring on 12 March 2028.
 */
export function samplePointsExpiry(fixture: EmailFixture = "happy", months: 1 | 2 | 3 = 3) {
  return {
    firstName: pick(fixture, "Wei Ling"),
    points: 2130,
    expiresOn: pick(fixture, "12 March 2028"),
    months,
    shopUrl: `${ORIGIN}/en-US/shop`,
    termsUrl: `${ORIGIN}/en-US/points`,
    accountUrl: `${ORIGIN}/en-US/account`,
  };
}

// Migration slice 08: the campaign emails. Each link is what the wave sender
// builds for one Customer (a Claim link with the campaign's UTMs, and the
// unsubscribe confirm page); the tokens here are made up.
const CAMPAIGN_CUSTOMER = "0f8fad5b-d9cb-469f-a165-70867728950e";
const sampleUnsubscribeUrl = `${ORIGIN}/en-US/unsubscribe?u=${CAMPAIGN_CUSTOMER}&t=Qm9vbGVhbi1zZWNyZXQtcHJldmlldy10b2tlbg`;
const sampleClaimUrl = (template: string) =>
  `${ORIGIN}/en-US/account/welcome?c=k3V9xQe2LmP0aRt7yUb4wZc8nDf1hJg6sKo5vXi2qEw&utm_source=new_website&utm_medium=email&utm_campaign=${template}`;

/** The Claim bonus as the wave sender states it (claimBonusOffer). */
function sampleCampaignBonus(fixture: EmailFixture) {
  return { points: pick(fixture, "1,000 points"), amount: pick(fixture, "S$10"), months: 3 };
}

export function sampleMigrationAnnouncement(fixture: EmailFixture = "happy") {
  return {
    firstName: pick(fixture, "Wei Ling"),
    email: pick(fixture, "wei.ling@example.com"),
    claimUrl: sampleClaimUrl("migration_announcement"),
    bonus: sampleCampaignBonus(fixture),
    termsUrl: `${ORIGIN}/en-US/points`,
    unsubscribeUrl: sampleUnsubscribeUrl,
  };
}

/** A customer with no first name: the greeting is the sentence that changes. */
export function sampleMigrationAnnouncementNoName(fixture: EmailFixture = "happy") {
  return { ...sampleMigrationAnnouncement(fixture), firstName: null };
}

export function sampleMigrationReminder(fixture: EmailFixture = "happy") {
  return {
    firstName: pick(fixture, "Wei Ling"),
    email: pick(fixture, "wei.ling@example.com"),
    claimUrl: sampleClaimUrl("migration_reminder"),
    bonus: sampleCampaignBonus(fixture),
    termsUrl: `${ORIGIN}/en-US/points`,
    unsubscribeUrl: sampleUnsubscribeUrl,
  };
}

export function sampleMigrationServiceNotice(fixture: EmailFixture = "happy") {
  return {
    firstName: pick(fixture, "Wei Ling"),
    email: pick(fixture, "wei.ling@example.com"),
    signInUrl: sampleClaimUrl("migration_service_notice"),
    siteHost: "custom.mpillow.com",
    readjustmentUrl: `${ORIGIN}/en-US/appointments?type=readjustment`,
    supportWhatsAppDisplay: "+65 8780 5311",
    supportWhatsAppUrl: "https://wa.me/6587805311",
    unsubscribeUrl: sampleUnsubscribeUrl,
  };
}

/** A campaign Staff wrote (PRD-email-marketing): a heading, a bullet list, a link, and the sign-in button. */
export function sampleComposedCampaign(fixture: EmailFixture = "happy") {
  return {
    firstName: pick(fixture, "Wei Ling"),
    subject: pick(fixture, "Our new website is here, with points waiting for you"),
    preheader: pick(fixture, "Sign in within 3 months to collect 1,000 points."),
    body: [
      "We have a new website, and your Mpillow account is ready on it.",
      "",
      "## What your account does",
      `- ${pick(fixture, "Saves your delivery addresses")}`,
      "- Books a re-adjustment for your pillow",
      "",
      `Questions? Read more at ${ORIGIN}/en-US/faq or just reply to this email.`,
    ].join("\n"),
    greeting: true,
    button: { label: "Sign in and collect your points", href: sampleClaimUrl("campaign:3f2b6c1e-8d4a-4f0b-9c7e-1a2b3c4d5e6f") },
    unsubscribeUrl: sampleUnsubscribeUrl,
  };
}

/**
 * Words with every character escaping must handle, and no tag: the content
 * schema refuses a tag in a block's words, so HOSTILE itself cannot get there.
 */
export const WORDS_PROBE = `"Quotes" & <3 'apostrophes'`;

/**
 * A campaign built from blocks (PRD-campaign-email-editor slice 03): a title,
 * a text block with bold, a link and the first name, bullets, two buttons side
 * by side, a divider and a spacer. Each button's link is what the sender
 * resolves for one Customer.
 */
export function sampleCampaignBlocksContent(fixture: EmailFixture = "happy"): CampaignContent {
  return {
    v: 1,
    blocks: [
      { id: "title", type: "heading", level: 1, text: "Sleep cooler this December" },
      {
        id: "intro",
        type: "text",
        paragraphs: [
          {
            kind: "p",
            runs: [
              { text: "Our " },
              { text: "FibreCool", bold: true },
              { text: " covers are back, " },
              { var: "first_name" },
              { text: ", in every size. Read " },
              { text: "the care guide", href: `${ORIGIN}/en-US/faq` },
              { text: fixture === "hostile" ? ` ${WORDS_PROBE}.` : " before you wash yours." },
            ],
          },
          { kind: "bullets", items: [[{ text: "Cool to the touch" }], [{ text: "Machine ", italic: true }, { text: "washable" }]] },
        ],
      },
      {
        id: "buttons",
        type: "buttons",
        buttons: [
          { label: "Shop the covers", target: "shop", style: "primary" },
          { label: "Book a fitting", target: "book_fitting", style: "secondary" },
        ],
      },
      { id: "line", type: "divider" },
      { id: "room", type: "spacer", size: "s" },
      { id: "closing", type: "text", paragraphs: [{ kind: "p", runs: [{ text: "Questions? Just reply to this email." }] }] },
    ],
    fallbacks: { first_name: "there" },
  };
}

export function sampleCampaignBlocks(fixture: EmailFixture = "happy"): CampaignBlocksEmailData {
  const firstName = pick(fixture, "Wei Ling");
  const utm = "utm_source=email_campaign&utm_medium=email&utm_campaign=december-cooling-launch";
  const pages: Record<string, string> = { shop: "/en-US/shop", book_fitting: "/en-US/appointments" };
  return {
    subject: pick(fixture, "{first_name}, sleep cooler this December"),
    preheader: pick(fixture, "Our FibreCool covers are back, in every size."),
    content: sampleCampaignBlocksContent(fixture),
    greeting: true,
    firstName,
    values: { first_name: firstName },
    buttonHref: (b) => `${ORIGIN}${pages[b.target] ?? "/en-US"}?${utm}`,
    unsubscribeUrl: sampleUnsubscribeUrl,
  };
}

const blockEmail = (...blocks: EmailBlock[]): CampaignContent => ({ v: 1, blocks, fallbacks: { first_name: "there" } });

/** The Media Assets EMAIL_BLOCK_SAMPLES place: a photo, and a cut-out with transparency. */
export const SAMPLE_PHOTO_ASSET = "6f1c2b9e-3d4a-4e8b-9c1d-2a3b4c5d6e7f";
export const SAMPLE_CUTOUT_ASSET = "8a2d3c4b-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

/**
 * Their email renditions, as the sender reads them (slice 05): a 1,200px
 * JPEG of the photo, and a PNG of the cut-out, which sits on the light plate.
 */
export const EMAIL_BLOCK_SAMPLE_IMAGES: CampaignBlockImages = {
  [SAMPLE_PHOTO_ASSET]: {
    url: `https://mpillow.supabase.co/storage/v1/object/public/media/email/${SAMPLE_PHOTO_ASSET}.jpg`,
    width: 1200,
    height: 800,
    hasAlpha: false,
  },
  [SAMPLE_CUTOUT_ASSET]: {
    url: `https://mpillow.supabase.co/storage/v1/object/public/media/email/${SAMPLE_CUTOUT_ASSET}.png`,
    width: 900,
    height: 600,
    hasAlpha: true,
  },
};
const words = (id: string, text: string): EmailBlock => ({ id, type: "text", paragraphs: [{ kind: "p", runs: [{ text }] }] });

/**
 * One email per Email block type, showing every option the block has
 * (PRD-campaign-email-editor slice 15): what the dark-mode coverage test and
 * the per-block light and dark snapshots render. Keyed by every block type,
 * so a new type does not compile until it has its email here.
 */
export const EMAIL_BLOCK_SAMPLES: Record<EmailBlockType, CampaignContent> = {
  heading: blockEmail(
    { id: "title", type: "heading", level: 1, text: "Sleep cooler this December" },
    words("intro", "Our FibreCool covers are back."),
    { id: "part", type: "heading", level: 2, text: "Why FibreCool" },
    words("why", "Cool to the touch, all night."),
  ),
  text: blockEmail({
    id: "text",
    type: "text",
    paragraphs: [
      {
        kind: "p",
        runs: [
          { text: "Hi " },
          { var: "first_name" },
          { text: ", our " },
          { text: "FibreCool", bold: true },
          { text: " covers are " },
          { text: "back", italic: true },
          { text: ".\nRead " },
          { text: "the ", href: `${ORIGIN}/en-US/faq` },
          { text: "care guide", href: `${ORIGIN}/en-US/faq`, bold: true },
          { text: " before you wash yours." },
        ],
      },
      {
        kind: "bullets",
        items: [[{ text: "Cool to the touch" }], [{ text: "Machine washable: " }, { text: "how", href: `${ORIGIN}/en-US/faq` }]],
      },
    ],
  }),
  buttons: blockEmail(
    { id: "primary", type: "buttons", buttons: [{ label: "Shop the covers", target: "shop", style: "primary" }] },
    { id: "secondary", type: "buttons", buttons: [{ label: "Book a fitting", target: "book_fitting", style: "secondary" }] },
    {
      id: "pair",
      type: "buttons",
      buttons: [
        { label: "Shop the covers", target: "shop", style: "primary" },
        { label: "Read the care guide", target: "url", url: `${ORIGIN}/en-US/faq`, style: "secondary" },
      ],
    },
  ),
  image: blockEmail(
    {
      id: "photo",
      type: "image",
      image: { asset: SAMPLE_PHOTO_ASSET, alt: "A FibreCool cover on a made bed, in white" },
      link: { target: "shop" },
      width: "full",
    },
    words("intro", "Our FibreCool covers are back."),
    { id: "cutout", type: "image", image: { asset: SAMPLE_CUTOUT_ASSET, alt: "The Mpillow Premium, from the side" }, width: "inset" },
    { id: "flourish", type: "image", image: { asset: SAMPLE_PHOTO_ASSET, alt: "", decorative: true }, width: "inset" },
    words("outro", "Cool to the touch, all night."),
  ),
  hero: blockEmail(
    {
      id: "hero",
      type: "hero",
      image: { asset: SAMPLE_PHOTO_ASSET, alt: "A FibreCool cover on a made bed, in white" },
      heading: "Sleep cooler this December",
      line: "Our FibreCool covers are back, in every size.",
      button: { label: "Shop the covers", target: "shop", style: "primary" },
    },
    words("intro", "Cool to the touch, all night."),
    { id: "second", type: "hero", image: { asset: SAMPLE_CUTOUT_ASSET, alt: "The Mpillow Premium, from the side" }, heading: "Made to your measure" },
  ),
  divider: blockEmail(words("above", "Above the line."), { id: "line", type: "divider" }, words("below", "Below the line.")),
  spacer: blockEmail(
    words("a", "Before a small space."),
    { id: "s", type: "spacer", size: "s" },
    words("b", "Before a medium space."),
    { id: "m", type: "spacer", size: "m" },
    words("c", "Before a large space."),
    { id: "l", type: "spacer", size: "l" },
    words("d", "The end."),
  ),
};
