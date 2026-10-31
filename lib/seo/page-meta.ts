import type { Metadata } from "next";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { MAX_META_DESCRIPTION_CHARS, MIN_META_DESCRIPTION_CHARS } from "@/lib/seo/meta-description";

export type PageMeta = { title: string; description: string };

/**
 * Search titles and descriptions for pages whose on-page copy does not make one.
 *
 * A description runs MIN_ to MAX_META_DESCRIPTION_CHARS (`page-meta.test.ts`):
 * site audits flag a shorter one as too thin for a search snippet and a longer
 * one as cut off. Titles get " | Mpillow" from the root layout's template.
 */
export const PAGE_META = {
  // The hero's answer lede is written for the page; this one is sized for a snippet.
  home: {
    "en-US": {
      title: "Custom cervical pillow for neck pain in Singapore",
      description:
        "Mpillow makes custom cervical pillows in Singapore for neck stiffness. Get measured in store, or online from overseas, and we fit it to how you sleep.",
    },
    "zh-CN": {
      title: "Custom cervical pillow for neck pain in Singapore",
      description:
        "Mpillow 是来自新加坡的定制颈椎枕，专为长期颈部僵硬而设计。在新加坡可到店量身，海外顾客可在线测量，我们再按您的睡姿与肩宽调校枕头的高度和填充层，让颈部整夜得到合适的承托。提供基础款与高级款两种选择，之后也可以回到门店调整。",
    },
  },
  shop: {
    "en-US": {
      title: "Shop | Mpillow Singapore",
      description:
        "Shop Mpillow pillow cases, covers and sleep accessories, made to fit your custom cervical pillow and Mbolster. Order online with delivery from Singapore.",
    },
    "zh-CN": {
      title: "商店 | Mpillow Singapore",
      description:
        "选购 Mpillow 枕套、枕头外套与睡眠配件，专为搭配您的定制颈椎枕和 Mbolster 支撑抱枕而设计。多种面料与尺寸可选，可在线下单并从新加坡配送到家，让整套睡眠配置更舒适，也更容易清洗和打理。新加坡本地与海外顾客均可下单。",
    },
  },
  ourPartners: {
    "en-US": {
      title: "Our partners in Singapore",
      description:
        "Meet the chiropractors, physiotherapists and wellness studios in Singapore who work with Mpillow, and apply to join our partner programme for practices.",
    },
    "zh-CN": {
      title: "我们的合作伙伴",
      description:
        "认识与 Mpillow 合作的新加坡脊骨神经科诊所、物理治疗中心与健康工作室。如果您希望把定制颈椎枕和 Mbolster 支撑抱枕介绍给您的客户，欢迎申请加入我们的合作伙伴计划，获取产品演示、量身指导与联合推广支持，期待与您携手。",
    },
  },
  // /appointments with no type: the "what do you need?" choice.
  appointments: {
    "en-US": {
      title: "Book a pillow fitting in Singapore",
      description:
        "Book a visit to Mpillow in Singapore: a customisation to measure you for a new pillow, or a readjustment of yours. Overseas, we fit you by video call.",
    },
    "zh-CN": {
      title: "预约 Mpillow 量身或调整",
      description:
        "预约 Mpillow 新加坡门店服务：定制服务会为您量身，按睡姿与体型配置新枕头；调整服务则为您已购买的枕头重新调校高度与填充。新加坡以外的顾客可通过视频通话完成量身，确认预约后我们会发送链接给您。每个时段为一人服务，两人请预约相邻时段。",
    },
  },
  appointmentsCustomisation: {
    "en-US": {
      title: "Book a custom pillow measurement in Singapore",
      description:
        "Book an Mpillow customisation in Singapore. We measure your shoulders and neck and set up your pillow for how you sleep. Overseas, we meet by video call.",
    },
    "zh-CN": {
      title: "预约定制枕头量身",
      description:
        "预约 Mpillow 新加坡定制服务。我们会测量您的肩宽与颈部，并按您的睡姿与体型配置颈椎枕的高度、硬度与填充层，量完即可现场试躺。新加坡以外的顾客可通过视频通话量身，确认预约后我们会把链接发送给您。每个时段为一人服务，两人请预约相邻时段。",
    },
  },
  appointmentsReadjustment: {
    "en-US": {
      title: "Book a pillow readjustment in Singapore",
      description:
        "Book a readjustment for your Mpillow. We reset its height and fillings to how you sleep now. Sign in first, so we know which pillow is coming in.",
    },
    "zh-CN": {
      title: "预约枕头调整",
      description:
        "为您已购买的 Mpillow 预约到店调整服务，我们会按您现在的睡姿与体型重新调校枕头的高度和填充层。预约前请先登录并选择您的枕头，您的订单即为购买凭证，我们也会据此确认这次调整是否免费。每个时段为一人服务，两人请预约相邻时段。",
    },
  },
} satisfies Record<string, Record<Locale, PageMeta>>;

/**
 * Pages written in English only. Their zh-CN URL shows the same English text,
 * so it is a copy that canonicalises to en-US (`buildPageMetadata`'s
 * `alternateLocales`), and the sitemap lists the en-US URL alone.
 */
export const ENGLISH_ONLY_PAGE_META = {
  support: {
    path: "/support",
    title: "Contact us and book a fitting",
    description:
      "Book an appointment, chat with our team here or on WhatsApp. Learn how to schedule customisation, adjustments, and fitting sessions at Mpillow.",
  },
  mpCare: {
    path: "/mp-care",
    title: "How to care for your Mpillow",
    description:
      "Your Mpillow care ritual: fluff it daily, wash the cover sheets weekly and the case monthly, and wash the whole pillow once a year, with video guides.",
  },
  privacyPolicy: {
    path: "/privacy-policy",
    title: "Privacy policy",
    description:
      "How Mellow Life Pte Ltd (Mpillow) collects, uses and protects your personal data when you shop, book an appointment, create an account or contact us.",
  },
  termsOfService: {
    path: "/terms-of-service",
    title: "Terms of service",
    description:
      "The terms for using the Mpillow website, online store and appointment booking, run by Mellow Life Pte Ltd in Singapore. Please read them before you order.",
  },
  returnsWarranty: {
    path: "/shipping-refund-policies",
    title: "Shipping, returns and warranty",
    description:
      "Mpillow shipping timelines, returns, refunds, exchanges, adjustments and warranties for Basic Mpillow, Premium Mpillow and Mbolster, all in one place.",
  },
  points: {
    path: "/points",
    title: "How points work",
    description:
      "How Mpillow points work: what you earn on each order, how to use them as money off a later shop order, and the rules that apply. Points never expire.",
  },
} satisfies Record<string, PageMeta & { path: string }>;

/** An English-only page's metadata in the URL's locale. */
export function englishOnlyPageMetadata(page: keyof typeof ENGLISH_ONLY_PAGE_META, lang: string): Metadata {
  return buildPageMetadata({ ...ENGLISH_ONLY_PAGE_META[page], lang, alternateLocales: [DEFAULT_LOCALE] });
}

/** Lines that top up a product description too short for a snippet, longest first. */
const PRODUCT_DESCRIPTION_TAILS: Record<Locale, string[]> = {
  "en-US": [
    "From Mpillow, the Singapore maker of customisable cervical pillows and bolsters. Order online with delivery.",
    "From Mpillow, the Singapore maker of customisable cervical pillows.",
    "From Mpillow in Singapore.",
  ],
  "zh-CN": [
    "来自新加坡定制颈椎枕与支撑抱枕品牌 Mpillow。我们按您的睡姿与体型定制枕头，配件可与您的枕头和抱枕搭配使用，支持在线下单并从新加坡配送到家。新加坡本地顾客也可以预约到店量身，量完即可现场试躺，找到最适合自己的高度与软硬。",
    "来自新加坡定制颈椎枕与支撑抱枕品牌 Mpillow。我们按您的睡姿与体型定制枕头，配件可与之搭配使用，支持在线下单并从新加坡配送到家。",
    "来自新加坡定制颈椎枕与支撑抱枕品牌 Mpillow，可在线下单并从新加坡配送到家。",
    "来自新加坡品牌 Mpillow。",
  ],
};

/**
 * A product page's description: the SEO description Staff wrote, as written;
 * else the product description, topped up with a line about Mpillow when it is
 * too short to fill a snippet; else that line after the product's name.
 */
export function productMetaDescription(
  content: { title?: string | null; description?: string | null; seo_description?: string | null },
  locale: Locale,
): string {
  const written = content.seo_description?.trim();
  if (written) return written;
  const description = content.description?.trim();
  if (description && description.length >= MIN_META_DESCRIPTION_CHARS) return description;
  const tails = PRODUCT_DESCRIPTION_TAILS[locale];
  const lead = (description || content.title?.trim() || "").replace(/[\s.。!！]+$/, "");
  if (!lead) return tails[0];
  const stop = locale === "zh-CN" ? "。" : ". ";
  const topped = tails.map((tail) => `${lead}${stop}${tail}`);
  return topped.find((text) => text.length <= MAX_META_DESCRIPTION_CHARS) ?? topped[topped.length - 1];
}
