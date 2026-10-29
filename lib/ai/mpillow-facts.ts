import { SUPPORT_WHATSAPP_DISPLAY } from "@/lib/contact";

/**
 * What Claude may say about Mpillow, and only this (PRD-campaign-email-editor
 * *AI guardrails*): one list, lifted out of the review-reply prompt
 * (lib/reviews/draft-reply.ts), so a review reply and a campaign draft state
 * the same facts. A new fact is a code change, reviewed like any other claim
 * the brand makes. Prices are never here: a campaign's come from its product
 * blocks, read from the shop at send.
 */

/** Who Mpillow is, in one line. */
export const MPILLOW_ABOUT = "Mpillow, a Singapore company that makes custom-fit cervical pillows and bolsters";

/** The facts, one sentence each. */
export const MPILLOW_FACTS: readonly string[] = [
  "Pillows are custom-fitted: we measure things like shoulder width and sleep position, and tailor the pillow's height and width to the person.",
  "The height is adjustable, and one pillow supports both back and side sleeping.",
  "Covers and components are washable, and layers can be replaced without replacing the whole pillow.",
  "Customers can book a re-adjustment visit to have their pillow's fit retuned, and the stuffing is covered by a 10-year warranty.",
  "Mpillow won the Singapore Good Design award in 2022, and the modular design is patented.",
  "On our website people can customise a pillow or book an appointment for a fitting.",
  `Customers reach our support team on WhatsApp at ${SUPPORT_WHATSAPP_DISPLAY}, or through the Support page on our website.`,
];

/** The facts as a prompt's bullet list. */
export const MPILLOW_FACT_LINES = MPILLOW_FACTS.map((f) => `- ${f}`).join("\n");

/**
 * How the 中文 site writes Mpillow's names and words (PRD-campaign-email-editor
 * slice 17), for ✨ Translate: product and brand names stay as written, the
 * rest as lib/i18n/messages/zh-CN.ts has them. A new entry is a code change,
 * reviewed with the site's own Chinese.
 */
export const MPILLOW_CHINESE_GLOSSARY: readonly (readonly [english: string, chinese: string])[] = [
  ["Mpillow, Mbolster, Basic Mpillow, Premium Mpillow, Bespoke Mpillow, FibreCool", "as written, in English letters"],
  ["customise, customised", "定制"],
  ["a fitting, to measure", "量身"],
  ["book a fitting", "预约量身"],
  ["book an appointment", "预约咨询"],
  ["re-adjustment, retune the fit", "重新调校"],
  ["cervical pillow", "颈椎枕"],
  ["bolster", "抱枕"],
  ["pillow cover", "枕套"],
  ["the shop", "商城"],
  ["shop now", "前往商城"],
  ["points", "积分"],
  ["back and side sleeping", "仰睡与侧睡"],
];

/** The glossary as a prompt's bullet list. */
export const MPILLOW_CHINESE_GLOSSARY_LINES = MPILLOW_CHINESE_GLOSSARY.map(([en, zh]) => `- ${en}: ${zh}`).join("\n");
