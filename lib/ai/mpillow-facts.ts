import { SUPPORT_WHATSAPP_DISPLAY } from "@/lib/contact";

export const MPILLOW_ABOUT = "Mpillow, a Singapore company that makes custom-fit cervical pillows and bolsters";

export const MPILLOW_FACTS: readonly string[] = [
  "Pillows are custom-fitted: we measure things like shoulder width and sleep position, and tailor the pillow's height and width to the person.",
  "The height is adjustable, and one pillow supports both back and side sleeping.",
  "Covers and components are washable, and layers can be replaced without replacing the whole pillow.",
  "Customers can book a re-adjustment visit to have their pillow's fit retuned, and the stuffing is covered by a 10-year warranty.",
  "Mpillow won the Singapore Good Design award in 2022, and the modular design is patented.",
  "On our website people can customise a pillow or book an appointment for a fitting.",
  `Customers reach our support team on WhatsApp at ${SUPPORT_WHATSAPP_DISPLAY}, or through the Support page on our website.`,
];

export const MPILLOW_FACT_LINES = MPILLOW_FACTS.map((f) => `- ${f}`).join("\n");

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

export const MPILLOW_CHINESE_GLOSSARY_LINES = MPILLOW_CHINESE_GLOSSARY.map(([en, zh]) => `- ${en}: ${zh}`).join("\n");
