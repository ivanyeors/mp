import type { PageFaqDefaultSet } from "./types";

/**
 * Bilingual Page FAQ starters. Product sets keyed by stable shop slug
 * (resolved to product:{uuid} at seed — see seed.ts).
 */
export const PAGE_FAQ_DEFAULTS: PageFaqDefaultSet[] = [
  {
    surfaceKey: "home",
    titles: { "en-US": "Frequently asked questions", "zh-CN": "常见问题" },
    items: [
      {
        slug: "what-is-mpillow",
        content: {
          "en-US": {
            question: "What is Mpillow?",
            answer:
              "Mpillow is a modular custom pillow system sized to your shoulder, neck, and head measurements. Start online via [mp-config](/mp-config), or browse the [shop](/shop) for ready options.",
          },
          "zh-CN": {
            question: "什么是 Mpillow？",
            answer:
              "Mpillow 是按肩宽、颈深与头深测量定制的模块化枕头系统。可直接选购商店产品，或通过 [mp-config](/mp-config) 定制。",
          },
        },
      },
      {
        slug: "basic-vs-premium",
        content: {
          "en-US": {
            question: "What’s the difference between Basic and Premium Mpillow?",
            answer:
              "Basic is the core custom-fit pillow. Premium adds higher-spec components and accessories (including cervical neck support options). Compare them in the [shop](/shop) or start [customisation](/mp-config).",
          },
          "zh-CN": {
            question: "基础版与高级版 Mpillow 有什么区别？",
            answer:
              "基础版是核心定制枕。高级版配备更高规格部件与配件（含颈椎支撑选项）。可在[商店](/shop)对比，或开始[定制](/mp-config)。",
          },
        },
      },
      {
        slug: "cervical-vs-ergonomic",
        content: {
          "en-US": {
            question: "What’s the difference between a cervical and an ergonomic pillow?",
            answer:
              "Cervical support targets the neck curve with a dedicated contour. An ergonomic custom pillow like Mpillow sizes the whole pillow to your shoulder, neck and head. See cervical neck support on the home page, or start [customisation](/mp-config).",
          },
          "zh-CN": {
            question: "颈椎枕和人体工学枕有什么区别？",
            answer:
              "颈椎支撑侧重颈曲轮廓；人体工学定制枕（如 Mpillow）按肩、颈、头整体尺寸匹配身体。可在首页了解颈椎支撑，或开始[定制](/mp-config)。",
          },
        },
      },
      {
        slug: "tech-neck-at-night",
        content: {
          "en-US": {
            question: "Can a customised pillow help with tech neck strain at night?",
            answer:
              "Long screen days load the cervical spine. A customised Mpillow with optional cervical neck support helps keep overnight alignment after desk-heavy days. It's there to support and align you for sleep comfort, and it isn't medical treatment. Explore cervical support on the home page or [customise](/mp-config).",
          },
          "zh-CN": {
            question: "定制枕头能帮助缓解夜间科技颈不适吗？",
            answer:
              "长时间看屏幕会给颈椎带来负荷。定制 Mpillow 并可选颈椎支撑，有助于在久坐用电脑的一天后保持夜间对齐——以承托与对齐改善睡眠舒适，而非医疗治疗。可在首页了解颈椎支撑，或[开始定制](/mp-config)。",
          },
        },
      },
      {
        slug: "how-to-customise",
        content: {
          "en-US": {
            question: "How do I customise a pillow?",
            answer:
              "Use [mp-config](/mp-config) for a full custom build, or [book an appointment](/support) for in-person measurement. Bolsters use [mbolster-config](/mbolster-config).",
          },
          "zh-CN": {
            question: "如何定制枕头？",
            answer:
              "通过 [mp-config](/mp-config) 完成完整定制，或[预约到店测量](/support)。抱枕请使用 [mbolster-config](/mbolster-config)。",
          },
        },
      },
      {
        slug: "shipping-sg",
        content: {
          "en-US": {
            question: "Do you ship in Singapore?",
            answer:
              "Yes, we fulfil orders in Singapore. See our [FAQ](/faq) for shipping, warranty, and care details.",
          },
          "zh-CN": {
            question: "新加坡有配送吗？",
            answer:
              "有，我们在新加坡履约发货。配送、保修与护理详见[常见问题](/faq)。",
          },
        },
      },
    ],
  },
  {
    surfaceKey: "mp-config",
    titles: { "en-US": "Customisation FAQs", "zh-CN": "定制常见问题" },
    items: [
      {
        slug: "what-measurements",
        content: {
          "en-US": {
            question: "What measurements do you need?",
            answer:
              "We use shoulder length, neck depth, head depth, and neck length to recommend size, configuration, and profile. The wizard walks you through each step.",
          },
          "zh-CN": {
            question: "需要哪些测量数据？",
            answer:
              "我们根据肩长、颈深、头深与颈长推荐尺寸、配置与轮廓。向导会逐步引导您完成。",
          },
        },
      },
      {
        slug: "unsure-measurements",
        content: {
          "en-US": {
            question: "What if I’m unsure about my measurements?",
            answer:
              "You can [book a customisation appointment](/support) for guided measuring, or continue with best estimates and refine later via re-adjustment.",
          },
          "zh-CN": {
            question: "不确定测量数据怎么办？",
            answer:
              "可[预约定制咨询](/support)由我们协助测量，或先用估算继续，之后再通过复调优化。",
          },
        },
      },
      {
        slug: "after-submit",
        content: {
          "en-US": {
            question: "What happens after I submit my configuration?",
            answer:
              "We place an authorization hold, then an operator assigns your size×tier and filling mix. You review the final build before payment is captured.",
          },
          "zh-CN": {
            question: "提交配置后会发生什么？",
            answer:
              "我们会先做授权预授权，随后由运营确认尺寸×档次与填充配方。您确认最终方案后才会扣款。",
          },
        },
      },
      {
        slug: "basic-flow",
        content: {
          "en-US": {
            question: "Is there a simpler Basic flow?",
            answer:
              "Yes — [mp-basic](/mp-basic) is a shorter path for Basic tier. Full options remain on this page.",
          },
          "zh-CN": {
            question: "有更简单的基础版流程吗？",
            answer:
              "有 — [mp-basic](/mp-basic) 是基础档的简化路径。完整选项仍在本页。",
          },
        },
      },
    ],
  },
  {
    surfaceKey: "mbolster-config",
    titles: { "en-US": "Bolster FAQs", "zh-CN": "抱枕常见问题" },
    items: [
      {
        slug: "what-is-mbolster",
        content: {
          "en-US": {
            question: "What is Mbolster?",
            answer:
              "Mbolster is our customisable bolster (body pillow) companion to Mpillow — sized by length with modular fillings and covers.",
          },
          "zh-CN": {
            question: "什么是 Mbolster？",
            answer:
              "Mbolster 是与 Mpillow 配套的可定制抱枕（长条枕），按长度选型，填充与外套可模块化配置。",
          },
        },
      },
      {
        slug: "how-length",
        content: {
          "en-US": {
            question: "How do I choose bolster length?",
            answer:
              "The wizard recommends length from your preferences and use case. You can also browse the [Mbolster product page](/shop/mbolster).",
          },
          "zh-CN": {
            question: "如何选择抱枕长度？",
            answer:
              "向导会根据用途与偏好推荐长度。也可浏览 [Mbolster 产品页](/shop/mbolster)。",
          },
        },
      },
      {
        slug: "pillow-and-bolster",
        content: {
          "en-US": {
            question: "Can I customise a pillow and bolster together?",
            answer:
              "Yes — finish this bolster flow, then start [mp-config](/mp-config) for your pillow (or the reverse). Each order path is separate.",
          },
          "zh-CN": {
            question: "可以同时定制枕头和抱枕吗？",
            answer:
              "可以 — 完成本抱枕流程后，再开始 [mp-config](/mp-config) 定制枕头（或反过来）。两条路径各自独立下单。",
          },
        },
      },
    ],
  },
  {
    productSlug: "mpillow-basic",
    titles: { "en-US": "Mpillow FAQs", "zh-CN": "Mpillow 常见问题" },
    items: [
      {
        slug: "who-is-basic-for",
        content: {
          "en-US": {
            question: "Who is Basic Mpillow for?",
            answer:
              "Basic is our core custom-fit pillow — ideal if you want measurement-based sizing without Premium accessories. Customise via [mp-basic](/mp-basic) or [mp-config](/mp-config).",
          },
          "zh-CN": {
            question: "基础版 Mpillow 适合谁？",
            answer:
              "基础版是核心定制枕 — 适合需要按测量定尺寸、暂不需要高级配件的用户。可通过 [mp-basic](/mp-basic) 或 [mp-config](/mp-config) 定制。",
          },
        },
      },
      {
        slug: "cervical-vs-ergonomic",
        content: {
          "en-US": {
            question: "What’s the difference between a cervical and an ergonomic pillow?",
            answer:
              "Cervical support targets neck curve with a dedicated contour; an ergonomic custom pillow (like Mpillow) sizes the whole stack — shoulder, neck, and head — to your body. Basic focuses on that full custom fit.",
          },
          "zh-CN": {
            question: "颈椎枕和人体工学枕有什么区别？",
            answer:
              "颈椎支撑侧重颈曲轮廓；人体工学定制枕（如 Mpillow）按肩、颈、头整体尺寸匹配身体。基础版专注完整定制贴合。",
          },
        },
      },
      {
        slug: "care-wash",
        content: {
          "en-US": {
            question: "How do I wash Basic Mpillow?",
            answer:
              "Wash covers and case per care labels; use the laundry bag for components. See [Mpillow Care](/mp-care) and [Global FAQ](/faq) for full instructions.",
          },
          "zh-CN": {
            question: "基础版 Mpillow 如何清洗？",
            answer:
              "按护理标签清洗外套与枕套，部件可用洗衣袋分装。详见 [Mpillow 护理](/mp-care) 与[常见问题](/faq)。",
          },
        },
      },
      {
        slug: "upgrade-premium",
        content: {
          "en-US": {
            question: "Can I upgrade to Premium later?",
            answer:
              "Browse [Premium Mpillow](/shop/mpillow-premium) for higher-spec builds and accessories. Re-adjustment appointments can refine fit after purchase.",
          },
          "zh-CN": {
            question: "之后可以升级到高级版吗？",
            answer:
              "可浏览[高级版 Mpillow](/shop/mpillow-premium)了解更高规格与配件。购后也可预约复调优化贴合度。",
          },
        },
      },
    ],
  },
  {
    productSlug: "mpillow-premium",
    titles: { "en-US": "Premium Mpillow FAQs", "zh-CN": "高级版 Mpillow 常见问题" },
    items: [
      {
        slug: "what-premium-adds",
        content: {
          "en-US": {
            question: "What does Premium add over Basic?",
            answer:
              "Premium includes higher-spec components and accessory options such as cervical neck support. Compare on Shop or customise via [mp-config](/mp-config).",
          },
          "zh-CN": {
            question: "高级版比基础版多了什么？",
            answer:
              "高级版配备更高规格部件与配件选项（如颈椎支撑）。可在商店对比，或通过 [mp-config](/mp-config) 定制。",
          },
        },
      },
      {
        slug: "cervical-support",
        content: {
          "en-US": {
            question: "Does Premium include cervical neck support?",
            answer:
              "Premium can include cervical neck support as an accessory option. Ask in-store or during customisation if you need targeted neck contouring.",
          },
          "zh-CN": {
            question: "高级版包含颈椎支撑吗？",
            answer:
              "高级版可将颈椎支撑作为配件选项。如需针对性颈曲支撑，可到店咨询或在定制时说明。",
          },
        },
      },
      {
        slug: "fit-difference",
        content: {
          "en-US": {
            question: "Is the sizing process the same as Basic?",
            answer:
              "Yes — shoulder, neck, and head measurements still drive size and profile. Premium changes materials and accessories, not the measurement logic.",
          },
          "zh-CN": {
            question: "尺寸流程和基础版一样吗？",
            answer:
              "一样 — 仍由肩、颈、头测量决定尺寸与轮廓。高级版改变的是材料与配件，不是测量逻辑。",
          },
        },
      },
      {
        slug: "care-premium",
        content: {
          "en-US": {
            question: "How do I care for Premium Mpillow?",
            answer:
              "Follow [Mpillow Care](/mp-care): wash covers separately, protect fillings, and use the vacuum bag for travel. More in [Global FAQ](/faq).",
          },
          "zh-CN": {
            question: "高级版 Mpillow 如何护理？",
            answer:
              "遵循 [Mpillow 护理](/mp-care)：外套分开洗、保护填充、出行用真空袋。更多见[常见问题](/faq)。",
          },
        },
      },
    ],
  },
  {
    productSlug: "mbolster",
    titles: { "en-US": "Mbolster FAQs", "zh-CN": "Mbolster 常见问题" },
    items: [
      {
        slug: "bolster-vs-pillow",
        content: {
          "en-US": {
            question: "How is Mbolster different from Mpillow?",
            answer:
              "Mpillow is a head pillow sized to shoulder/neck/head. Mbolster is a length-based bolster for body support. Customise at [mbolster-config](/mbolster-config).",
          },
          "zh-CN": {
            question: "Mbolster 和 Mpillow 有什么不同？",
            answer:
              "Mpillow 是按肩/颈/头定制的头枕；Mbolster 是按长度定制的身体支撑抱枕。定制请用 [mbolster-config](/mbolster-config)。",
          },
        },
      },
      {
        slug: "lengths",
        content: {
          "en-US": {
            question: "What lengths are available?",
            answer:
              "Length options are shown in the shop variants and the [mbolster-config](/mbolster-config) wizard. Pick based on height and how you hug or side-sleep with the bolster.",
          },
          "zh-CN": {
            question: "有哪些长度可选？",
            answer:
              "长度选项见商店规格与 [mbolster-config](/mbolster-config) 向导。可按身高及侧睡/环抱习惯选择。",
          },
        },
      },
      {
        slug: "wash-bolster",
        content: {
          "en-US": {
            question: "Can I wash the Mbolster cover?",
            answer:
              "Yes — wash covers per care labels. Keep fillings dry and use a laundry bag when washing with other items. See [Global FAQ](/faq) for care tips.",
          },
          "zh-CN": {
            question: "Mbolster 外套可以洗吗？",
            answer:
              "可以 — 按护理标签清洗外套，保持填充干燥，与其他衣物同洗时用洗衣袋。护理提示见[常见问题](/faq)。",
          },
        },
      },
    ],
  },
];
