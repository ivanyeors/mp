import type { CampaignBlockImages, CampaignBlockProducts, CampaignBlocksEmailData } from "../campaign-blocks";
import { keepChineseAiDrafted, linesFingerprint, withChineseTranslation, wordsFingerprint, type BlockWords } from "@/lib/email-campaigns/chinese-version";
import type { CampaignContent, ChineseBlockWords, EmailBlock, EmailBlockType } from "@/lib/email-campaigns/content";
import type { OrderEmailData } from "../types";
import type { RmaEmailData } from "../rma";
import type { ChatTranscript } from "../support-chat";
import type { CancelledFee } from "../readjustment";

export type EmailFixture = "happy" | "hostile";

export const HOSTILE = `<img src=x onerror=alert(1)>"'&</script>`;

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

export function sampleResultAssignedBalance(fixture: EmailFixture = "happy") {
  const base = sampleResultAssigned(fixture);
  return { ...base, pricing: { ...base.pricing, authorized: null } };
}

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

export function sampleResultUpdated(fixture: EmailFixture = "happy") {
  const base = sampleResultAssigned(fixture);
  return {
    ...base,
    preferences: [pick(fixture, "Satin Cover"), pick(fixture, "Fibrecool Case")],
    pricing: { ...base.pricing, subtotal: 434, shipping: 12, tax: 32.12, total: 478.12 },
    previousTotal: base.pricing.total,
  };
}

export function sampleResultUpdatedWithinHold(fixture: EmailFixture = "happy") {
  const base = sampleResultUpdated(fixture);
  return {
    ...base,
    pricing: { ...base.pricing, subtotal: 349, shipping: 12, tax: 28.02, total: 389.02 },
  };
}

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

export function samplePaymentRequest(fixture: EmailFixture = "happy") {
  return {
    firstName: pick(fixture, "Ada"),
    orderNumber: "MP-20261107-0042",
    currency: "SGD",
    items: [
      { title: pick(fixture, "Ear Comfort Pad"), variantTitle: pick(fixture, "One size"), quantity: 1, totalPrice: 39 },
      { title: "Re-adjustment service", variantTitle: null, quantity: 1, totalPrice: 30 },
    ],
    subtotal: 69,
    shippingAmount: 5,
    discountAmount: 6.9,
    taxAmount: 0,
    total: 67.1,
    deliveryHeading: "Delivering to",
    deliveryLines: [pick(fixture, "Ada Tan"), pick(fixture, "1 Orchard Road #02-01"), "Singapore 238824", "SG"],
    note: pick(fixture, "Your spare ear pad, and the re-adjustment we did today."),
    payUrl: "https://custom.mpillow.com/en-US/pay/5a1e5a1e-0000-4000-8000-0000000f0009",
    expires: "Fri, 14 Nov 2026",
  };
}

export function samplePaymentRequestCollect(fixture: EmailFixture = "happy") {
  return {
    ...samplePaymentRequest(fixture),
    shippingAmount: 0,
    discountAmount: 0,
    total: 69,
    deliveryHeading: `Collect from ${pick(fixture, "Mpillow Studio")}`,
    deliveryLines: [pick(fixture, "Ada Tan"), pick(fixture, "200 Middle Road #01-02"), "Singapore 188980"],
    note: null,
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

export function sampleReadjustmentCancelled(
  fixture: EmailFixture,
  fee: CancelledFee,
) {
  return {
    fee,
    guestName: pick(fixture, "Ada Tan"),
    productLabel: pick(fixture, "Premium Mpillow · Size M"),
    visit: "Fri, 14 Nov, 2:30 pm",
    locationName: pick(fixture, "Mpillow Studio"),
    amount: 30,
    currency: "SGD",
    orderNumber: "1077",
  };
}

export function sampleBalanceDueFinish(fixture: EmailFixture = "happy") {
  return { ...sampleBalanceDue(fixture), needsFinish: true };
}

export function sampleHoldExpiredUnpaid(fixture: EmailFixture = "happy") {
  return { ...sampleHoldExpired(fixture), reason: "unpaid" as const };
}

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
    supportEmail: pick(fixture, "sg@mpillow.com"),
    notice: { promoCode: pick(fixture, "BRIGHT8K2"), territory: pick(fixture, "Singapore"), commissionPool: 50 },
  };
}

export function sampleClaimBonus(fixture: EmailFixture = "happy") {
  return { firstName: pick(fixture, "Wei Ling"), points: 1000, shopUrl: `${ORIGIN}/en-US/shop`, termsUrl: `${ORIGIN}/en-US/points` };
}

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

export function sampleReviewRequestNoName(fixture: EmailFixture = "happy") {
  return { ...sampleReviewRequest(fixture), firstName: null };
}

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

export function sampleDraftReminder(fixture: EmailFixture = "happy", step: "1d" | "1w" | "1m" = "1d") {
  return {
    step,
    name: pick(fixture, "Wei Ling"),
    product: pick(fixture, "Mpillow"),
    continueUrl: `${ORIGIN}/en-US/mp-config?draft=3f2b8c1e-7d4a-4e9b-a1c2-5d6e7f8a9b0c&token=7d7d7d7d-0000-4000-8000-000000000050`,
    unsubscribeUrl: `${ORIGIN}/en-US/unsubscribe?u=0f8fad5b-d9cb-469f-a165-70867728950e&t=Qm9vbGVhbi1zZWNyZXQtcHJldmlldy10b2tlbg`,
    supportWhatsAppDisplay: "+65 8780 5311",
    supportWhatsAppUrl: "https://wa.me/6587805311",
  };
}

const CAMPAIGN_CUSTOMER = "0f8fad5b-d9cb-469f-a165-70867728950e";
const sampleUnsubscribeUrl = `${ORIGIN}/en-US/unsubscribe?u=${CAMPAIGN_CUSTOMER}&t=Qm9vbGVhbi1zZWNyZXQtcHJldmlldy10b2tlbg`;
const sampleClaimUrl = (template: string) =>
  `${ORIGIN}/en-US/account/welcome?c=k3V9xQe2LmP0aRt7yUb4wZc8nDf1hJg6sKo5vXi2qEw&utm_source=new_website&utm_medium=email&utm_campaign=${template}`;

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

export const WORDS_PROBE = `"Quotes" & <3 'apostrophes'`;

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
    values: { first_name: firstName, last_name: pick(fixture, "Tan"), points_balance: "1,250", your_pillow: "Premium Mpillow, size M" },
    buttonHref: (b) => `${ORIGIN}${pages[b.target] ?? "/en-US"}?${utm}`,
    unsubscribeUrl: sampleUnsubscribeUrl,
  };
}

const blockEmail = (...blocks: EmailBlock[]): CampaignContent => ({ v: 1, blocks, fallbacks: { first_name: "there" } });

export const SAMPLE_PHOTO_ASSET = "6f1c2b9e-3d4a-4e8b-9c1d-2a3b4c5d6e7f";
export const SAMPLE_CUTOUT_ASSET = "8a2d3c4b-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

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

export const SAMPLE_COVER_PRODUCT = "3b7e1f2a-9c4d-4a6b-8e1f-5d2c3b4a6e7f";
export const SAMPLE_NECK_PRODUCT = "7c2a4e6b-1d3f-4b8a-9e2c-6f4d5a3b2c1e";
export const SAMPLE_CASE_PRODUCT = "9e4b6d8a-2f1c-4e3a-8b7d-1c2e3f4a5b6d";

export const EMAIL_BLOCK_SAMPLE_PRODUCTS: CampaignBlockProducts = {
  [SAMPLE_COVER_PRODUCT]: {
    title: "FibreCool Cover",
    slug: "fibrecool-cover",
    image: { asset: SAMPLE_PHOTO_ASSET },
    price: 39,
    compareAt: null,
    from: true,
    currency: "SGD",
  },
  [SAMPLE_NECK_PRODUCT]: {
    title: "Cervical Neck Support",
    slug: "cervical-neck-support",
    image: { asset: SAMPLE_CUTOUT_ASSET },
    price: 45,
    compareAt: 59,
    from: false,
    currency: "SGD",
  },
  [SAMPLE_CASE_PRODUCT]: {
    title: "Camel Bolster Case",
    slug: "camel-bolster-case",
    image: null,
    price: 29.5,
    compareAt: null,
    from: false,
    currency: "SGD",
  },
};

const words = (id: string, text: string): EmailBlock => ({ id, type: "text", paragraphs: [{ kind: "p", runs: [{ text }] }] });

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
  split: blockEmail(
    {
      id: "left",
      type: "split",
      image: { asset: SAMPLE_PHOTO_ASSET, alt: "A FibreCool cover on a made bed, in white" },
      side: "left",
      heading: "Why FibreCool",
      paragraphs: [
        {
          kind: "p",
          runs: [{ text: "Cool to the touch, " }, { text: "all night", bold: true }, { text: ". Read the " }, { text: "care guide", href: `${ORIGIN}/en-US/faq` }, { text: "." }],
        },
      ],
      button: { label: "Shop the covers", target: "shop", style: "primary" },
    },
    {
      id: "right",
      type: "split",
      image: { asset: SAMPLE_CUTOUT_ASSET, alt: "The Mpillow Premium, from the side" },
      side: "right",
      heading: "Made to your measure",
      paragraphs: [
        { kind: "p", runs: [{ text: "Hi " }, { var: "first_name" }, { text: ", your fitting sets its height." }] },
        { kind: "bullets", items: [[{ text: "Three heights" }], [{ text: "Two firmnesses" }]] },
      ],
    },
  ),
  products: blockEmail(
    {
      id: "grid",
      type: "products",
      products: [SAMPLE_COVER_PRODUCT, SAMPLE_NECK_PRODUCT, SAMPLE_CASE_PRODUCT],
      layout: "side_by_side",
      buttonLabel: "Shop now",
    },
    { id: "rows", type: "products", products: [SAMPLE_COVER_PRODUCT, SAMPLE_NECK_PRODUCT], layout: "rows", buttonLabel: "See it in the shop" },
    {
      id: "one",
      type: "buttons",
      buttons: [{ label: "Shop the FibreCool cover", target: "product", product: SAMPLE_COVER_PRODUCT, style: "secondary" }],
    },
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

export const CHINESE_SAMPLE_LINES = {
  subject: "{first_name}, sleep cooler this December",
  preheader: "Our FibreCool covers are back, in every size.",
  chineseSubject: "{first_name}，这个十二月睡得更清凉",
  chinesePreheader: "FibreCool 枕套回来了，各种尺寸都有。",
} as const;

const CHINESE_SAMPLE_ENGLISH: CampaignContent = blockEmail(
  {
    id: "hero",
    type: "hero",
    image: { asset: SAMPLE_PHOTO_ASSET, alt: "A FibreCool cover on a made bed, in white" },
    heading: "Sleep cooler this December",
    line: "Our coolest covers, back in every size.",
    button: { label: "Shop the covers", target: "shop", style: "primary" },
  },
  {
    id: "intro",
    type: "text",
    paragraphs: [
      {
        kind: "p",
        runs: [
          { var: "first_name" },
          { text: ", warm nights are back. Read the " },
          { text: "care guide", href: `${ORIGIN}/en-US/faq` },
          { text: ", or " },
          { text: "book a fitting", href: `${ORIGIN}/en-US/appointments`, bold: true },
          { text: "." },
        ],
      },
      { kind: "bullets", items: [[{ text: "Cool to the touch" }], [{ text: "Machine washable" }]] },
    ],
  },
  { id: "why", type: "heading", level: 2, text: "Why FibreCool" },
  {
    id: "split",
    type: "split",
    image: { asset: SAMPLE_CUTOUT_ASSET, alt: "The Mpillow Premium, from the side" },
    side: "right",
    heading: "Made to your measure",
    paragraphs: [{ kind: "p", runs: [{ text: "Your fitting sets its height." }] }],
    button: { label: "Book a fitting", target: "book_fitting", style: "secondary" },
  },
  { id: "products", type: "products", products: [SAMPLE_COVER_PRODUCT], layout: "rows", buttonLabel: "Shop now" },
  { id: "photo", type: "image", image: { asset: SAMPLE_PHOTO_ASSET, alt: "Two pillows on a bed" }, width: "inset" },
  { id: "line", type: "divider" },
  {
    id: "pair",
    type: "buttons",
    buttons: [
      { label: "Customise yours", target: "customise_mpillow", style: "primary" },
      { label: "Read the care guide", target: "url", url: `${ORIGIN}/en-US/faq`, style: "secondary" },
    ],
  },
);

export const CHINESE_SAMPLE_WORDS: Record<string, BlockWords> = {
  hero: { type: "hero", alt: "铺好的床上的白色 FibreCool 枕套", heading: "这个十二月，睡得更清凉", line: "我们最清凉的枕套回来了，各种尺寸都有。", buttonLabel: "选购枕套" },
  intro: {
    type: "text",
    paragraphs: [
      {
        kind: "p",
        runs: [{ var: "first_name" }, { text: "，炎热的夜晚又来了。请阅读" }, { text: "保养指南", link: 0 }, { text: "，或" }, { text: "预约量身", link: 1, bold: true }, { text: "。" }],
      },
      { kind: "bullets", items: [[{ text: "触感清凉" }], [{ text: "可机洗" }]] },
    ],
  },
  why: { type: "heading", text: "为什么选择 FibreCool" },
  split: { type: "split", alt: "Mpillow Premium 侧面", heading: "按您的尺寸定制", paragraphs: [{ kind: "p", runs: [{ text: "量身时会为您调好枕头的高度。" }] }], buttonLabel: "预约量身" },
  products: { type: "products", buttonLabel: "立即选购" },
  photo: { type: "image", alt: "床上的两个枕头" },
  pair: { type: "buttons", labels: ["定制您的 Mpillow", "阅读保养指南"] },
};

export const CHINESE_SAMPLE_CONTENT: CampaignContent = keepChineseAiDrafted(
  withChineseTranslation(CHINESE_SAMPLE_ENGLISH, {
    subject: CHINESE_SAMPLE_LINES.chineseSubject,
    preheader: CHINESE_SAMPLE_LINES.chinesePreheader,
    from: linesFingerprint(CHINESE_SAMPLE_LINES.subject, CHINESE_SAMPLE_LINES.preheader),
    fallbacks: { first_name: "您" },
    blocks: Object.fromEntries(
      CHINESE_SAMPLE_ENGLISH.blocks.flatMap((b) => {
        const w = CHINESE_SAMPLE_WORDS[b.id];
        return w ? [[b.id, { ...w, from: wordsFingerprint(b) } as ChineseBlockWords]] : [];
      }),
    ),
  }),
);

export const CHINESE_SAMPLE_PRODUCTS: CampaignBlockProducts = {
  [SAMPLE_COVER_PRODUCT]: { ...EMAIL_BLOCK_SAMPLE_PRODUCTS[SAMPLE_COVER_PRODUCT], title: "FibreCool 凉感枕套" },
};
