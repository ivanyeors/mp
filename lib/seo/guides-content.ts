import type { Locale } from "@/lib/i18n/locales";

export type GuideTopic = "neck-pain" | "cervical-pillow" | "custom-pillow";

export type GuideContent = {
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  h1: string;
  answerLede: string;
  links: { href: string; label: string }[];
  faqs: { question: string; answer: string }[];
  ctaHref: string;
  ctaLabel: string;
};

const GUIDES: Record<GuideTopic, Record<Locale, GuideContent>> = {
  "neck-pain": {
    "en-US": {
      metaTitle: "Pillow for Neck Pain Singapore | Mpillow Guide",
      metaDescription:
        "Find the best pillow for neck pain in Singapore. Mpillow custom cervical pillows are fitted in-store for your sleep position and body build.",
      keywords: ["pillow for neck pain Singapore", "neck support pillow Singapore"],
      h1: "Best Pillow for Neck Pain in Singapore",
      answerLede:
        "Neck pain from sleep often comes from a pillow that is the wrong height or firmness for your body. Mpillow makes fully customisable cervical pillows in Singapore — sized and fitted in-store for side, back, and combination sleepers. Choose Basic or Premium tier, then book an in-store session to match pillow height, firmness, and neck support to your posture.",
      links: [
        { href: "/blog/what-is-the-best-pillow-for-neck-pain-in-singapore", label: "What is the best pillow for neck pain in Singapore?" },
        { href: "/blog/what-is-tech-neck-and-how-can-a-pillow-help-fix-it-in-singapore", label: "What is tech neck, and can a pillow help?" },
        { href: "/mp-config", label: "Customise Premium Mpillow" },
        { href: "/mp-basic", label: "Customise Basic Mpillow" },
      ],
      faqs: [
        {
          question: "Can the wrong pillow cause neck pain?",
          answer:
            "Yes. A pillow that is too high, too flat, or too firm for your shoulder width and sleep position can strain cervical muscles overnight.",
        },
        {
          question: "How is Mpillow different from memory foam pillows?",
          answer:
            "Mpillow is customised to your body build and sleep position — not one-size-fits-all. Fillings and height are adjusted in-store.",
        },
        {
          question: "Do I need to visit the store?",
          answer:
            "Premium Mpillow includes in-store measurement and readjustment. Basic starts online in the Basic configurator, with an optional store visit.",
        },
      ],
      ctaHref: "/mp-config",
      ctaLabel: "Start custom pillow customisation",
    },
    "zh-CN": {
      metaTitle: "新加坡颈椎痛枕头指南 | Mpillow",
      metaDescription: "在新加坡寻找缓解颈椎痛的定制枕头。Mpillow 提供店内量身配置。",
      keywords: ["新加坡 颈椎痛 枕头"],
      h1: "新加坡颈椎痛枕头指南",
      answerLede:
        "睡眠颈椎痛通常源于枕头高度或硬度与体型不匹配。Mpillow 在新加坡提供全定制颈椎枕——根据睡姿和体型在店内配置。",
      links: [
        { href: "/mp-config", label: "开始定制" },
        { href: "/faq", label: "常见问题" },
      ],
      faqs: [
        {
          question: "错误的枕头会导致颈椎痛吗？",
          answer: "会。高度、硬度与肩宽和睡姿不匹配的枕头会使颈椎肌肉整夜紧张。",
        },
      ],
      ctaHref: "/mp-config",
      ctaLabel: "开始定制枕头",
    },
  },
  "cervical-pillow": {
    "en-US": {
      metaTitle: "Best Cervical Pillow Singapore | Mpillow Guide",
      metaDescription:
        "Compare cervical support pillows in Singapore. Mpillow Premium includes cervical neck support accessory and in-store fitting.",
      keywords: ["best cervical pillow Singapore", "cervical support pillow"],
      h1: "Best Cervical Pillow in Singapore",
      answerLede:
        "A cervical pillow supports the natural curve of your neck while keeping the spine aligned. Mpillow Premium includes optional cervical neck support and is measured in-store for height and firmness. For add-on cervical support, browse our cervical accessory in the shop — designed to complement your customised Mpillow.",
      links: [
        { href: "/blog/the-ultimate-guide-to-cervical-support-pillows-for-neck-pain-relief", label: "Cervical support pillows: the complete guide" },
        { href: "/blog/what-is-the-best-pillow-for-neck-pain-in-singapore", label: "What is the best pillow for neck pain?" },
        { href: "/shop", label: "Shop cervical accessories" },
        { href: "/mp-config", label: "Customise Premium Mpillow" },
      ],
      faqs: [
        {
          question: "What is a cervical pillow?",
          answer:
            "A pillow shaped or configured to support the cervical spine's natural curve, reducing strain for side and back sleepers.",
        },
        {
          question: "Is cervical support only for Premium?",
          answer:
            "Premium includes in-store fitting and optional cervical neck support accessory. Basic offers custom size and firmness online.",
        },
      ],
      ctaHref: "/mp-config",
      ctaLabel: "Customise your cervical pillow",
    },
    "zh-CN": {
      metaTitle: "新加坡颈椎枕指南 | Mpillow",
      metaDescription: "新加坡颈椎支撑枕对比与选购指南。",
      keywords: ["新加坡 颈椎枕"],
      h1: "新加坡最佳颈椎枕",
      answerLede: "颈椎枕支撑颈部自然曲线并保持脊柱对齐。Mpillow Premium 提供店内测量和可选颈椎支撑配件。",
      links: [{ href: "/mp-config", label: "定制 Premium Mpillow" }],
      faqs: [
        {
          question: "什么是颈椎枕？",
          answer: "支撑颈椎自然曲线的枕头，减轻侧睡和仰睡者的颈部压力。",
        },
      ],
      ctaHref: "/mp-config",
      ctaLabel: "定制颈椎枕",
    },
  },
  "custom-pillow": {
    "en-US": {
      metaTitle: "Customised Pillow Singapore | Mpillow Guide",
      metaDescription:
        "Order a customised pillow in Singapore. Choose tier, size, cover, and case — fitted in-store for neck pain relief.",
      keywords: ["customised pillow Singapore", "custom pillow Singapore"],
      h1: "Customised Pillow in Singapore",
      answerLede:
        "Mpillow is Singapore's custom pillow maker — not off-the-shelf memory foam. Pick Basic (online start) or Premium (in-store measurement), select size and fabrics, and get a pillow built for your neck and sleep style. Start customisation online; Premium customers book an in-store fitting to finalise height and filling mix.",
      links: [
        { href: "/blog/tailored-to-you-understanding-the-process-of-crafting-custom-made-pillows-for-better-sleep", label: "How a custom pillow is made and fitted" },
        { href: "/blog/how-to-choose-the-best-pillow-in-singapore", label: "How to choose the best pillow in Singapore" },
        { href: "/mp-config", label: "Customise Premium Mpillow" },
        { href: "/mp-basic", label: "Customise Basic Mpillow" },
        { href: "/faq", label: "Customisation FAQs" },
      ],
      faqs: [
        {
          question: "How long does customisation take?",
          answer:
            "Online configuration takes minutes. In-store fitting is by appointment; production follows after you accept your final build.",
        },
        {
          question: "What can I customise?",
          answer: "Tier, size, cover, and case. Fillings and protector are set by tier and confirmed by our specialists.",
        },
      ],
      ctaHref: "/mp-config",
      ctaLabel: "Start customised pillow order",
    },
    "zh-CN": {
      metaTitle: "新加坡定制枕头 | Mpillow 指南",
      metaDescription: "在新加坡订购定制枕头。选择等级、尺寸和面料。",
      keywords: ["新加坡 定制枕头"],
      h1: "新加坡定制枕头",
      answerLede: "Mpillow 是新加坡定制枕头品牌——选择基础款或高级款，在线开始定制，高级款可预约到店试配。",
      links: [{ href: "/mp-config", label: "开始定制" }],
      faqs: [
        {
          question: "可以定制哪些部分？",
          answer: "等级、尺寸、面料和枕套。填充物和护套由等级决定并由专家确认。",
        },
      ],
      ctaHref: "/mp-config",
      ctaLabel: "开始定制",
    },
  },
};

export function getGuideContent(topic: string, locale: Locale): GuideContent | null {
  const guide = GUIDES[topic as GuideTopic];
  if (!guide) return null;
  return guide[locale] ?? guide["en-US"];
}

export function isGuideTopic(topic: string): topic is GuideTopic {
  return topic in GUIDES;
}
