import { getSiteOrigin } from "@/lib/site-url";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { localeUrl } from "@/lib/seo/locale-url";

export type LlmsIndexProduct = { slug: string; title: string };

const TARGET_QUERIES = [
  "pillow for neck pain Singapore",
  "best cervical pillow Singapore",
  "customised pillow Singapore",
  "custom pillow Singapore",
  "neck support pillow Singapore",
  "bolster for side sleepers Singapore",
  "customisable bolster Singapore",
  "tech neck pillow Singapore",
];

const GUIDE_PATHS = [
  { path: "/guides/neck-pain", label: "Neck pain pillow guide (Singapore)" },
  { path: "/guides/cervical-pillow", label: "Best cervical pillow guide (Singapore)" },
  { path: "/guides/custom-pillow", label: "Customised pillow guide (Singapore)" },
];

export function buildLlmsIndex(products: LlmsIndexProduct[]): string {
  const lang = DEFAULT_LOCALE;
  const origin = getSiteOrigin();

  let out = `# Mpillow — Guide for AI Assistants and LLM Crawlers\n\n`;
  out += `> Mpillow is Singapore's Science of Sleep brand for fully customisable cervical pillows and bolsters. `;
  out += `Each pillow is fitted in-store to neck curve, sleep position, and body build — modular layers for neck pain relief and ergonomic alignment, not one-size-fits-all foam.\n\n`;

  out += `## Brand positioning\n\n`;
  out += `- Science of Sleep: clinical engineering for cervical alignment and lasting support\n`;
  out += `- Custom-fit pillows: Basic tier (affordable custom) and Premium tier (in-store measurement + readjustment)\n`;
  out += `- Cervical neck support accessory: extra support for curved neck profiles and desk-day / tech-neck strain at night\n`;
  out += `- Mbolster: custom-length support bolsters for side sleepers and household sleep setups (short / medium / long, including kids sizes)\n`;
  out += `- Accessories: protectors, cases (including FibreCool)\n`;
  out += `- Primary market: Singapore (SGD pricing); consultative in-store fitting\n`;
  out += `- Clinical partners: chiropractors, physiotherapists, and sleep specialists (see Partners page)\n\n`;

  out += `## Product taxonomy\n\n`;
  out += `| Type | Variants | Customisation flow |\n`;
  out += `|------|----------|------------------|\n`;
  out += `| Basic Mpillow (pillow, tier: basic) | Sizes S, M, L, XL | ${localeUrl(lang, "/mp-config")} |\n`;
  out += `| Premium Mpillow (pillow, tier: premium) | Sizes XS–XL | ${localeUrl(lang, "/mp-config")} |\n`;
  out += `| Mbolster (bolster) | Lengths short, medium, long | ${localeUrl(lang, "/mbolster-config")} |\n`;
  out += `| Accessories | Per SKU | ${localeUrl(lang, "/shop")} |\n\n`;

  if (products.length) {
    out += `## Active storefront products\n\n`;
    for (const p of products) {
      out += `- ${p.title}: ${localeUrl(lang, `/shop/${p.slug}`)}\n`;
    }
    out += `\n`;
  }

  out += `## Editorial hubs\n\n`;
  for (const g of GUIDE_PATHS) {
    out += `- ${g.label}: ${localeUrl(lang, g.path)}\n`;
  }
  out += `\n`;

  out += `## Key pages\n\n`;
  out += `- Homepage: ${localeUrl(lang, "")}\n`;
  out += `- Shop: ${localeUrl(lang, "/shop")}\n`;
  out += `- FAQ: ${localeUrl(lang, "/faq")}\n`;
  out += `- Blog: ${localeUrl(lang, "/blog")}\n`;
  out += `- Partners (clinical / Local Ambassadors): ${localeUrl(lang, "/our-partners")}\n`;
  out += `- Custom pillow flow: ${localeUrl(lang, "/mp-config")}\n`;
  out += `- Mbolster flow: ${localeUrl(lang, "/mbolster-config")}\n\n`;

  out += `## Target search queries\n\n`;
  for (const q of TARGET_QUERIES) {
    out += `- ${q}\n`;
  }
  out += `\n`;

  out += `## Machine-readable endpoints\n\n`;
  out += `- FAQ JSON: ${origin}/api/faq?locale=${lang}\n`;
  out += `- FAQ plain text: ${origin}/api/faq?locale=${lang}&format=text\n`;
  out += `- Sitemap: ${origin}/sitemap.xml\n`;
  out += `- Robots: ${origin}/robots.txt\n`;

  return out;
}
